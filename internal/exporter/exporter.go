package exporter

import (
	"context"
	"fmt"
	"os"
	"sync"
	"time"

	"github.com/migmig/go_apm_server/internal/config"
	"github.com/migmig/go_apm_server/internal/storage"
)

// Forwarder manages multiple external OTLP exporters
type Forwarder struct {
	config config.ExporterConfig

	clients         map[string]*OTLPClient
	circuitBreakers map[string]*CircuitBreaker
	dlqManagers     map[string]*DLQManager
	spanCh          chan []storage.Span
	metricCh        chan []storage.Metric
	logCh           chan []storage.LogRecord

	wg     sync.WaitGroup
	ctx    context.Context
	cancel context.CancelFunc
}

func NewForwarder(cfg config.ExporterConfig) *Forwarder {
	ctx, cancel := context.WithCancel(context.Background())
	clients := make(map[string]*OTLPClient)
	cbs := make(map[string]*CircuitBreaker)
	dlqs := make(map[string]*DLQManager)

	for _, ep := range cfg.Endpoints {
		clients[ep.Name] = NewOTLPClient(ep)
		cbs[ep.Name] = NewCircuitBreaker(ep.Name, 5, 30*time.Second)
		dlqs[ep.Name] = NewDLQManager(ep.Name, ep.DLQ)
	}

	return &Forwarder{
		config:          cfg,
		clients:         clients,
		circuitBreakers: cbs,
		dlqManagers:     dlqs,
		spanCh:          make(chan []storage.Span, 100),
		metricCh:        make(chan []storage.Metric, 100),
		logCh:           make(chan []storage.LogRecord, 100),
		ctx:             ctx,
		cancel:          cancel,
	}
}

func (f *Forwarder) Start() {
	if len(f.config.Endpoints) == 0 {
		return
	}

	f.wg.Add(1)
	go f.workerLoop()

	// Start retry workers for each endpoint
	for _, ep := range f.config.Endpoints {
		if ep.DLQ.Enabled {
			f.wg.Add(1)
			go f.retryWorker(ep)
		}
	}
}

func (f *Forwarder) Stop() {
	f.cancel()
	f.wg.Wait()
}

type ExporterStatus struct {
	Endpoints []EndpointStatus `json:"endpoints"`
}

type EndpointStatus struct {
	Name        string   `json:"name"`
	URL         string   `json:"url"`
	Protocol    string   `json:"protocol"`
	State       string   `json:"state"`
	SignalTypes []string `json:"signal_types"`
	DLQCount    int      `json:"dlq_count"`
}

func (f *Forwarder) GetStatus() ExporterStatus {
	status := ExporterStatus{
		Endpoints: make([]EndpointStatus, 0, len(f.config.Endpoints)),
	}

	stateNames := map[State]string{
		StateClosed:   "CLOSED",
		StateOpen:     "OPEN",
		StateHalfOpen: "HALF-OPEN",
	}

	for _, ep := range f.config.Endpoints {
		s := EndpointStatus{
			Name:        ep.Name,
			URL:         ep.URL,
			Protocol:    ep.Protocol,
			SignalTypes: ep.SignalTypes,
		}

		if cb, ok := f.circuitBreakers[ep.Name]; ok {
			s.State = stateNames[cb.State()]
		}

		if dlq, ok := f.dlqManagers[ep.Name]; ok {
			count := 0
			for _, sig := range []string{"traces", "metrics", "logs"} {
				files, _ := dlq.ListFiles(sig)
				count += len(files)
			}
			s.DLQCount = count
		}

		status.Endpoints = append(status.Endpoints, s)
	}

	return status
}

func (f *Forwarder) retryWorker(ep config.ExporterEndpoint) {
	defer f.wg.Done()

	interval := 1 * time.Minute
	if ep.DLQ.RetryInterval != "" {
		if d, err := time.ParseDuration(ep.DLQ.RetryInterval); err == nil {
			interval = d
		}
	}

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-f.ctx.Done():
			return
		case <-ticker.C:
			f.processDLQ(ep)
		}
	}
}

func (f *Forwarder) processDLQ(ep config.ExporterEndpoint) {
	client := f.clients[ep.Name]
	cb := f.circuitBreakers[ep.Name]
	dlq := f.dlqManagers[ep.Name]
	if client == nil || cb == nil || dlq == nil {
		return
	}

	signals := []string{"traces", "metrics", "logs"}
	for _, sig := range signals {
		if !contains(ep.SignalTypes, sig) {
			continue
		}

		files, _ := dlq.ListFiles(sig)
		for _, file := range files {
			// If circuit is open, stop processing this endpoint for now
			if !cb.Allow() {
				return
			}

			data, err := os.ReadFile(file)
			if err != nil {
				continue
			}

			if err := client.ExportRaw(f.ctx, sig, data); err != nil {
				cb.Failure()
				return // Stop on first error to avoid massive failures
			}

			cb.Success()
			dlq.Delete(file)
		}
	}
}

