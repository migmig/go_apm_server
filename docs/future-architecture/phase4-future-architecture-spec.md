# APM Server Phase 4+ (Future Architecture) Technical Specification

## 1. 개요 (Overview)
본 명세서는 [Phase 4+ PRD](./phase4-future-architecture-prd.md)에서 정의된 요구사항을 달성하기 위한 구체적인 기술적 명세(Technical Specification)를 다룹니다.
주요 구현 목표는 메트릭-트레이스 연관 분석(Exemplars), OTLP 기반의 외부 시스템 팬아웃(Exporter), 그리고 Semantic Conventions를 활용한 검색 엔진 최적화(DB 정규화/인덱싱)입니다.

---

## 2. 모듈별 구현 명세 (Technical Details by Task)

### 2.1 Task 17: Exemplars 분석 엔진 (Metric ↔ Trace 연계)

#### 2.1.1 스토리지 스키마 (Database Schema)
- **테이블 단일화 추가 (`metric_exemplars`)**
  - 메트릭 통계 산출 과정에서 대표로 추출된 이벤트의 실제 이력(트레이스)을 저장하기 위한 릴레이션 테이블을 구축합니다.
  - **Schema Definition**:
    ```sql
    CREATE TABLE IF NOT EXISTS metric_exemplars (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        metric_id INTEGER,
        metric_name TEXT NOT NULL,
        metric_type TEXT NOT NULL DEFAULT 'histogram',  -- histogram, exponential_histogram, sum, gauge
        timestamp INTEGER NOT NULL,
        value REAL NOT NULL,
        trace_id TEXT NOT NULL,
        span_id TEXT NOT NULL,
        attributes TEXT DEFAULT '{}',
        FOREIGN KEY (metric_id) REFERENCES metrics(id) ON DELETE CASCADE
    );
    CREATE INDEX idx_exemplars_metric_time ON metric_exemplars(metric_name, timestamp);
    CREATE INDEX idx_exemplars_trace_id ON metric_exemplars(trace_id);
    ```

#### 2.1.2 데이터 보존 정책 (Retention Policy)
- Exemplar 데이터는 고빈도 누적 특성상 무한 증가를 방지하기 위한 보존 정책을 적용합니다.
- **기본 보존 기간**: 7일 (설정 가능, `config.ExemplarRetentionDays`)
- **정리 메커니즘**: 백그라운드 고루틴에서 주기적으로(1시간 간격) `DELETE FROM metric_exemplars WHERE timestamp < ?` 실행
- **Config 확장**:
  ```go
  type ExemplarConfig struct {
      RetentionDays int `yaml:"retention_days" json:"retention_days"` // default: 7
      MaxPerMetric  int `yaml:"max_per_metric" json:"max_per_metric"` // API 반환 시 메트릭당 최대 개수, default: 100
  }
  ```

#### 2.1.3 백엔드 로직 수정 (`pdata_parser.go`, `sqlite.go`)
- **수집 및 파싱 로직**
  - `ParseMetrics` 함수 내부에서 다음 메트릭 타입별 DataPoint 순회 시 `DataPoint.Exemplars()` 컬렉션을 함께 추출합니다:
    - `Histogram` / `ExponentialHistogram`: 레이턴시 분포의 대표 트레이스 추출 (주요 대상)
    - `Sum` (Monotonic): 카운터 급증 시점의 원인 트레이스 추적
    - `Gauge`: 임계값 초과 시점의 컨텍스트 트레이스 연결
  - 추출된 Exemplar 데이터를 `storage.Exemplar` 모델로 맵핑(Mapping)하며, `metric_type` 필드에 출처 메트릭 타입을 기록합니다.
- **Save 로직**
  - `internal/storage/sqlite.go`에 `InsertExemplars(ctx context.Context, exemplars []Exemplar) error` 함수를 추가하고 트랜잭션 묶음 안에서 저장합니다.

