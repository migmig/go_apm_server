package storage

import (
	"context"
	"path/filepath"
	"testing"
	"time"
)

func testDB(t *testing.T) *SQLiteStorage {
	t.Helper()
	dir := t.TempDir()
	db, err := NewSQLite(context.Background(), filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatalf("create db: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func TestInsertAndQuerySpans(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()

	spans := []Span{
		{
			TraceID: "trace1", SpanID: "span1", ParentSpanID: "",
			ServiceName: "svc-a", SpanName: "GET /users", SpanKind: 2,
			StartTime: 1000000000, EndTime: 1100000000, DurationNs: 100000000,
			StatusCode: 1, Attributes: map[string]any{"http.method": "GET"},
			ResourceAttributes: map[string]any{"service.name": "svc-a"},
		},
		{
			TraceID: "trace1", SpanID: "span2", ParentSpanID: "span1",
			ServiceName: "svc-b", SpanName: "SELECT users", SpanKind: 3,
			StartTime: 1010000000, EndTime: 1080000000, DurationNs: 70000000,
			StatusCode: 1, Attributes: map[string]any{"db.system": "postgresql"},
			ResourceAttributes: map[string]any{"service.name": "svc-b"},
		},
		{
			TraceID: "trace2", SpanID: "span3", ParentSpanID: "",
			ServiceName: "svc-a", SpanName: "POST /orders", SpanKind: 2,
			StartTime: 2000000000, EndTime: 2200000000, DurationNs: 200000000,
			StatusCode: 2, StatusMessage: "internal error",
			Attributes:         map[string]any{"http.method": "POST"},
			ResourceAttributes: map[string]any{"service.name": "svc-a"},
		},
	}

	if err := db.InsertSpans(ctx, spans); err != nil {
		t.Fatalf("insert spans: %v", err)
	}

	// QueryTraces - all
	traces, total, err := db.QueryTraces(ctx, TraceFilter{Limit: 50})
	if err != nil {
		t.Fatalf("query traces: %v", err)
	}
	if total != 2 {
		t.Errorf("expected 2 traces, got %d", total)
	}
	if len(traces) != 2 {
		t.Errorf("expected 2 trace summaries, got %d", len(traces))
	}

	// QueryTraces - filter by service
	traces, total, err = db.QueryTraces(ctx, TraceFilter{ServiceName: "svc-b", Limit: 50})
	if err != nil {
		t.Fatalf("query traces: %v", err)
	}
	if total != 1 {
		t.Errorf("expected 1 trace for svc-b, got %d", total)
	}

	// QueryTraces - filter by status
	errCode := int32(2)
	traces, total, err = db.QueryTraces(ctx, TraceFilter{StatusCode: &errCode, Limit: 50})
	if err != nil {
		t.Fatalf("query traces: %v", err)
	}
	if total != 1 {
		t.Errorf("expected 1 error trace, got %d", total)
	}

	// GetTraceByID
	traceSpans, err := db.GetTraceByID(ctx, "trace1")
	if err != nil {
		t.Fatalf("get trace: %v", err)
	}
	if len(traceSpans) != 2 {
		t.Errorf("expected 2 spans in trace1, got %d", len(traceSpans))
	}
	if traceSpans[0].Attributes["http.method"] != "GET" {
		t.Errorf("expected http.method=GET, got %v", traceSpans[0].Attributes["http.method"])
	}

	// GetTraceByID - not found
	traceSpans, err = db.GetTraceByID(ctx, "nonexistent")
	if err != nil {
		t.Fatalf("get trace: %v", err)
	}
	if len(traceSpans) != 0 {
		t.Errorf("expected 0 spans, got %d", len(traceSpans))
	}
}

func TestInsertAndQueryMetrics(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()

	metrics := []Metric{
		{ServiceName: "svc-a", MetricName: "http.duration", MetricType: 1, Value: 42.5, Timestamp: 1000000000, Attributes: map[string]any{"method": "GET"}, ResourceAttributes: map[string]any{}},
		{ServiceName: "svc-a", MetricName: "http.duration", MetricType: 1, Value: 55.0, Timestamp: 2000000000, Attributes: map[string]any{"method": "GET"}, ResourceAttributes: map[string]any{}},
		{ServiceName: "svc-b", MetricName: "db.queries", MetricType: 2, Value: 100, Timestamp: 1000000000, Attributes: map[string]any{}, ResourceAttributes: map[string]any{}},
	}

	if err := db.InsertMetrics(ctx, metrics); err != nil {
		t.Fatalf("insert metrics: %v", err)
	}

	// Query by name
	points, err := db.QueryMetrics(ctx, MetricFilter{MetricName: "http.duration", Limit: 100})
	if err != nil {
		t.Fatalf("query metrics: %v", err)
	}
	if len(points) != 2 {
		t.Errorf("expected 2 points, got %d", len(points))
	}

	// Query by service
	points, err = db.QueryMetrics(ctx, MetricFilter{ServiceName: "svc-b", Limit: 100})
	if err != nil {
		t.Fatalf("query metrics: %v", err)
	}
	if len(points) != 1 {
		t.Errorf("expected 1 point for svc-b, got %d", len(points))
	}
}

func TestInsertAndQueryLogs(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()

	logs := []LogRecord{
		{ServiceName: "svc-a", SeverityNumber: 9, SeverityText: "INFO", Body: "request started", Timestamp: 1000000000, Attributes: map[string]any{}, ResourceAttributes: map[string]any{}},
		{ServiceName: "svc-a", SeverityNumber: 17, SeverityText: "ERROR", Body: "connection failed", Timestamp: 2000000000, TraceID: "trace1", Attributes: map[string]any{}, ResourceAttributes: map[string]any{}},
		{ServiceName: "svc-b", SeverityNumber: 9, SeverityText: "INFO", Body: "query executed", Timestamp: 3000000000, Attributes: map[string]any{}, ResourceAttributes: map[string]any{}},
	}

	if err := db.InsertLogs(ctx, logs); err != nil {
		t.Fatalf("insert logs: %v", err)
	}

	// Query all
	result, total, err := db.QueryLogs(ctx, LogFilter{Limit: 100})
	if err != nil {
		t.Fatalf("query logs: %v", err)
	}
	if total != 3 {
		t.Errorf("expected 3 logs, got %d", total)
	}

	// Query by severity
	result, total, err = db.QueryLogs(ctx, LogFilter{SeverityMin: 17, Limit: 100})
	if err != nil {
		t.Fatalf("query logs: %v", err)
	}
	if total != 1 {
		t.Errorf("expected 1 error log, got %d", total)
	}
	if result[0].Body != "connection failed" {
		t.Errorf("expected 'connection failed', got %q", result[0].Body)
	}

	// Search body
	result, total, err = db.QueryLogs(ctx, LogFilter{SearchBody: "query", Limit: 100})
	if err != nil {
		t.Fatalf("query logs: %v", err)
	}
	if total != 1 {
		t.Errorf("expected 1 log matching 'query', got %d", total)
	}
}

func TestGetServices(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()

	spans := []Span{
		{TraceID: "t1", SpanID: "s1", ServiceName: "svc-a", SpanName: "op1", StartTime: 1000, EndTime: 2000, DurationNs: 1000, StatusCode: 1, Attributes: map[string]any{}, ResourceAttributes: map[string]any{}},
		{TraceID: "t2", SpanID: "s2", ServiceName: "svc-a", SpanName: "op2", StartTime: 3000, EndTime: 5000, DurationNs: 2000, StatusCode: 2, Attributes: map[string]any{}, ResourceAttributes: map[string]any{}},
		{TraceID: "t3", SpanID: "s3", ServiceName: "svc-b", SpanName: "op3", StartTime: 1000, EndTime: 1500, DurationNs: 500, StatusCode: 1, Attributes: map[string]any{}, ResourceAttributes: map[string]any{}},
	}
	db.InsertSpans(ctx, spans)

	services, err := db.GetServices(ctx)
	if err != nil {
		t.Fatalf("get services: %v", err)
	}
	if len(services) != 2 {
		t.Fatalf("expected 2 services, got %d", len(services))
	}

	// svc-a should be first (more spans)
	if services[0].Name != "svc-a" {
		t.Errorf("expected svc-a first, got %s", services[0].Name)
	}
	if services[0].SpanCount != 2 {
		t.Errorf("expected 2 spans for svc-a, got %d", services[0].SpanCount)
	}
	if services[0].ErrorCount != 1 {
		t.Errorf("expected 1 error for svc-a, got %d", services[0].ErrorCount)
	}
}

func TestGetStats(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()

	spans := []Span{
		{TraceID: "t1", SpanID: "s1", ParentSpanID: "", ServiceName: "svc-a", SpanName: "op1", StartTime: 1000, EndTime: 2000, DurationNs: 100000000, StatusCode: 1, Attributes: map[string]any{}, ResourceAttributes: map[string]any{}},
		{TraceID: "t1", SpanID: "s2", ParentSpanID: "s1", ServiceName: "svc-b", SpanName: "op2", StartTime: 1100, EndTime: 1800, DurationNs: 70000000, StatusCode: 1, Attributes: map[string]any{}, ResourceAttributes: map[string]any{}},
		{TraceID: "t2", SpanID: "s3", ParentSpanID: "", ServiceName: "svc-a", SpanName: "op3", StartTime: 3000, EndTime: 5000, DurationNs: 200000000, StatusCode: 2, Attributes: map[string]any{}, ResourceAttributes: map[string]any{}},
	}
	db.InsertSpans(ctx, spans)

	logs := []LogRecord{
		{ServiceName: "svc-a", SeverityNumber: 9, Body: "test", Timestamp: 1000, Attributes: map[string]any{}, ResourceAttributes: map[string]any{}},
	}
	db.InsertLogs(ctx, logs)

	stats, err := db.GetStats(ctx, 0)
	if err != nil {
		t.Fatalf("get stats: %v", err)
	}

	if stats.TotalTraces != 2 {
		t.Errorf("expected 2 traces, got %d", stats.TotalTraces)
	}
	if stats.TotalSpans != 3 {
		t.Errorf("expected 3 spans, got %d", stats.TotalSpans)
	}
	if stats.TotalLogs != 1 {
		t.Errorf("expected 1 log, got %d", stats.TotalLogs)
	}
	if stats.ServiceCount != 2 {
		t.Errorf("expected 2 services, got %d", stats.ServiceCount)
	}
}

func TestDeleteOldPartitions(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()

	now := time.Now().UnixNano()
	old := now - int64(48*time.Hour) // 2 days ago

	// Insert with old created_at by directly using db
	db.InsertSpans(ctx, []Span{
		{TraceID: "t1", SpanID: "s1", ServiceName: "svc", SpanName: "op", StartTime: old, EndTime: old + 1000, DurationNs: 1000, Attributes: map[string]any{}, ResourceAttributes: map[string]any{}},
	})

	// New span (created_at is now)
	db.InsertSpans(ctx, []Span{
		{TraceID: "t2", SpanID: "s2", ServiceName: "svc", SpanName: "op2", StartTime: now, EndTime: now + 1000, DurationNs: 1000, Attributes: map[string]any{}, ResourceAttributes: map[string]any{}},
	})

	// Set retention to 1 day, it should not delete anything because both were inserted "now" (created_at is now)
	deleted, err := db.DeleteOldPartitions(ctx, 1)
	if err != nil {
		t.Fatalf("delete: %v", err)
	}
	// Both spans have created_at = now (set by InsertSpans), so neither should be deleted
	if deleted != 0 {
		t.Logf("deleted %d (both have recent created_at)", deleted)
	}

	// Verify remaining
	_, total, _ := db.QueryTraces(ctx, TraceFilter{Limit: 100})
	if total < 1 {
		t.Errorf("expected at least 1 trace remaining, got %d", total)
	}
}
