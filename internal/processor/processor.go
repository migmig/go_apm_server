package processor

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/migmig/go_apm_server/internal/config"
	"github.com/migmig/go_apm_server/internal/storage"
)

type Processor struct {
	cfg       config.ProcessorConfig
	store     storage.Storage
	spansCh   chan storage.Span
	metricsCh chan storage.Metric
	logsCh    chan storage.LogRecord
	stopCh    chan struct{}
	wg        sync.WaitGroup
}

func New(cfg config.ProcessorConfig, store storage.Storage) *Processor {
	return &Processor{
		cfg:       cfg,
		store:     store,
		spansCh:   make(chan storage.Span, cfg.QueueSize),
		metricsCh: make(chan storage.Metric, cfg.QueueSize),
		logsCh:    make(chan storage.LogRecord, cfg.QueueSize),
		stopCh:    make(chan struct{}),
	}
}

func (p *Processor) Start(ctx context.Context) {
	flushInterval, err := time.ParseDuration(p.cfg.FlushInterval)
	if err != nil {
		flushInterval = 2 * time.Second
	}

	p.wg.Add(1)
	go func() {
		defer p.wg.Done()
		p.batchWorker(ctx, flushInterval)
	}()
}

func (p *Processor) Stop() {
	close(p.stopCh)
	p.wg.Wait()
}

func (p *Processor) PushSpans(ctx context.Context, spans []storage.Span) error {
	for _, sp := range spans {
		if p.cfg.DropOnFull {
			select {
			case p.spansCh <- sp:
			default:
				// Drop
			}
		} else {
			select {
			case p.spansCh <- sp:
			case <-ctx.Done():
				return ctx.Err()
			}
		}
	}
	return nil
}

func (p *Processor) PushMetrics(ctx context.Context, metrics []storage.Metric) error {
	for _, m := range metrics {
		if p.cfg.DropOnFull {
			select {
			case p.metricsCh <- m:
			default:
			}
		} else {
			select {
			case p.metricsCh <- m:
			case <-ctx.Done():
				return ctx.Err()
			}
		}
	}
	return nil
}

func (p *Processor) PushLogs(ctx context.Context, logs []storage.LogRecord) error {
	for _, l := range logs {
		if p.cfg.DropOnFull {
			select {
			case p.logsCh <- l:
			default:
			}
		} else {
			select {
			case p.logsCh <- l:
			case <-ctx.Done():
				return ctx.Err()
			}
		}
	}
	return nil
}

func (p *Processor) drainAndFlush(ctx context.Context, spans *[]storage.Span, metrics *[]storage.Metric, logs *[]storage.LogRecord) {
	// Drain spans
loopSpans:
	for {
		select {
		case sp := <-p.spansCh:
			*spans = append(*spans, sp)
		default:
			break loopSpans
		}
	}
	// Drain metrics
loopMetrics:
	for {
		select {
		case m := <-p.metricsCh:
			*metrics = append(*metrics, m)
		default:
			break loopMetrics
		}
	}
	// Drain logs
loopLogs:
	for {
		select {
		case l := <-p.logsCh:
			*logs = append(*logs, l)
		default:
			break loopLogs
		}
	}
}

func (p *Processor) batchWorker(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	var spansBatch []storage.Span
	var metricsBatch []storage.Metric
	var logsBatch []storage.LogRecord

	flush := func() {
		if len(spansBatch) > 0 {
			if err := p.store.InsertSpans(ctx, spansBatch); err != nil {
				fmt.Printf("failed to flush spans: %v\n", err)
			}
			spansBatch = spansBatch[:0]
		}
		if len(metricsBatch) > 0 {
			if err := p.store.InsertMetrics(ctx, metricsBatch); err != nil {
				fmt.Printf("failed to flush metrics: %v\n", err)
			}
			metricsBatch = metricsBatch[:0]
		}
		if len(logsBatch) > 0 {
			if err := p.store.InsertLogs(ctx, logsBatch); err != nil {
				fmt.Printf("failed to flush logs: %v\n", err)
			}
			logsBatch = logsBatch[:0]
		}
	}

	for {
		select {
		case <-p.stopCh:
			// Drain channels before exiting
			p.drainAndFlush(ctx, &spansBatch, &metricsBatch, &logsBatch)
			flush()
			return
		case <-ctx.Done():
			// Drain channels before exiting
			p.drainAndFlush(ctx, &spansBatch, &metricsBatch, &logsBatch)
			flush()
			return
		case sp := <-p.spansCh:
			spansBatch = append(spansBatch, sp)
			if len(spansBatch) >= p.cfg.BatchSize {
				if err := p.store.InsertSpans(ctx, spansBatch); err != nil {
					fmt.Printf("failed to flush spans: %v\n", err)
				}
				spansBatch = spansBatch[:0]
			}
		case m := <-p.metricsCh:
			metricsBatch = append(metricsBatch, m)
			if len(metricsBatch) >= p.cfg.BatchSize {
				if err := p.store.InsertMetrics(ctx, metricsBatch); err != nil {
					fmt.Printf("failed to flush metrics: %v\n", err)
				}
				metricsBatch = metricsBatch[:0]
			}
		case l := <-p.logsCh:
			logsBatch = append(logsBatch, l)
			if len(logsBatch) >= p.cfg.BatchSize {
				if err := p.store.InsertLogs(ctx, logsBatch); err != nil {
					fmt.Printf("failed to flush logs: %v\n", err)
				}
				logsBatch = logsBatch[:0]
			}
		case <-ticker.C:
			flush()
		}
	}
}
