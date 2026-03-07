package storage

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

type Storage interface {
	InsertSpans(ctx context.Context, spans []Span) error
	InsertMetrics(ctx context.Context, metrics []Metric) error
	InsertLogs(ctx context.Context, logs []LogRecord) error

	QueryTraces(ctx context.Context, filter TraceFilter) ([]TraceSummary, int64, error)
	GetTraceByID(ctx context.Context, traceID string) ([]Span, error)
	QueryMetrics(ctx context.Context, filter MetricFilter) ([]MetricDataPoint, error)
	QueryLogs(ctx context.Context, filter LogFilter) ([]LogRecord, int64, error)

	GetServices(ctx context.Context) ([]ServiceInfo, error)
	GetStats(ctx context.Context, sinceNano int64) (*Stats, error)

	DeleteOlderThan(ctx context.Context, beforeNano int64) (int64, error)
	Close() error
}

type MetricDataPoint struct {
	MetricName string         `json:"metric_name"`
	Timestamp  int64          `json:"timestamp"`
	Value      float64        `json:"value"`
	Attributes map[string]any `json:"attributes"`
}

type SQLiteStorage struct {
	db *sql.DB
}

func NewSQLite(ctx context.Context, dbPath string) (*SQLiteStorage, error) {
	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("create data dir: %w", err)
	}

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}

	pragmas := []string{
		"PRAGMA journal_mode=WAL",
		"PRAGMA synchronous=NORMAL",
		"PRAGMA busy_timeout=5000",
		"PRAGMA cache_size=-20000",
	}
	for _, p := range pragmas {
		if _, err := db.ExecContext(ctx, p); err != nil {
			db.Close()
			return nil, fmt.Errorf("pragma %q: %w", p, err)
		}
	}

	if err := migrate(ctx, db); err != nil {
		db.Close()
		return nil, fmt.Errorf("migrate: %w", err)
	}

	return &SQLiteStorage{db: db}, nil
}

func (s *SQLiteStorage) Close() error {
	return s.db.Close()
}

// --- Insert methods ---

