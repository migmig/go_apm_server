# Go APM Server - Technical Specification

## 1. 시스템 구성

### 1.1 프로세스 구조

단일 프로세스 내에서 다음 고루틴 그룹이 동시 실행된다:

- **OTLP gRPC Server** (`:4317`) - 트레이스/메트릭/로그 수신
- **OTLP HTTP Server** (`:4318`) - 트레이스/메트릭/로그 수신 (JSON/protobuf)
- **HTTP API + Web UI Server** (`:8080`) - REST API 및 정적 파일 서빙
- **Retention Worker** - 주기적 데이터 정리 (1시간 간격)

모든 서버는 `context.Context` 기반으로 관리되며 SIGINT/SIGTERM 시 graceful shutdown한다.

### 1.2 의존 패키지

```
go.opentelemetry.io/collector/pdata v1.x      # OTLP 데이터 파싱 및 변환
google.golang.org/grpc v1.x                   # gRPC 서버
modernc.org/sqlite v1.x                       # CGO-free SQLite 드라이버
gopkg.in/yaml.v3                              # YAML 설정 파싱
```

---

## 2. Config (`internal/config`)

### 2.1 구조체

```go
type Config struct {
    Server   ServerConfig   `yaml:"server"`
    Receiver ReceiverConfig `yaml:"receiver"`
    Storage  StorageConfig  `yaml:"storage"`
    Processor ProcessorConfig `yaml:"processor"`
}

type ServerConfig struct {
    APIPort int `yaml:"api_port"` // default: 8080
}

type ReceiverConfig struct {
    GRPCPort int `yaml:"grpc_port"` // default: 4317
    HTTPPort int `yaml:"http_port"` // default: 4318
}

type StorageConfig struct {
    DataDir       string `yaml:"data_dir"`       // default: "./data" (일별 파티셔닝 파일들이 저장될 디렉토리)
    RetentionDays int    `yaml:"retention_days"` // default: 7
}

type ProcessorConfig struct {
    BatchSize int           `yaml:"batch_size"` // default: 1000
    BatchTimeout time.Duration `yaml:"batch_timeout"` // default: 1s
}
```

### 2.2 로딩 순서

1. 기본값 적용
2. `config.yaml` 파일 로드 (존재 시)
3. 환경변수 오버라이드: `APM_SERVER_API_PORT`, `APM_RECEIVER_GRPC_PORT` 등
4. CLI 플래그: `--config <path>`

---

## 3. Storage (`internal/storage`)

### 3.1 SQLite 스키마

```sql
CREATE TABLE IF NOT EXISTS spans (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    trace_id      TEXT NOT NULL,
    span_id       TEXT NOT NULL,
    parent_span_id TEXT DEFAULT '',
    service_name  TEXT NOT NULL,
    span_name     TEXT NOT NULL,
    span_kind     INTEGER DEFAULT 0,
    start_time    INTEGER NOT NULL,  -- UnixNano
    end_time      INTEGER NOT NULL,  -- UnixNano
    duration_ns   INTEGER NOT NULL,
    status_code   INTEGER DEFAULT 0, -- 0=Unset, 1=Ok, 2=Error
    status_message TEXT DEFAULT '',
    attributes    TEXT DEFAULT '{}', -- JSON
    events        TEXT DEFAULT '[]', -- JSON array
    resource_attributes TEXT DEFAULT '{}', -- JSON
    created_at    INTEGER NOT NULL   -- UnixNano
);

CREATE INDEX idx_spans_trace_id ON spans(trace_id);
CREATE INDEX idx_spans_service_name ON spans(service_name);
CREATE INDEX idx_spans_start_time ON spans(start_time);
CREATE INDEX idx_spans_duration ON spans(duration_ns);

CREATE TABLE IF NOT EXISTS metrics (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    service_name    TEXT NOT NULL,
    metric_name     TEXT NOT NULL,
    metric_type     INTEGER NOT NULL, -- 1=Gauge, 2=Sum, 3=Histogram
    value           REAL,
    histogram_count INTEGER,
    histogram_sum   REAL,
    histogram_buckets TEXT DEFAULT '[]', -- JSON
    attributes      TEXT DEFAULT '{}',  -- JSON
    resource_attributes TEXT DEFAULT '{}', -- JSON
    timestamp       INTEGER NOT NULL,   -- UnixNano
    created_at      INTEGER NOT NULL
);

CREATE INDEX idx_metrics_service ON metrics(service_name);
CREATE INDEX idx_metrics_name ON metrics(metric_name);
CREATE INDEX idx_metrics_timestamp ON metrics(timestamp);

CREATE TABLE IF NOT EXISTS logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    trace_id        TEXT DEFAULT '',
    span_id         TEXT DEFAULT '',
    service_name    TEXT NOT NULL,
    severity_number INTEGER DEFAULT 0,
    severity_text   TEXT DEFAULT '',
    body            TEXT DEFAULT '',
    attributes      TEXT DEFAULT '{}',  -- JSON
    resource_attributes TEXT DEFAULT '{}', -- JSON
    timestamp       INTEGER NOT NULL,   -- UnixNano
    created_at      INTEGER NOT NULL
);

CREATE INDEX idx_logs_trace_id ON logs(trace_id);
CREATE INDEX idx_logs_service ON logs(service_name);
CREATE INDEX idx_logs_severity ON logs(severity_number);
CREATE INDEX idx_logs_timestamp ON logs(timestamp);
```