#### 2.1.4 API 및 UI 요구사항
- **API Endpoint**: `GET /api/metrics/exemplars`
  - Query Params: `metric_name`, `start`, `end`, `limit`
  - Response: 특정 시간 범위 내의 Exemplar 데이터 배열 (`timestamp`, `value`, `trace_id`, `span_id`).
- **UI 차트 컴포넌트**
  - 프론트엔드의 `Metrics.tsx` 혹은 관련 차트 컴포넌트에서 차트 위에 Scatter 형태의 포인트(Exemplars) 노출.
  - 포인트 클릭 이벤트 시, URL 라우팅을 `/traces/<trace_id>?span_id=<span_id>` 형태로 이동 처리.

---

### 2.2 Task 18: OTel Exporter 팬아웃 기반 마련

#### 2.2.1 환경 설정 모델 (`internal/config/config.go`)
- **Config 구조 확장**:
  ```go
  type ExporterConfig struct {
      Enabled      bool               `yaml:"enabled" json:"enabled"`
      Endpoints    []ExporterEndpoint `yaml:"endpoints" json:"endpoints"`
      QueueSize    int                `yaml:"queue_size" json:"queue_size"`       // default: 5000
      NumWorkers   int                `yaml:"num_workers" json:"num_workers"`     // default: 2
      DLQ          DLQConfig          `yaml:"dlq" json:"dlq"`
  }

  type ExporterEndpoint struct {
      URL          string   `yaml:"url" json:"url"`
      Protocol     string   `yaml:"protocol" json:"protocol"`         // grpc, http/protobuf
      SignalTypes  []string `yaml:"signal_types" json:"signal_types"` // traces, metrics, logs
      TLS          TLSConfig `yaml:"tls" json:"tls"`
      Headers      map[string]string `yaml:"headers" json:"headers"` // 인증 토큰 등 커스텀 헤더
      RetryEnabled bool     `yaml:"retry_enabled" json:"retry_enabled"`
      MaxRetry     int      `yaml:"max_retry" json:"max_retry"`       // default: 3
  }

  type TLSConfig struct {
      Enabled    bool   `yaml:"enabled" json:"enabled"`
      CertFile   string `yaml:"cert_file" json:"cert_file"`
      KeyFile    string `yaml:"key_file" json:"key_file"`
      CAFile     string `yaml:"ca_file" json:"ca_file"`
      SkipVerify bool   `yaml:"skip_verify" json:"skip_verify"`
  }

  type DLQConfig struct {
      Enabled    bool   `yaml:"enabled" json:"enabled"`
      StorePath  string `yaml:"store_path" json:"store_path"`   // default: "./dlq/"
      MaxSizeMB  int    `yaml:"max_size_mb" json:"max_size_mb"` // default: 100
      RetryInterval string `yaml:"retry_interval" json:"retry_interval"` // default: "5m"
  }
  ```

#### 2.2.2 멀티 시그널 팬아웃 구현 (`internal/exporter/`)
- **시그널별 OTLP Client 구현**
  - Traces: `go.opentelemetry.io/otel/exporters/otlp/otlptrace` 기반의 gRPC/HTTP 클라이언트
  - Metrics: `go.opentelemetry.io/otel/exporters/otlp/otlpmetric` 기반의 gRPC/HTTP 클라이언트
  - Logs: `go.opentelemetry.io/otel/exporters/otlp/otlplog` 기반의 gRPC/HTTP 클라이언트
  - 각 엔드포인트별 `SignalTypes` 설정에 따라 해당 시그널만 선택적으로 전송
  - 수신된 OTLP 데이터 원본(`ptraceotlp.ExportRequest`, `pmetricotlp.ExportRequest`, `plogotlp.ExportRequest`)을 메모리 버퍼 채널로 복제(Clone)하여 전달
- **TLS/인증 지원**
  - 엔드포인트별 TLS 인증서 설정 및 커스텀 헤더(Authorization Bearer 토큰 등) 지원
  - mTLS(양방향 TLS) 지원을 위한 클라이언트 인증서 설정

