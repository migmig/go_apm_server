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
        metric_name TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        value REAL NOT NULL,
        trace_id TEXT NOT NULL,
        span_id TEXT NOT NULL,
        attributes TEXT DEFAULT '{}'
    );
    CREATE INDEX idx_exemplars_metric_time ON metric_exemplars(metric_name, timestamp);
    ```

#### 2.1.2 백엔드 로직 수정 (`pdata_parser.go`, `sqlite.go`)
- **수집 및 파싱 로직**
  - `ParseMetrics` 함수 내부에서 `m.Histogram().DataPoints()` 또는 `m.ExponentialHistogram().DataPoints()` 순회 시 `DataPoint.Exemplars()` 컬렉션을 함께 추출합니다.
  - 추출된 Exemplar 데이터를 `storage.Exemplar` 모델로 맵핑(Mapping)합니다.
- **Save 로직**
  - `internal/storage/sqlite.go`에 `InsertExemplars(ctx context.Context, exemplars []Exemplar) error` 함수를 추가하고 트랜잭션 묶음 안에서 저장합니다.

#### 2.1.3 API 및 UI 요구사항
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
      Enabled      bool     `yaml:"enabled" json:"enabled"`
      Endpoints    []string `yaml:"endpoints" json:"endpoints"`
      Protocol     string   `yaml:"protocol" json:"protocol"` // grpc, http/protobuf
      RetryEnabled bool     `yaml:"retry_enabled" json:"retry_enabled"`
      MaxRetry     int      `yaml:"max_retry" json:"max_retry"`
  }
  ```

#### 2.2.2 Exporter 모듈 구현 (`internal/exporter/`)
- **OTLP Client 구현**
  - OTel 공식 Go 라이브러리 `go.opentelemetry.io/otel/exporters/otlp/otlptrace` (및 metric, log) 클라이언트를 내부적으로 추상화하여 구현.
  - 수신된 OTLP 데이터(`ptraceotlp.ExportRequest` 원본 형상)를 메모리 버퍼 채널로 복제(Clone)하여 전달.
- **백그라운드 워커 큐**
  - 메인 수신 스레드가 블로킹되지 않도록, 고루틴 채널(Goroutine Channel)로 데이터를 넘깁니다. 큐 허용량 초과 시 Drop 처리(설정 가능하도록 구현).
  - Exponential Backoff(지수 백오프)가 적용된 `Retry` 알고리즘을 기본 동작으로 삽입.

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
- **INDEX 생성**:
  ```sql
  CREATE INDEX idx_spans_http_route ON spans(http_route);
  CREATE INDEX idx_spans_db_system ON spans(db_system);
  ```

#### 2.3.2 데이터 파싱 최적화 (`internal/processor/pdata_parser.go`)
- `Span` Attributes 파싱 시, 분리 승격된 키워드(`http.method`, `db.system` 등)가 존재하면, 해당 값을 별도 구조체 멤버 필드로 바인딩시키고 원래의 `Attributes` 맵에서는 제외하여 중복 저장을 방지 (저장공간 최적화).

#### 2.3.3 API / 프론트엔드 연동 지원
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
