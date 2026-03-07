package storage

import "time"

type Span struct {
	TraceID            string
	SpanID             string
	ParentSpanID       string
	ServiceName        string
	SpanName           string
	SpanKind           int32
	StartTime          int64 // UnixNano
	EndTime            int64
	DurationNs         int64
	StatusCode         int32
	StatusMessage      string
	Attributes         map[string]any
	Events             []SpanEvent
	ResourceAttributes map[string]any
}

type SpanEvent struct {
	Name       string         `json:"name"`
	Timestamp  int64          `json:"timestamp"`
	Attributes map[string]any `json:"attributes"`
}

type Metric struct {
	ServiceName        string
	MetricName         string
	MetricType         int32 // 1=Gauge, 2=Sum, 3=Histogram
	Value              float64
	HistogramCount     int64
	HistogramSum       float64
	HistogramBuckets   []HistogramBucket
	Attributes         map[string]any
	ResourceAttributes map[string]any
	Timestamp          int64
}

type HistogramBucket struct {
	UpperBound float64 `json:"upper_bound"`
	Count      uint64  `json:"count"`
}

type LogRecord struct {
	TraceID            string
	SpanID             string
	ServiceName        string
	SeverityNumber     int32
	SeverityText       string
	Body               string
	Attributes         map[string]any
	ResourceAttributes map[string]any
	Timestamp          int64
}

type TraceSummary struct {
	TraceID     string  `json:"trace_id"`
	RootService string  `json:"root_service"`
	RootSpan    string  `json:"root_span"`
	SpanCount   int     `json:"span_count"`
	DurationMs  float64 `json:"duration_ms"`
	StatusCode  int32   `json:"status_code"`
	StartTime   int64   `json:"start_time"`
}

type ServiceInfo struct {
	Name       string  `json:"name"`
	SpanCount  int64   `json:"span_count"`
	ErrorCount int64   `json:"error_count"`
	AvgLatency float64 `json:"avg_latency_ms"`
}

type Stats struct {
	TotalTraces  int64   `json:"total_traces"`
	TotalSpans   int64   `json:"total_spans"`
	TotalLogs    int64   `json:"total_logs"`
	ErrorRate    float64 `json:"error_rate"`
	ServiceCount int     `json:"service_count"`
	AvgLatencyMs float64 `json:"avg_latency_ms"`
	P99LatencyMs float64 `json:"p99_latency_ms"`
}

type TraceFilter struct {
	ServiceName string
	MinDuration time.Duration
	MaxDuration time.Duration
	StatusCode  *int32
	StartTime   time.Time
	EndTime     time.Time
	Limit       int
	Offset      int
}

type MetricFilter struct {
	ServiceName string
	MetricName  string
	StartTime   time.Time
	EndTime     time.Time
	Limit       int
}

type LogFilter struct {
	ServiceName string
	TraceID     string
	SeverityMin int32
	SearchBody  string
	StartTime   time.Time
	EndTime     time.Time
	Limit       int
	Offset      int
}
