package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/migmig/go_apm_server/internal/config"
	"github.com/migmig/go_apm_server/internal/storage"
)

func testConfig() *config.Config {
	return &config.Config{
		Server:   config.ServerConfig{APIPort: 8080},
		Receiver: config.ReceiverConfig{GRPCPort: 4317, HTTPPort: 4318},
		Processor: config.ProcessorConfig{
			BatchSize:     1000,
			FlushInterval: "2s",
			QueueSize:     10000,
			DropOnFull:    true,
		},
		Storage: config.StorageConfig{Path: "./data/apm.db", RetentionDays: 7},
	}
}

func setupTestServer(t *testing.T) (*Handler, *storage.SQLiteStorage) {
	t.Helper()
	dir := t.TempDir()
	db, err := storage.NewSQLite(context.Background(), filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatalf("create db: %v", err)
	}
	t.Cleanup(func() { db.Close() })

	// Seed data
	db.InsertSpans(context.Background(), []storage.Span{
		{TraceID: "abc123", SpanID: "span1", ParentSpanID: "", ServiceName: "test-svc", SpanName: "GET /api", SpanKind: 2, StartTime: 1000000000, EndTime: 1100000000, DurationNs: 100000000, StatusCode: 1, Attributes: map[string]any{"http.method": "GET"}, ResourceAttributes: map[string]any{"service.name": "test-svc"}},
		{TraceID: "abc123", SpanID: "span2", ParentSpanID: "span1", ServiceName: "test-svc", SpanName: "DB query", SpanKind: 3, StartTime: 1010000000, EndTime: 1080000000, DurationNs: 70000000, StatusCode: 1, Attributes: map[string]any{}, ResourceAttributes: map[string]any{}},
	})
	db.InsertLogs(context.Background(), []storage.LogRecord{
		{ServiceName: "test-svc", SeverityNumber: 9, SeverityText: "INFO", Body: "test log", Timestamp: 1000000000, Attributes: map[string]any{}, ResourceAttributes: map[string]any{}},
	})

	return NewHandler(db, testConfig(), NewHub(db)), db
}

func TestHealthEndpoint(t *testing.T) {
	h, _ := setupTestServer(t)
	req := httptest.NewRequest("GET", "/health", nil)
	w := httptest.NewRecorder()
	h.HandleHealth(w, req)

	if w.Code != 200 {
		t.Errorf("expected 200, got %d", w.Code)
	}
	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["status"] != "ok" {
		t.Errorf("expected ok, got %s", resp["status"])
	}
}

func TestServicesEndpoint(t *testing.T) {
	h, _ := setupTestServer(t)
	req := httptest.NewRequest("GET", "/api/services", nil)
	w := httptest.NewRecorder()
	h.HandleGetServices(w, req)

	if w.Code != 200 {
		t.Errorf("expected 200, got %d", w.Code)
	}
	var resp map[string][]storage.ServiceInfo
	json.NewDecoder(w.Body).Decode(&resp)
	if len(resp["services"]) != 1 {
		t.Errorf("expected 1 service, got %d", len(resp["services"]))
	}
	if resp["services"][0].Name != "test-svc" {
		t.Errorf("expected test-svc, got %s", resp["services"][0].Name)
	}
}

func TestTracesEndpoint(t *testing.T) {
	h, _ := setupTestServer(t)
	req := httptest.NewRequest("GET", "/api/traces", nil)
	w := httptest.NewRecorder()
	h.HandleGetTraces(w, req)

	if w.Code != 200 {
		t.Errorf("expected 200, got %d", w.Code)
	}
	var resp map[string]any
	json.NewDecoder(w.Body).Decode(&resp)
	total := resp["total"].(float64)
	if total != 1 {
		t.Errorf("expected 1 trace, got %v", total)
	}
}

func TestTraceDetailEndpoint(t *testing.T) {
	h, _ := setupTestServer(t)

	// Go 1.22 PathValue requires using the actual ServeMux
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/traces/{traceId}", h.HandleGetTraceDetail)

	req := httptest.NewRequest("GET", "/api/traces/abc123", nil)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != 200 {
		t.Errorf("expected 200, got %d", w.Code)
	}
	var resp map[string]any
	json.NewDecoder(w.Body).Decode(&resp)
	spans := resp["spans"].([]any)
	if len(spans) != 2 {
		t.Errorf("expected 2 spans, got %d", len(spans))
	}
}