func (f *Forwarder) ForwardSpans(spans []storage.Span) {
	if len(f.config.Endpoints) == 0 || len(spans) == 0 {
		return
	}
	select {
	case f.spanCh <- spans:
	default:
		// Queue full, drop or log
		fmt.Println("Exporter span queue full, dropping batch")
	}
}

func (f *Forwarder) ForwardMetrics(metrics []storage.Metric) {
	if len(f.config.Endpoints) == 0 || len(metrics) == 0 {
		return
	}
	select {
	case f.metricCh <- metrics:
	default:
		fmt.Println("Exporter metric queue full, dropping batch")
	}
}

func (f *Forwarder) ForwardLogs(logs []storage.LogRecord) {
	if len(f.config.Endpoints) == 0 || len(logs) == 0 {
		return
	}
	select {
	case f.logCh <- logs:
	default:
		fmt.Println("Exporter log queue full, dropping batch")
	}
}

func (f *Forwarder) workerLoop() {
	defer f.wg.Done()

	for {
		select {
		case <-f.ctx.Done():
			return
		case spans := <-f.spanCh:
			f.broadcastSpans(spans)
		case metrics := <-f.metricCh:
			f.broadcastMetrics(metrics)
		case logs := <-f.logCh:
			f.broadcastLogs(logs)
		}
	}
}

func (f *Forwarder) broadcastSpans(spans []storage.Span) {
	for _, ep := range f.config.Endpoints {
		if !contains(ep.SignalTypes, "traces") {
			continue
		}
		client := f.clients[ep.Name]
		cb := f.circuitBreakers[ep.Name]
		dlq := f.dlqManagers[ep.Name]
		if client == nil || cb == nil {
			continue
		}

		if !cb.Allow() {
			if dlq != nil && ep.DLQ.Enabled {
				if data, err := client.MarshalSpans(spans); err == nil {
					dlq.Save("traces", data)
				}
			}
			continue
		}

		if err := client.ExportSpans(f.ctx, spans); err != nil {
			fmt.Printf("Error broadcasting spans to %s: %v\n", ep.Name, err)
			cb.Failure()
			if dlq != nil && ep.DLQ.Enabled {
				if data, err := client.MarshalSpans(spans); err == nil {
					dlq.Save("traces", data)
				}
			}
		} else {
			cb.Success()
		}
	}
}

func (f *Forwarder) broadcastMetrics(metrics []storage.Metric) {
	for _, ep := range f.config.Endpoints {
		if !contains(ep.SignalTypes, "metrics") {
			continue
		}
		client := f.clients[ep.Name]
		cb := f.circuitBreakers[ep.Name]
		dlq := f.dlqManagers[ep.Name]
		if client == nil || cb == nil {
			continue
		}

		if !cb.Allow() {
			if dlq != nil && ep.DLQ.Enabled {
				if data, err := client.MarshalMetrics(metrics); err == nil {
					dlq.Save("metrics", data)
				}
			}
			continue
		}

		if err := client.ExportMetrics(f.ctx, metrics); err != nil {
			fmt.Printf("Error broadcasting metrics to %s: %v\n", ep.Name, err)
			cb.Failure()
			if dlq != nil && ep.DLQ.Enabled {
				if data, err := client.MarshalMetrics(metrics); err == nil {
					dlq.Save("metrics", data)
				}
			}
		} else {
			cb.Success()
		}
	}
}

func (f *Forwarder) broadcastLogs(logs []storage.LogRecord) {
	for _, ep := range f.config.Endpoints {
		if !contains(ep.SignalTypes, "logs") {
			continue
		}
		client := f.clients[ep.Name]
		cb := f.circuitBreakers[ep.Name]
		dlq := f.dlqManagers[ep.Name]
		if client == nil || cb == nil {
			continue
		}

		if !cb.Allow() {
			if dlq != nil && ep.DLQ.Enabled {
				if data, err := client.MarshalLogs(logs); err == nil {
					dlq.Save("logs", data)
				}
			}
			continue
		}

		if err := client.ExportLogs(f.ctx, logs); err != nil {
			fmt.Printf("Error broadcasting logs to %s: %v\n", ep.Name, err)
			cb.Failure()
			if dlq != nil && ep.DLQ.Enabled {
				if data, err := client.MarshalLogs(logs); err == nil {
					dlq.Save("logs", data)
				}
			}
		} else {
			cb.Success()
		}
	}
}

func contains(slice []string, val string) bool {
	for _, item := range slice {
		if item == val {
			return true
		}
	}
	return false
}