func (s *SQLiteStorage) InsertSpans(ctx context.Context, spans []Span) error {
	if len(spans) == 0 {
		return nil
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	stmt, err := tx.PrepareContext(ctx, `INSERT INTO spans
		(trace_id, span_id, parent_span_id, service_name, span_name, span_kind,
		 start_time, end_time, duration_ns, status_code, status_message,
		 attributes, events, resource_attributes, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return fmt.Errorf("prepare: %w", err)
	}
	defer stmt.Close()

	now := time.Now().UnixNano()
	for _, sp := range spans {
		attrs, _ := json.Marshal(sp.Attributes)
		events, _ := json.Marshal(sp.Events)
		resAttrs, _ := json.Marshal(sp.ResourceAttributes)

		_, err := stmt.ExecContext(ctx,
			sp.TraceID, sp.SpanID, sp.ParentSpanID, sp.ServiceName, sp.SpanName, sp.SpanKind,
			sp.StartTime, sp.EndTime, sp.DurationNs, sp.StatusCode, sp.StatusMessage,
			string(attrs), string(events), string(resAttrs), now,
		)
		if err != nil {
			return fmt.Errorf("insert span: %w", err)
		}
	}

	return tx.Commit()
}

func (s *SQLiteStorage) InsertMetrics(ctx context.Context, metrics []Metric) error {
	if len(metrics) == 0 {
		return nil
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	stmt, err := tx.PrepareContext(ctx, `INSERT INTO metrics
		(service_name, metric_name, metric_type, value,
		 histogram_count, histogram_sum, histogram_buckets,
		 attributes, resource_attributes, timestamp, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return fmt.Errorf("prepare: %w", err)
	}
	defer stmt.Close()

	now := time.Now().UnixNano()
	for _, m := range metrics {
		buckets, _ := json.Marshal(m.HistogramBuckets)
		attrs, _ := json.Marshal(m.Attributes)
		resAttrs, _ := json.Marshal(m.ResourceAttributes)

		_, err := stmt.ExecContext(ctx,
			m.ServiceName, m.MetricName, m.MetricType, m.Value,
			m.HistogramCount, m.HistogramSum, string(buckets),
			string(attrs), string(resAttrs), m.Timestamp, now,
		)
		if err != nil {
			return fmt.Errorf("insert metric: %w", err)
		}
	}

	return tx.Commit()
}

func (s *SQLiteStorage) InsertLogs(ctx context.Context, logs []LogRecord) error {
	if len(logs) == 0 {
		return nil
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	stmt, err := tx.PrepareContext(ctx, `INSERT INTO logs
		(trace_id, span_id, service_name, severity_number, severity_text,
		 body, attributes, resource_attributes, timestamp, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return fmt.Errorf("prepare: %w", err)
	}
	defer stmt.Close()

	now := time.Now().UnixNano()
	for _, l := range logs {
		attrs, _ := json.Marshal(l.Attributes)
		resAttrs, _ := json.Marshal(l.ResourceAttributes)

		_, err := stmt.ExecContext(ctx,
			l.TraceID, l.SpanID, l.ServiceName, l.SeverityNumber, l.SeverityText,
			l.Body, string(attrs), string(resAttrs), l.Timestamp, now,
		)
		if err != nil {
			return fmt.Errorf("insert log: %w", err)
		}
	}

	return tx.Commit()
}

// --- Query methods ---

func (s *SQLiteStorage) QueryTraces(ctx context.Context, filter TraceFilter) ([]TraceSummary, int64, error) {
	if filter.Limit <= 0 {
		filter.Limit = 50
	}
	if filter.Limit > 200 {
		filter.Limit = 200
	}

	var where []string
	var args []any

	if filter.ServiceName != "" {
		where = append(where, "service_name = ?")
		args = append(args, filter.ServiceName)
	}
	if !filter.StartTime.IsZero() {
		where = append(where, "start_time >= ?")
		args = append(args, filter.StartTime.UnixNano())
	}
	if !filter.EndTime.IsZero() {
		where = append(where, "start_time <= ?")
		args = append(args, filter.EndTime.UnixNano())
	}
	if filter.MinDuration > 0 {
		where = append(where, "duration_ns >= ?")
		args = append(args, filter.MinDuration.Nanoseconds())
	}
	if filter.MaxDuration > 0 {
		where = append(where, "duration_ns <= ?")
		args = append(args, filter.MaxDuration.Nanoseconds())
	}
	if filter.StatusCode != nil {
		where = append(where, "status_code = ?")
		args = append(args, *filter.StatusCode)
	}

	whereClause := ""
	if len(where) > 0 {
		whereClause = "WHERE " + strings.Join(where, " AND ")
	}

	// Count total matching traces
	countQuery := fmt.Sprintf(`SELECT COUNT(DISTINCT trace_id) FROM spans %s`, whereClause)
	var total int64
	if err := s.db.QueryRowContext(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count traces: %w", err)
	}

	// Get trace summaries
	query := fmt.Sprintf(`
		SELECT trace_id,
			   MIN(CASE WHEN parent_span_id = '' THEN service_name ELSE NULL END) as root_service,
			   MIN(CASE WHEN parent_span_id = '' THEN span_name ELSE NULL END) as root_span,
			   COUNT(*) as span_count,
			   MAX(end_time) - MIN(start_time) as duration_ns,
			   MAX(status_code) as status_code,
			   MIN(start_time) as start_time
		FROM spans %s
		GROUP BY trace_id
		ORDER BY start_time DESC
		LIMIT ? OFFSET ?`, whereClause)

	args = append(args, filter.Limit, filter.Offset)

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("query traces: %w", err)
	}
	defer rows.Close()

	var traces []TraceSummary
	for rows.Next() {
		var t TraceSummary
		var durationNs int64
		var rootService, rootSpan sql.NullString
		if err := rows.Scan(&t.TraceID, &rootService, &rootSpan, &t.SpanCount, &durationNs, &t.StatusCode, &t.StartTime); err != nil {
			return nil, 0, fmt.Errorf("scan trace: %w", err)
		}
		t.RootService = rootService.String
		t.RootSpan = rootSpan.String
		t.DurationMs = float64(durationNs) / 1e6
		traces = append(traces, t)
	}

	return traces, total, rows.Err()
}

func (s *SQLiteStorage) GetTraceByID(ctx context.Context, traceID string) ([]Span, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT trace_id, span_id, parent_span_id, service_name, span_name, span_kind,
			   start_time, end_time, duration_ns, status_code, status_message,
			   attributes, events, resource_attributes
		FROM spans WHERE trace_id = ?
		ORDER BY start_time ASC`, traceID)
	if err != nil {
		return nil, fmt.Errorf("query trace: %w", err)
	}
	defer rows.Close()

	var spans []Span
	for rows.Next() {
		var sp Span
		var attrsJSON, eventsJSON, resAttrsJSON string
		if err := rows.Scan(
			&sp.TraceID, &sp.SpanID, &sp.ParentSpanID, &sp.ServiceName, &sp.SpanName, &sp.SpanKind,
			&sp.StartTime, &sp.EndTime, &sp.DurationNs, &sp.StatusCode, &sp.StatusMessage,
			&attrsJSON, &eventsJSON, &resAttrsJSON,
		); err != nil {
			return nil, fmt.Errorf("scan span: %w", err)
		}
		json.Unmarshal([]byte(attrsJSON), &sp.Attributes)
		json.Unmarshal([]byte(eventsJSON), &sp.Events)
		json.Unmarshal([]byte(resAttrsJSON), &sp.ResourceAttributes)
		spans = append(spans, sp)
	}

	return spans, rows.Err()
}

func (s *SQLiteStorage) QueryMetrics(ctx context.Context, filter MetricFilter) ([]MetricDataPoint, error) {
	if filter.Limit <= 0 {
		filter.Limit = 1000
	}

	var where []string
	var args []any

	if filter.ServiceName != "" {
		where = append(where, "service_name = ?")
		args = append(args, filter.ServiceName)
	}
	if filter.MetricName != "" {
		where = append(where, "metric_name = ?")
		args = append(args, filter.MetricName)
	}
	if !filter.StartTime.IsZero() {
		where = append(where, "timestamp >= ?")
		args = append(args, filter.StartTime.UnixNano())
	}
	if !filter.EndTime.IsZero() {
		where = append(where, "timestamp <= ?")
		args = append(args, filter.EndTime.UnixNano())
	}

	whereClause := ""
	if len(where) > 0 {
		whereClause = "WHERE " + strings.Join(where, " AND ")
	}

	query := fmt.Sprintf(`SELECT metric_name, timestamp, value, attributes
		FROM metrics %s ORDER BY timestamp ASC LIMIT ?`, whereClause)
	args = append(args, filter.Limit)

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query metrics: %w", err)
	}
	defer rows.Close()

	var points []MetricDataPoint
	for rows.Next() {
		var dp MetricDataPoint
		var attrsJSON string
		if err := rows.Scan(&dp.MetricName, &dp.Timestamp, &dp.Value, &attrsJSON); err != nil {
			return nil, fmt.Errorf("scan metric: %w", err)
		}
		json.Unmarshal([]byte(attrsJSON), &dp.Attributes)
		points = append(points, dp)
	}

	return points, rows.Err()
}

func (s *SQLiteStorage) QueryLogs(ctx context.Context, filter LogFilter) ([]LogRecord, int64, error) {
	if filter.Limit <= 0 {
		filter.Limit = 100
	}
	if filter.Limit > 200 {
		filter.Limit = 200
	}

	var where []string
	var args []any

	if filter.ServiceName != "" {
		where = append(where, "service_name = ?")
		args = append(args, filter.ServiceName)
	}
	if filter.TraceID != "" {
		where = append(where, "trace_id = ?")
		args = append(args, filter.TraceID)
	}
	if filter.SeverityMin > 0 {
		where = append(where, "severity_number >= ?")
		args = append(args, filter.SeverityMin)
	}
	if filter.SearchBody != "" {
		where = append(where, "body LIKE ?")
		args = append(args, "%"+filter.SearchBody+"%")
	}
	if !filter.StartTime.IsZero() {
		where = append(where, "timestamp >= ?")
		args = append(args, filter.StartTime.UnixNano())
	}
	if !filter.EndTime.IsZero() {
		where = append(where, "timestamp <= ?")
		args = append(args, filter.EndTime.UnixNano())
	}

	whereClause := ""
	if len(where) > 0 {
		whereClause = "WHERE " + strings.Join(where, " AND ")
	}

	// Count
	var total int64
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM logs %s", whereClause)
	if err := s.db.QueryRowContext(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count logs: %w", err)
	}

	query := fmt.Sprintf(`SELECT trace_id, span_id, service_name, severity_number, severity_text,
		body, attributes, resource_attributes, timestamp
		FROM logs %s ORDER BY timestamp DESC LIMIT ? OFFSET ?`, whereClause)
	args = append(args, filter.Limit, filter.Offset)

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("query logs: %w", err)
	}
	defer rows.Close()

	var logs []LogRecord
	for rows.Next() {
		var l LogRecord
		var attrsJSON, resAttrsJSON string
		if err := rows.Scan(
			&l.TraceID, &l.SpanID, &l.ServiceName, &l.SeverityNumber, &l.SeverityText,
			&l.Body, &attrsJSON, &resAttrsJSON, &l.Timestamp,
		); err != nil {
			return nil, 0, fmt.Errorf("scan log: %w", err)
		}
		json.Unmarshal([]byte(attrsJSON), &l.Attributes)
		json.Unmarshal([]byte(resAttrsJSON), &l.ResourceAttributes)
		logs = append(logs, l)
	}

	return logs, total, rows.Err()
}

func (s *SQLiteStorage) GetServices(ctx context.Context) ([]ServiceInfo, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT service_name,
			   COUNT(*) as span_count,
			   SUM(CASE WHEN status_code = 2 THEN 1 ELSE 0 END) as error_count,
			   AVG(duration_ns) / 1e6 as avg_latency_ms
		FROM spans
		GROUP BY service_name
		ORDER BY span_count DESC`)
	if err != nil {
		return nil, fmt.Errorf("query services: %w", err)
	}
	defer rows.Close()

	var services []ServiceInfo
	for rows.Next() {
		var svc ServiceInfo
		if err := rows.Scan(&svc.Name, &svc.SpanCount, &svc.ErrorCount, &svc.AvgLatency); err != nil {
			return nil, fmt.Errorf("scan service: %w", err)
		}
		services = append(services, svc)
	}

	return services, rows.Err()
}

func (s *SQLiteStorage) GetStats(ctx context.Context, sinceNano int64) (*Stats, error) {
	stats := &Stats{}

	// Trace/span counts and latency
	err := s.db.QueryRowContext(ctx, `
		SELECT COUNT(DISTINCT trace_id),
			   COUNT(*),
			   AVG(duration_ns) / 1e6,
			   SUM(CASE WHEN status_code = 2 THEN 1.0 ELSE 0.0 END) / MAX(COUNT(*), 1),
			   COUNT(DISTINCT service_name)
		FROM spans WHERE start_time >= ?`, sinceNano).
		Scan(&stats.TotalTraces, &stats.TotalSpans, &stats.AvgLatencyMs, &stats.ErrorRate, &stats.ServiceCount)
	if err != nil {
		return nil, fmt.Errorf("query span stats: %w", err)
	}

	// Log count
	s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM logs WHERE timestamp >= ?`, sinceNano).
		Scan(&stats.TotalLogs)

	// P99 latency - get root spans sorted by duration
	rows, err := s.db.QueryContext(ctx, `
		SELECT duration_ns FROM spans
		WHERE parent_span_id = '' AND start_time >= ?
		ORDER BY duration_ns ASC`, sinceNano)
	if err != nil {
		return nil, fmt.Errorf("query p99: %w", err)
	}
	defer rows.Close()

	var durations []int64
	for rows.Next() {
		var d int64
		rows.Scan(&d)
		durations = append(durations, d)
	}
	if len(durations) > 0 {
		sort.Slice(durations, func(i, j int) bool { return durations[i] < durations[j] })
		idx := int(math.Ceil(float64(len(durations))*0.99)) - 1
		if idx < 0 {
			idx = 0
		}
		stats.P99LatencyMs = float64(durations[idx]) / 1e6
	}

	return stats, nil
}

func (s *SQLiteStorage) DeleteOlderThan(ctx context.Context, beforeNano int64) (int64, error) {
	var totalDeleted int64

	tables := []struct {
		name    string
		column  string
	}{
		{"spans", "created_at"},
		{"metrics", "created_at"},
		{"logs", "created_at"},
	}

	for _, t := range tables {
		result, err := s.db.ExecContext(ctx,
			fmt.Sprintf("DELETE FROM %s WHERE %s < ?", t.name, t.column), beforeNano)
		if err != nil {
			return totalDeleted, fmt.Errorf("delete from %s: %w", t.name, err)
		}
		n, _ := result.RowsAffected()
		totalDeleted += n
	}

	return totalDeleted, nil
}
