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
    links           TEXT DEFAULT '[]',
    resource_attributes TEXT DEFAULT '{}',
    instrumentation_scope TEXT DEFAULT '{}',
    trace_state     TEXT DEFAULT '',
    flags           INTEGER DEFAULT 0,
    http_method     TEXT,
    http_route      TEXT,
    http_status_code INTEGER,
    db_system       TEXT,
    db_operation    TEXT,
    rpc_system      TEXT,
    messaging_system TEXT,
    created_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_spans_trace_id ON spans(trace_id);
CREATE INDEX IF NOT EXISTS idx_spans_service_name ON spans(service_name);
CREATE INDEX IF NOT EXISTS idx_spans_start_time ON spans(start_time);
CREATE INDEX IF NOT EXISTS idx_spans_duration ON spans(duration_ns);
CREATE INDEX IF NOT EXISTS idx_spans_http_composite ON spans(http_method, http_route, http_status_code);
CREATE INDEX IF NOT EXISTS idx_spans_db_composite ON spans(db_system, db_operation);
CREATE INDEX IF NOT EXISTS idx_spans_http_route ON spans(http_route);
CREATE INDEX IF NOT EXISTS idx_spans_db_system ON spans(db_system);
CREATE INDEX IF NOT EXISTS idx_spans_rpc_system ON spans(rpc_system);
CREATE INDEX IF NOT EXISTS idx_spans_messaging_system ON spans(messaging_system);

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
    start_timestamp   INTEGER DEFAULT 0,
    aggregation_temporality INTEGER DEFAULT 0,
    is_monotonic      BOOLEAN DEFAULT 0,
    instrumentation_scope TEXT DEFAULT '{}',
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
    observed_timestamp INTEGER DEFAULT 0,
    instrumentation_scope TEXT DEFAULT '{}',
    created_at        INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_logs_trace_id ON logs(trace_id);
CREATE INDEX IF NOT EXISTS idx_logs_service ON logs(service_name);
CREATE INDEX IF NOT EXISTS idx_logs_severity ON logs(severity_number);
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp);

CREATE TABLE IF NOT EXISTS metric_exemplars (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    metric_name     TEXT NOT NULL,
    metric_type     TEXT NOT NULL DEFAULT 'histogram',
    timestamp       INTEGER NOT NULL,
    value           REAL NOT NULL,
    trace_id        TEXT NOT NULL,
    span_id         TEXT NOT NULL,
    attributes      TEXT DEFAULT '{}',
    created_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_exemplars_metric_time ON metric_exemplars(metric_name, timestamp);
CREATE INDEX IF NOT EXISTS idx_exemplars_trace_id ON metric_exemplars(trace_id);
`

func migrate(ctx context.Context, db *sql.DB) error {
	_, err := db.ExecContext(ctx, schema)

	alterStmts := []string{
		`ALTER TABLE spans ADD COLUMN instrumentation_scope TEXT DEFAULT '{}'`,
		`ALTER TABLE metrics ADD COLUMN start_timestamp INTEGER DEFAULT 0`,
		`ALTER TABLE metrics ADD COLUMN aggregation_temporality INTEGER DEFAULT 0`,
		`ALTER TABLE metrics ADD COLUMN is_monotonic BOOLEAN DEFAULT 0`,
		`ALTER TABLE metrics ADD COLUMN instrumentation_scope TEXT DEFAULT '{}'`,
		`ALTER TABLE logs ADD COLUMN instrumentation_scope TEXT DEFAULT '{}'`,
		`ALTER TABLE spans ADD COLUMN links TEXT DEFAULT '[]'`,
		`ALTER TABLE spans ADD COLUMN trace_state TEXT DEFAULT ''`,
		`ALTER TABLE spans ADD COLUMN flags INTEGER DEFAULT 0`,
		`ALTER TABLE logs ADD COLUMN observed_timestamp INTEGER DEFAULT 0`,
		`ALTER TABLE spans ADD COLUMN http_method TEXT`,
		`ALTER TABLE spans ADD COLUMN http_route TEXT`,
		`ALTER TABLE spans ADD COLUMN http_status_code INTEGER`,
		`ALTER TABLE spans ADD COLUMN db_system TEXT`,
		`ALTER TABLE spans ADD COLUMN db_operation TEXT`,
		`ALTER TABLE spans ADD COLUMN rpc_system TEXT`,
		`ALTER TABLE spans ADD COLUMN messaging_system TEXT`,
		`CREATE INDEX IF NOT EXISTS idx_spans_http_composite ON spans(http_method, http_route, http_status_code)`,
		`CREATE INDEX IF NOT EXISTS idx_spans_db_composite ON spans(db_system, db_operation)`,
		`CREATE INDEX IF NOT EXISTS idx_spans_http_route ON spans(http_route)`,
		`CREATE INDEX IF NOT EXISTS idx_spans_db_system ON spans(db_system)`,
		`CREATE INDEX IF NOT EXISTS idx_spans_rpc_system ON spans(rpc_system)`,
		`CREATE INDEX IF NOT EXISTS idx_spans_messaging_system ON spans(messaging_system)`,
	}
	for _, stmt := range alterStmts {
		db.ExecContext(ctx, stmt)
	}

	return err
}