### 3.2 Storage 인터페이스

```go
type Storage interface {
    // Spans
    InsertSpans(ctx context.Context, spans []Span) error
    QueryTraces(ctx context.Context, filter TraceFilter) ([]TraceSummary, error)
    GetTraceByID(ctx context.Context, traceID string) ([]Span, error)

    // Metrics
    InsertMetrics(ctx context.Context, metrics []Metric) error
    QueryMetrics(ctx context.Context, filter MetricFilter) ([]MetricDataPoint, error)

    // Logs
    InsertLogs(ctx context.Context, logs []LogRecord) error
    QueryLogs(ctx context.Context, filter LogFilter) ([]LogRecord, error)

    // Services
    GetServices(ctx context.Context) ([]ServiceInfo, error)

    // Stats
    GetStats(ctx context.Context, since time.Time) (*Stats, error)

    // Maintenance
    DeleteOldPartitions(ctx context.Context, retentionDays int) (int, error) // 일별 파티셔닝 파일 삭제
    Close() error
}
```

### 3.3 데이터 모델 (`models.go`)

```go
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
    MetricType         int32
    Value              float64
    HistogramCount     int64
    HistogramSum       float64
    HistogramBuckets   []HistogramBucket
    Attributes         map[string]any
    ResourceAttributes map[string]any
    Timestamp          int64
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
    TraceID     string
    RootService string
    RootSpan    string
    SpanCount   int
    DurationNs  int64
    StatusCode  int32
    StartTime   int64
}

type ServiceInfo struct {
    Name       string
    SpanCount  int64
    ErrorCount int64
    AvgLatency float64 // ms
}

type Stats struct {
    TotalTraces   int64
    TotalSpans    int64
    TotalLogs     int64
    ErrorRate     float64
    ServiceCount  int
    AvgLatencyMs  float64
    P99LatencyMs  float64
}
```

### 3.4 필터 구조체

```go
type TraceFilter struct {
    ServiceName string
    MinDuration time.Duration
    MaxDuration time.Duration
    StatusCode  *int32
    StartTime   time.Time
    EndTime     time.Time
    Limit       int // default: 50, max: 200
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
    ServiceName    string
    TraceID        string
    SeverityMin    int32
    SearchBody     string
    StartTime      time.Time
    EndTime        time.Time
    Limit          int
    Offset         int
}
```

---

## 4. OTLP Receiver (`internal/receiver`)

### 4.1 gRPC Receiver

OTLP protobuf 서비스 3개를 구현한다:

```go
// TraceService
func (s *GRPCReceiver) Export(ctx context.Context,
    req *tracepb.ExportTraceServiceRequest,
) (*tracepb.ExportTraceServiceResponse, error)

// MetricsService
func (s *GRPCReceiver) Export(ctx context.Context,
    req *metricspb.ExportMetricsServiceRequest,
) (*metricspb.ExportMetricsServiceResponse, error)

// LogsService
func (s *GRPCReceiver) Export(ctx context.Context,
    req *logspb.ExportLogsServiceRequest,
) (*logspb.ExportLogsServiceResponse, error)
```

수신 후 protobuf → 내부 모델 변환 → `Storage.Insert*()` 호출.

### 4.2 HTTP Receiver

| 엔드포인트 | Content-Type | 설명 |
|-----------|-------------|------|
| `POST /v1/traces` | `application/x-protobuf`, `application/json` | 트레이스 수신 |
| `POST /v1/metrics` | `application/x-protobuf`, `application/json` | 메트릭 수신 |
| `POST /v1/logs` | `application/x-protobuf`, `application/json` | 로그 수신 |

