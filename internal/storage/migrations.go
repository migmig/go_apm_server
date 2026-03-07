package storage

import (
	"context"
	"database/sql"
)

const schema = `
CREATE TABLE IF NOT EXISTS spans (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    trace_id        TEXT NOT NULL,
    span_id         TEXT NOT NULL,
    parent_span_id  TEXT DEFAULT '',
    service_name    TEXT NOT NULL,
    span_name       TEXT NOT NULL,
    span_kind       INTEGER DEFAULT 0,
    start_time      INTEGER NOT NULL,
    end_time        INTEGER NOT NULL,
    duration_ns     INTEGER NOT NULL,
    status_code     INTEGER DEFAULT 0,
    status_message  TEXT DEFAULT '',
    attributes      TEXT DEFAULT '{}',
    events          TEXT DEFAULT '[]',
    resource_attributes TEXT DEFAULT '{}',
    created_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_spans_trace_id ON spans(trace_id);
CREATE INDEX IF NOT EXISTS idx_spans_service_name ON spans(service_name);
CREATE INDEX IF NOT EXISTS idx_spans_start_time ON spans(start_time);
CREATE INDEX IF NOT EXISTS idx_spans_duration ON spans(duration_ns);

CREATE TABLE IF NOT EXISTS metrics (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    service_name      TEXT NOT NULL,
    metric_name       TEXT NOT NULL,
    metric_type       INTEGER NOT NULL,
    value             REAL,
    histogram_count   INTEGER,
    histogram_sum     REAL,
    histogram_buckets TEXT DEFAULT '[]',
    attributes        TEXT DEFAULT '{}',
    resource_attributes TEXT DEFAULT '{}',
    timestamp         INTEGER NOT NULL,
    created_at        INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_metrics_service ON metrics(service_name);
CREATE INDEX IF NOT EXISTS idx_metrics_name ON metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp);

CREATE TABLE IF NOT EXISTS logs (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    trace_id          TEXT DEFAULT '',
    span_id           TEXT DEFAULT '',
    service_name      TEXT NOT NULL,
    severity_number   INTEGER DEFAULT 0,
    severity_text     TEXT DEFAULT '',
    body              TEXT DEFAULT '',
    attributes        TEXT DEFAULT '{}',
    resource_attributes TEXT DEFAULT '{}',
    timestamp         INTEGER NOT NULL,
    created_at        INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_logs_trace_id ON logs(trace_id);
CREATE INDEX IF NOT EXISTS idx_logs_service ON logs(service_name);
CREATE INDEX IF NOT EXISTS idx_logs_severity ON logs(severity_number);
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp);
`

func migrate(ctx context.Context, db *sql.DB) error {
	_, err := db.ExecContext(ctx, schema)
	return err
}
