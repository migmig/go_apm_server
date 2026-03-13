package exporter

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/migmig/go_apm_server/internal/config"
	"github.com/migmig/go_apm_server/internal/processor"
	"github.com/migmig/go_apm_server/internal/storage"
	"go.opentelemetry.io/collector/pdata/plog/plogotlp"
	"go.opentelemetry.io/collector/pdata/pmetric/pmetricotlp"
	"go.opentelemetry.io/collector/pdata/ptrace/ptraceotlp"
)

type OTLPClient struct {
	cfg        config.ExporterEndpoint
	httpClient *http.Client
}

func NewOTLPClient(cfg config.ExporterEndpoint) *OTLPClient {
	timeout := 10 * time.Second
	if cfg.Timeout != "" {
		if d, err := time.ParseDuration(cfg.Timeout); err == nil {
			timeout = d
		}
	}

	return &OTLPClient{
		cfg: cfg,
		httpClient: &http.Client{
			Timeout: timeout,
		},
	}
}

func (c *OTLPClient) ExportSpans(ctx context.Context, spans []storage.Span) error {
	td := processor.ToOTLPTraces(spans)
	req := ptraceotlp.NewExportRequestFromTraces(td)

	data, err := req.MarshalProto()
	if err != nil {
		return fmt.Errorf("marshal traces: %w", err)
	}

	url := c.cfg.URL
	if c.cfg.Protocol == "http" && !bytes.Contains([]byte(url), []byte("/v1/traces")) {
		// Auto-append path if missing for OTLP/HTTP
		url = url + "/v1/traces"
	}

	return c.sendHTTPRequest(ctx, url, data)
}

func (c *OTLPClient) ExportMetrics(ctx context.Context, metrics []storage.Metric) error {
	md := processor.ToOTLPMetrics(metrics)
	req := pmetricotlp.NewExportRequestFromMetrics(md)

	data, err := req.MarshalProto()
	if err != nil {
		return fmt.Errorf("marshal metrics: %w", err)
	}

	url := c.cfg.URL
	if c.cfg.Protocol == "http" && !bytes.Contains([]byte(url), []byte("/v1/metrics")) {
		url = url + "/v1/metrics"
	}

	return c.sendHTTPRequest(ctx, url, data)
}

func (c *OTLPClient) ExportLogs(ctx context.Context, logs []storage.LogRecord) error {
	ld := processor.ToOTLPLogs(logs)
	req := plogotlp.NewExportRequestFromLogs(ld)

	data, err := req.MarshalProto()
	if err != nil {
		return fmt.Errorf("marshal logs: %w", err)
	}

	url := c.cfg.URL
	if c.cfg.Protocol == "http" && !bytes.Contains([]byte(url), []byte("/v1/logs")) {
		url = url + "/v1/logs"
	}

	return c.sendHTTPRequest(ctx, url, data)
}

func (c *OTLPClient) ExportRaw(ctx context.Context, signalType string, data []byte) error {
	url := c.cfg.URL
	if c.cfg.Protocol == "http" && !bytes.Contains([]byte(url), []byte("/v1/"+signalType)) {
		url = url + "/v1/" + signalType
	}
	return c.sendHTTPRequest(ctx, url, data)
}

func (c *OTLPClient) MarshalSpans(spans []storage.Span) ([]byte, error) {
	td := processor.ToOTLPTraces(spans)
	return ptraceotlp.NewExportRequestFromTraces(td).MarshalProto()
}

func (c *OTLPClient) MarshalMetrics(metrics []storage.Metric) ([]byte, error) {
	md := processor.ToOTLPMetrics(metrics)
	return pmetricotlp.NewExportRequestFromMetrics(md).MarshalProto()
}

func (c *OTLPClient) MarshalLogs(logs []storage.LogRecord) ([]byte, error) {
	ld := processor.ToOTLPLogs(logs)
	return plogotlp.NewExportRequestFromLogs(ld).MarshalProto()
}

func (c *OTLPClient) sendHTTPRequest(ctx context.Context, url string, data []byte) error {
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(data))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/x-protobuf")
	for k, v := range c.cfg.Headers {
		req.Header.Set(k, v)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		return fmt.Errorf("http error: %s", resp.Status)
	}

	return nil
}