JSON 요청은 `protojson`으로 디코딩. protobuf 요청은 `proto.Unmarshal`로 디코딩.

### 4.3 `pdata` 기반 내부 모델 변환 및 배치 처리 (`internal/processor`)

`processor.go`에서 `go.opentelemetry.io/collector/pdata`를 활용하여 OTLP 바이트/메시지를 내부 `Span`, `Metric`, `LogRecord`로 효율적으로 변환하고 배치 처리한다.

- `pdata.TracesUnmarshaler` 등을 사용해 바이트를 `pmetric.Metrics`, `ptrace.Traces`, `plog.Logs` 구조체로 언마샬링.
- `ResourceSpans` → 루프 → `resource.Attributes()`에서 `service.name` 추출.
- `ScopeSpans` → 루프 → 각 `ptrace.Span` 데이터를 내부 `Span` 구조체로 매핑.
- `TraceID()`, `SpanID()` 메서드로 hex 문자열 변환.
- `Attributes()`를 JSON 형식의 `map[string]any` (이후 JSON1 활용을 위해 텍스트 변환 고려)로 변환.
- **Batch Processing:** 수신된 데이터를 즉시 Insert하지 않고 Go Channel 또는 Ring Buffer를 통해 임시 저장(`Memory Buffer`).
- 일정 갯수(`BatchSize`, 예: 1000)가 차거나, 시간(`BatchTimeout`, 예: 1s)이 초과될 때 묶어서 `Storage.Insert*()` 호출(Bulk Insert).

---

## 5. REST API (`internal/api`)

### 5.1 엔드포인트 상세

#### `GET /api/services`
```json
// Response
{
  "services": [
    {
      "name": "user-service",
      "span_count": 15230,
      "error_count": 42,
      "avg_latency_ms": 23.5
    }
  ]
}
```

#### `GET /api/traces?service=<name>&start=<unix_ms>&end=<unix_ms>&status=<0|1|2>&min_duration=<ms>&limit=50&offset=0`
```json
// Response
{
  "traces": [
    {
      "trace_id": "abc123...",
      "root_service": "api-gateway",
      "root_span": "GET /users",
      "span_count": 8,
      "duration_ms": 142.5,
      "status_code": 1,
      "start_time": "2026-03-07T10:00:00Z"
    }
  ],
  "total": 1523
}
```

#### `GET /api/traces/:traceId`
```json
// Response
{
  "trace_id": "abc123...",
  "spans": [
    {
      "span_id": "def456...",
      "parent_span_id": "",
      "service_name": "api-gateway",
      "span_name": "GET /users",
      "span_kind": 2,
      "start_time": 1709802000000000000,
      "end_time":   1709802000142500000,
      "duration_ms": 142.5,
      "status_code": 1,
      "attributes": {"http.method": "GET", "http.url": "/users"},
      "events": [],
      "resource_attributes": {"service.name": "api-gateway"}
    }
  ]
}
```

#### `GET /api/metrics?service=<name>&name=<metric_name>&start=<unix_ms>&end=<unix_ms>&limit=1000`
```json
// Response
{
  "data_points": [
    {
      "metric_name": "http.server.duration",
      "timestamp": "2026-03-07T10:00:00Z",
      "value": 23.5,
      "attributes": {"http.method": "GET"}
    }
  ]
}
```

#### `GET /api/logs?service=<name>&trace_id=<id>&severity_min=<0-24>&search=<text>&start=<unix_ms>&end=<unix_ms>&limit=100&offset=0`
```json
// Response
{
  "logs": [
    {
      "timestamp": "2026-03-07T10:00:00Z",
      "service_name": "user-service",
      "severity_text": "ERROR",
      "severity_number": 17,
      "body": "failed to connect to database",
      "trace_id": "abc123...",
      "attributes": {}
    }
  ],
  "total": 423
}
```

#### `GET /api/stats?since=<unix_ms>`
```json
// Response
{
  "total_traces": 5230,
  "total_spans": 42100,
  "total_logs": 18500,
  "error_rate": 0.028,
  "service_count": 5,
  "avg_latency_ms": 45.2,
  "p99_latency_ms": 320.1
}
```

#### `GET /metrics`
```text
# HELP apm_server_traces_received_total Total traces received
# TYPE apm_server_traces_received_total counter
apm_server_traces_received_total 15230

# HELP go_goroutines Number of goroutines that currently exist.
# TYPE go_goroutines gauge
go_goroutines 42
```

