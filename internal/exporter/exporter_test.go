package exporter

import (
	"net/http"
	"net/http/httptest"
	"os"
	"sync/atomic"
	"testing"
	"time"

	"github.com/migmig/go_apm_server/internal/config"
	"github.com/migmig/go_apm_server/internal/storage"
)

func TestExporterIntegration(t *testing.T) {
	// 1. Mock OTLP Receiver (HTTP)
	var requestCount int32
	var failMode int32 // 0: success, 1: fail

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if atomic.LoadInt32(&failMode) == 1 {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		atomic.AddInt32(&requestCount, 1)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	// 2. Setup Exporter Config
	tempDir := t.TempDir()
	cfg := config.ExporterConfig{
		Endpoints: []config.ExporterEndpoint{
			{
				Name:        "test-dest",
				URL:         server.URL,
				Protocol:    "http",
				SignalTypes: []string{"traces"},
				Timeout:     "1s",
				DLQ: config.DLQConfig{
					Enabled:       true,
					Path:          tempDir,
					RetryInterval: "100ms",
				},
			},
		},
	}

	fwd := NewForwarder(cfg)
	fwd.Start()
	defer fwd.Stop()

	// --- Scenario 1: Successful Forwarding ---
	spans := []storage.Span{{TraceID: "t1", SpanID: "s1", ServiceName: "svc1"}}
	fwd.ForwardSpans(spans)

	// Wait for async processing
	time.Sleep(200 * time.Millisecond)
	if atomic.LoadInt32(&requestCount) != 1 {
		t.Errorf("expected 1 request received, got %d", requestCount)
	}

	status := fwd.GetStatus()
	if status.Endpoints[0].State != "CLOSED" {
		t.Errorf("expected state CLOSED, got %s", status.Endpoints[0].State)
	}

	// --- Scenario 2: Failure & Circuit Breaker ---
	atomic.StoreInt32(&failMode, 1) // Start failing

	// Fail 5 times to trigger OPEN
	for i := 0; i < 5; i++ {
		fwd.ForwardSpans(spans)
		time.Sleep(50 * time.Millisecond)
	}

	status = fwd.GetStatus()
	if status.Endpoints[0].State != "OPEN" {
		t.Errorf("expected state OPEN after 5 failures, got %s", status.Endpoints[0].State)
	}

	// --- Scenario 3: DLQ Storage ---
	// When OPEN, new forwards should go to DLQ
	fwd.ForwardSpans([]storage.Span{{TraceID: "t-dlq", SpanID: "s-dlq", ServiceName: "svc1"}})
	time.Sleep(100 * time.Millisecond)

	status = fwd.GetStatus()
	if status.Endpoints[0].DLQCount == 0 {
		t.Error("expected items in DLQ, got 0")
	}

	// --- Scenario 4: Recovery ---
	atomic.StoreInt32(&failMode, 0) // Server back to normal

	// Wait for DLQ retry worker (interval is 100ms)
	// Circuit breaker openDuration is default 30s in NewForwarder,
	// let's manually transition it for testing or wait.
	// For test speed, let's inject a shorter openDuration.
	fwd.circuitBreakers["test-dest"].openDuration = 100 * time.Millisecond
	time.Sleep(300 * time.Millisecond)

	// After retry, DLQ should be empty and state should be CLOSED
	status = fwd.GetStatus()
	if status.Endpoints[0].DLQCount != 0 {
		t.Errorf("expected empty DLQ after recovery, got %d", status.Endpoints[0].DLQCount)
	}
	if status.Endpoints[0].State != "CLOSED" {
		t.Errorf("expected state CLOSED after recovery, got %s", status.Endpoints[0].State)
	}
}

func TestDLQManager(t *testing.T) {
	tempDir := t.TempDir()
	mgr := NewDLQManager("test-ep", config.DLQConfig{
		Enabled: true,
		Path:    tempDir,
	})

	data := []byte("proto-payload")
	if err := mgr.Save("traces", data); err != nil {
		t.Fatalf("save error: %v", err)
	}

	files, err := mgr.ListFiles("traces")
	if err != nil || len(files) != 1 {
		t.Fatalf("list error: %v, count: %d", err, len(files))
	}

	readData, _ := os.ReadFile(files[0])
	if string(readData) != string(data) {
		t.Errorf("data mismatch")
	}

	if err := mgr.Delete(files[0]); err != nil {
		t.Errorf("delete error: %v", err)
	}
}