#### 2.2.3 백그라운드 워커 큐 및 회복성 (Resilience)
- **워커 큐 아키텍처**
  - 메인 수신 스레드가 블로킹되지 않도록, 고루틴 채널(Goroutine Channel)로 데이터를 넘깁니다. 큐 허용량 초과 시 Drop 처리(설정 가능하도록 구현).
  - Exponential Backoff(지수 백오프)가 적용된 `Retry` 알고리즘을 기본 동작으로 삽입.
- **Circuit Breaker 패턴**
  - 외부 엔드포인트별 연속 실패 횟수를 추적하여 임계치(기본 5회) 초과 시 Circuit Open 상태로 전환
  - Open 상태에서는 전송 시도를 중단하고, 설정된 대기 시간(기본 30초) 이후 Half-Open 상태에서 프로브(Probe) 요청으로 복구 확인
  - Circuit 상태 변경 시 로그 및 내부 메트릭 기록
- **DLQ (Dead Letter Queue) 시스템**
  - Retry 한도 초과 및 Circuit Open 상태에서 Drop되는 데이터를 로컬 파일시스템 기반 DLQ에 보관
  - DLQ 저장 형식: OTLP Proto 바이너리를 파일 단위로 직렬화 (`dlq/<signal_type>/<timestamp>_<seq>.pb`)
  - 백그라운드 고루틴이 `RetryInterval` 주기로 DLQ를 스캔하여 재전송 시도
  - `MaxSizeMB` 초과 시 가장 오래된 항목부터 삭제(FIFO)

#### 2.2.4 Exporter 상태 모니터링 API
- **API Endpoint**: `GET /api/exporter/status`
  - Response: 엔드포인트별 연결 상태, Circuit Breaker 상태, 큐 사용량, DLQ 크기, 최근 전송 성공/실패 카운터
  ```json
  {
    "endpoints": [
      {
        "url": "otel-collector:4317",
        "status": "healthy",
        "circuit_state": "closed",
        "queue_usage": "120/5000",
        "dlq_size_mb": 2.3,
        "sent_total": 15230,
        "failed_total": 12,
        "last_success": "2026-03-12T10:30:00Z"
      }
    ]
  }
  ```

---

### 2.3 Task 19: Semantic Conventions 기반 인덱싱 및 정규화

#### 2.3.1 스토리지 스키마 마이그레이션 (`internal/storage/migrations.go`)
- OTel 공식 스펙에 빈번하게 언급되는 공통 필드를 `spans` 테이블의 직접 컬럼으로 분리승격 시킵니다.
- **추가할 Column 목록**:
  - `http_method` (TEXT)
  - `http_route` (TEXT)
  - `http_status_code` (INTEGER)
  - `db_system` (TEXT)
  - `db_operation` (TEXT)
  - `rpc_system` (TEXT) — gRPC 등 RPC 기반 서비스 분석용
  - `messaging_system` (TEXT) — Kafka, RabbitMQ 등 메시징 시스템 분석용
- **복합 INDEX 생성** (PRD 요구사항에 따른 다중 조건 고속 검색 지원):
  ```sql
  -- HTTP 요청 분석: method + route + status 조합 검색
  CREATE INDEX idx_spans_http_composite ON spans(http_method, http_route, http_status_code);
  -- DB 쿼리 분석: system + operation 조합 검색
  CREATE INDEX idx_spans_db_composite ON spans(db_system, db_operation);
  -- 단일 컬럼 인덱스 (개별 필터링용)
  CREATE INDEX idx_spans_http_route ON spans(http_route);
  CREATE INDEX idx_spans_db_system ON spans(db_system);
  CREATE INDEX idx_spans_rpc_system ON spans(rpc_system);
  CREATE INDEX idx_spans_messaging_system ON spans(messaging_system);
  ```