#### `GET /health`
```json
{"status": "ok"}
```

### 5.2 공통 규칙

- 모든 응답은 `application/json`
- 에러 응답: `{"error": "message"}` + 적절한 HTTP 상태 코드
- 시간 파라미터: Unix milliseconds (쿼리 파라미터), ISO 8601 (응답)
- 기본 limit: 50, 최대 limit: 200 (traces/logs), 1000 (metrics)
- CORS: `Access-Control-Allow-Origin: *` (개발 편의)

---

## 6. Web UI (`web/`)

### 6.1 기술 선택

- **빌드 도구**: Vite
- **프레임워크**: React, Vue, 또는 Svelte (개발 효율성을 위한 경량 프레임워크 도입)
- **차트**: 시계열 차트 라이브러리 (uPlot 등), 오픈소스 컴포넌트(간략화된 간트 차트 라이브러리나 Jaeger UI 컴포넌트) 활용한 워터폴 차트 구현
- **라우팅**: SPA 라우팅 (각 프레임워크별 라우터 사용)

### 6.2 페이지 구성

| 경로 | 페이지 | 설명 |
|------|--------|------|
| `#/` | Dashboard | 서비스 목록, 요청 수/에러율/평균 응답시간, 최근 트레이스 |
| `#/traces` | Trace List | 트레이스 검색 (서비스/시간범위/상태/duration 필터) |
| `#/traces/:id` | Trace Detail | 스팬 워터폴 타임라인, 스팬 속성 패널 |
| `#/logs` | Log Viewer | 로그 스트림, 검색, severity 필터 |
| `#/metrics` | Metrics | 메트릭 이름 선택, 시계열 차트 |

### 6.3 워터폴 차트 스펙

- 각 스팬을 가로 바(bar)로 표현
- X축: 트레이스 시작 시간 기준 상대 시간 (ms)
- Y축: 스팬 계층 (parent-child 관계로 들여쓰기)
- 색상: 서비스별 고유 색상, 에러 스팬은 빨간색
- 클릭 시: 스팬 상세 정보 사이드 패널

### 6.4 정적 파일 서빙

프론트엔드 빌드 결과물(`dist` 또는 `build` 폴더)을 바이너리에 포함한다.

```go
//go:embed dist/*
var staticFS embed.FS

// API 서버에서 fallback으로 서빙. React Router 등 History API 기반 라우팅 지원을 위해 핸들러 수정 필요할 수 있음.
// mux.Handle("GET /", http.FileServer(http.FS(subFS)))
```

---

## 7. 서버 라이프사이클 (`cmd/server/main.go`)

```
main()
  ├── config.Load()
  ├── storage.NewTimePartitionedSQLite(config.Storage) // 일별 DB 파일 관리
  ├── processor.NewBatchProcessor(storage, config.Processor)
  ├── receiver.NewGRPC(config.Receiver, processor)  → go serve
  ├── receiver.NewHTTP(config.Receiver, processor)   → go serve
  ├── api.NewServer(config.Server, storage)          → go serve
  ├── retention.StartPartitionCleaner(storage, config.Storage) → go run (주기적으로 오래된 DB 파일 삭제)
  └── signal.NotifyContext(SIGINT, SIGTERM) → wait → shutdown all
```

Graceful shutdown 순서:
1. 새 요청 수신 중단 (리스너 닫기)
2. 진행 중 요청 완료 대기 (timeout 30초)
3. Processor의 배치 버퍼 Flush
4. Storage 닫기 (SQLite WAL flush)

---

## 8. 성능 고려사항

- **Time-partitioned Database**: 데이터를 일별로 저장하는 DB 파일 분리 전략으로 데이터 삽입/조회/삭제 시 단편화를 방지하고 삭제 오버헤드 0을 달성.
- SQLite WAL 모드 활성화 (`PRAGMA journal_mode=WAL`)
- 쓰기 배치 (Memory Buffer & Batcher): Channel/Ring Buffer를 통해 수신 데이터를 모아두고 일괄 처리(Bulk Insert)하여 동시성 쓰기 병목 회피
- JSON1 최적화: `attributes` 등을 파싱하지 않고 바로 텍스트 저장, SQLite의 내장 `json_extract()` 함수로 유연하게 조회.
- 읽기/쓰기 동시성: WAL 모드에서 읽기는 쓰기와 동시 가능
- `PRAGMA synchronous=NORMAL` (성능과 안전성 균형)
- 인덱스는 주요 쿼리 패턴에 맞춰 최소한으로 유지