func TestTraceDetailNotFound(t *testing.T) {
	h, _ := setupTestServer(t)
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/traces/{traceId}", h.HandleGetTraceDetail)

	req := httptest.NewRequest("GET", "/api/traces/nonexistent", nil)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != 404 {
		t.Errorf("expected 404, got %d", w.Code)
	}
}

func TestLogsEndpoint(t *testing.T) {
	h, _ := setupTestServer(t)
	req := httptest.NewRequest("GET", "/api/logs", nil)
	w := httptest.NewRecorder()
	h.HandleGetLogs(w, req)

	if w.Code != 200 {
		t.Errorf("expected 200, got %d", w.Code)
	}
	var resp map[string]any
	json.NewDecoder(w.Body).Decode(&resp)
	total := resp["total"].(float64)
	if total != 1 {
		t.Errorf("expected 1 log, got %v", total)
	}
}

func TestServiceDetailEndpoint(t *testing.T) {
	h, _ := setupTestServer(t)
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/services/{serviceName}", h.HandleGetServiceDetail)

	req := httptest.NewRequest("GET", "/api/services/test-svc", nil)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != 200 {
		t.Errorf("expected 200, got %d", w.Code)
	}
	var resp storage.ServiceInfo
	json.NewDecoder(w.Body).Decode(&resp)
	if resp.Name != "test-svc" {
		t.Errorf("expected test-svc, got %s", resp.Name)
	}
	if resp.SpanCount != 2 {
		t.Errorf("expected 2 spans, got %d", resp.SpanCount)
	}
}

func TestServiceDetailNotFound(t *testing.T) {
	h, _ := setupTestServer(t)
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/services/{serviceName}", h.HandleGetServiceDetail)

	req := httptest.NewRequest("GET", "/api/services/nonexistent", nil)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != 404 {
		t.Errorf("expected 404, got %d", w.Code)
	}
}

func TestStatsEndpoint(t *testing.T) {
	h, _ := setupTestServer(t)
	req := httptest.NewRequest("GET", "/api/stats?since=0", nil)
	w := httptest.NewRecorder()
	h.HandleGetStats(w, req)

	if w.Code != 200 {
		t.Errorf("expected 200, got %d", w.Code)
	}
	var resp storage.Stats
	json.NewDecoder(w.Body).Decode(&resp)
	if resp.TotalSpans != 2 {
		t.Errorf("expected 2 spans, got %d", resp.TotalSpans)
	}
	if resp.TotalLogs != 1 {
		t.Errorf("expected 1 log, got %d", resp.TotalLogs)
	}
}

func TestConfigEndpoint(t *testing.T) {
	h, _ := setupTestServer(t)
	req := httptest.NewRequest("GET", "/api/config", nil)
	w := httptest.NewRecorder()
	h.HandleGetConfig(w, req)

	if w.Code != 200 {
		t.Errorf("expected 200, got %d", w.Code)
	}
	var resp config.Config
	json.NewDecoder(w.Body).Decode(&resp)
	if resp.Server.APIPort != 8080 {
		t.Errorf("expected api_port 8080, got %d", resp.Server.APIPort)
	}
	if resp.Receiver.GRPCPort != 4317 {
		t.Errorf("expected grpc_port 4317, got %d", resp.Receiver.GRPCPort)
	}
	if resp.Storage.RetentionDays != 7 {
		t.Errorf("expected retention_days 7, got %d", resp.Storage.RetentionDays)
	}
}

func TestSystemEndpoint(t *testing.T) {
	h, _ := setupTestServer(t)
	req := httptest.NewRequest("GET", "/api/system", nil)
	w := httptest.NewRecorder()
	h.HandleGetSystem(w, req)

	if w.Code != 200 {
		t.Errorf("expected 200, got %d", w.Code)
	}
	var resp map[string]any
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["version"] != "v0.5.0-alpha" {
		t.Errorf("expected v0.5.0-alpha, got %v", resp["version"])
	}
	if resp["go_version"] == nil || resp["go_version"] == "" {
		t.Error("expected go_version to be present")
	}
	if resp["uptime_seconds"] == nil {
		t.Error("expected uptime_seconds to be present")
	}
}