#### 2.3.2 기존 데이터 백필 마이그레이션 (Backfill Strategy)
- 기존 `spans` 테이블의 `attributes` JSON 컬럼에서 승격 대상 키를 추출하여 신규 컬럼에 역채움(Backfill)합니다.
- **백필 SQL**:
  ```sql
  UPDATE spans SET
      http_method = json_extract(attributes, '$.http.method'),
      http_route = json_extract(attributes, '$.http.route'),
      http_status_code = CAST(json_extract(attributes, '$.http.status_code') AS INTEGER),
      db_system = json_extract(attributes, '$.db.system'),
      db_operation = json_extract(attributes, '$.db.operation'),
      rpc_system = json_extract(attributes, '$.rpc.system'),
      messaging_system = json_extract(attributes, '$.messaging.system')
  WHERE http_method IS NULL;
  ```
- **실행 전략**: 대량 데이터 처리 시 DB 잠금(Lock)을 방지하기 위해 배치 단위(1000건)로 분할 실행
- **롤백**: 백필 실행 전 `apm.db` 파일 스냅샷 백업 권장. 신규 컬럼은 `ALTER TABLE DROP COLUMN` 미지원(SQLite) 이므로 롤백 시 백업 파일 복원 방식 적용

#### 2.3.3 데이터 파싱 최적화 (`internal/processor/pdata_parser.go`)
- `Span` Attributes 파싱 시, 분리 승격된 키워드(`http.method`, `db.system` 등)가 존재하면, 해당 값을 별도 구조체 멤버 필드로 바인딩시키고 원래의 `Attributes` 맵에서는 제외하여 중복 저장을 방지 (저장공간 최적화).

#### 2.3.4 API / 프론트엔드 연동 지원
- **API Endpoint**: `GET /api/traces`
  - Query Params: `http_route`, `db_system` 등을 매개변수로 받아 SQL `WHERE http_route=?` 절에 다이렉트로 결합(바인딩)하도록 수정.
- **UI (Traces.tsx 고급 검색 뷰)**
  - 필터 폼 우측 혹은 하단에 고급 검색(Advanced Search) 버튼 추가.
  - Route(API 경로) 및 DB 쿼리 종류 등에 의한 고속 필터링 UI 렌더링.

---

## 3. 진행 시 유의 사항 전략 (Consideration & Fallback)
1. **마이그레이션 호환성 보장**: 기존 APM DB(`apm.db`) 데이터와의 무결성을 유지해야 합니다. 기존 데이터에 대해서는 신규 추출된 승격 컬럼은 `NULL` 또는 기본값을 띠게 됩니다.
2. **Exporter 리소스 모니터링**: 외부 시스템 팬아웃 트래픽 처리 시 OOM(Out of Memory) 방지를 위하여 내부 버퍼 큐 사이즈 상한선(`QueueSize`)을 제한해야 합니다.
3. **Exemplar 성능 영향도 점검**: UI 차트에 Exemplar 포인트가 과도하게 많이 찍히는 것을 방지하기 위해 API 레벨에서 Sampling 내지 Limit 기능을 통한 최대 노출 개수 필터링을 필수 구현해야 합니다.
4. **롤백 전략**: 모든 DB 마이그레이션(exemplars 테이블 신설, spans 컬럼 추가) 실행 전 `apm.db` 파일 백업을 필수 수행합니다. SQLite는 `ALTER TABLE DROP COLUMN`을 지원하지 않으므로, 롤백 시 백업 파일을 복원하는 방식으로 대응합니다. 마이그레이션 버전 번호를 `migrations.go`에 명시하여 순차 적용/검증이 가능하도록 합니다.
5. **DLQ 디스크 관리**: DLQ 파일시스템 사용량이 설정된 상한(`MaxSizeMB`)을 초과하지 않도록 FIFO 기반 자동 정리를 구현하며, DLQ 디렉토리 권한 및 디스크 여유 공간 검증 로직을 Exporter 시작 시 수행합니다.
6. **성능 벤치마크 기준선**: Task 19 완료 후 정규화 전/후의 쿼리 응답 시간(Query Latency)을 비교 측정하여 개선 리포트를 산출합니다. 기준 쿼리: `GET /api/traces?http_route=/api/v1/users&db_system=postgresql` 등 복합 필터 시나리오.
