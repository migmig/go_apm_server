# OTel 스펙 미구현 항목 분석

> 작성일: 2026-03-11
> 기준 스펙: OpenTelemetry Protocol (OTLP) v1.x, OTel Specification v1.x
> 분석 대상: `go_apm_server` 현재 구현체

---

## 개요

현재 구현체는 OTLP gRPC(`:4317`)와 OTLP HTTP(`:4318`)로 Traces, Metrics, Logs 세 가지 시그널을 수신하고, SQLite에 저장 후 REST API로 조회하는 기본 파이프라인을 갖추고 있다.

OTel 스펙과 비교 시 아래 항목들이 파싱/저장/처리되지 않고 있다.

---

## 1. Traces 미구현 항목

### 1.1 SpanLinks (누락)
- **스펙**: [`Span.links`](https://opentelemetry.io/docs/specs/otel/trace/api/#span) — 인과관계가 있는 다른 Trace/Span을 가리키는 참조 목록
- **현황**: `pdata_parser.go`에서 `sp.Links()` 호출 없음, `storage.Span` 모델에 `Links` 필드 없음
- **영향**: Fan-out/Fan-in 패턴, async job 추적, Kafka 메시지 연결 등에서 인과관계 추적 불가
- **스펙 필드**:
  ```
  Link {
    trace_id, span_id, trace_state,
    attributes, dropped_attributes_count, flags
  }
  ```

### 1.2 TraceState (누락)
- **스펙**: [`Span.trace_state`](https://www.w3.org/TR/trace-context/#tracestate-header) — W3C TraceState, 벤더별 메타데이터 전달
- **현황**: `sp.TraceState().AsRaw()` 호출 없음, 저장 안 됨
- **영향**: 타 APM 벤더(Datadog, Jaeger 등)와의 상호운용, 샘플링 결정 전달 불가

### 1.3 Span Flags (누락)
- **스펙**: [`Span.flags`](https://opentelemetry.io/docs/specs/otlp/#trace-data-format) — TraceFlags (W3C, 예: sampled bit)
- **현황**: `sp.Flags()` 호출 없음
- **영향**: 샘플링 여부 판단 불가, 데이터 신뢰성 표시 불가

### 1.4 Dropped Counts (누락)
- **스펙**: Span에 `dropped_attributes_count`, `dropped_events_count`, `dropped_links_count` 필드 존재
- **현황**: 세 필드 모두 파싱/저장 안 됨
- **영향**: 데이터 유실 감지 불가 — SDK가 속성/이벤트/링크 한도를 초과하여 드랍한 경우를 서버에서 알 수 없음

### 1.5 SpanEvent DroppedAttributesCount (누락)
- **스펙**: `SpanEvent.dropped_attributes_count`
- **현황**: `storage.SpanEvent` 모델에 해당 필드 없음 (`pdata_parser.go:40-44`)

### 1.6 Instrumentation Scope (InstrumentationLibrary) (누락)
- **스펙**: `ScopeSpans.scope` — 계측 라이브러리의 name, version, attributes, schema_url
- **현황**: `ils.Scope()` 호출 없음, 저장 안 됨
- **영향**: 어느 라이브러리(e.g., `io.opentelemetry.spring-boot:1.28`)가 생성한 스팬인지 식별 불가

### 1.7 Resource SchemaURL (누락)
- **스펙**: `ResourceSpans.schema_url`
- **현황**: `rs.SchemaUrl()` 호출 없음
- **영향**: 리소스 속성의 시맨틱 버전 관리 불가

---

## 2. Metrics 미구현 항목

### 2.1 ExponentialHistogram 타입 (미구현)
- **스펙**: [`MetricType.EXPONENTIAL_HISTOGRAM`](https://opentelemetry.io/docs/specs/otel/metrics/data-model/#exponentialhistogram) — 동적 버킷 경계를 사용하는 고해상도 히스토그램
- **현황**: `pdata_parser.go`의 `switch m.Type()` 케이스에 `pmetric.MetricTypeExponentialHistogram` 없음
- **영향**: Java, Go 최신 SDK가 기본으로 ExponentialHistogram을 내보내는 경우 데이터 완전 누락
- **스펙 필드**:
  ```
  ExponentialHistogramDataPoint {
    scale, zero_count,
    positive { offset, bucket_counts },
    negative { offset, bucket_counts },
    exemplars, flags, min, max
  }
  ```

### 2.2 Summary 타입 (미구현)
- **스펙**: [`MetricType.SUMMARY`](https://opentelemetry.io/docs/specs/otel/metrics/data-model/#summary-legacy) — pre-aggregated 분위수 (deprecated지만 스펙에 존재)
- **현황**: `pmetric.MetricTypeSummary` 케이스 없음
- **영향**: Prometheus 클라이언트에서 변환된 Summary 데이터 누락

### 2.3 Metric Unit 및 Description (누락)
- **스펙**: `Metric.unit`, `Metric.description`
- **현황**: `m.Unit()`, `m.Description()` 호출 없음, `storage.Metric` 모델에 필드 없음
- **영향**: 단위(ms, bytes, requests) 및 메트릭 설명 정보 유실

### 2.4 AggregationTemporality (누락)
- **스펙**: Sum과 Histogram의 `aggregation_temporality` (CUMULATIVE / DELTA)
- **현황**: `m.Sum().AggregationTemporality()`, `m.Histogram().AggregationTemporality()` 저장 안 됨
- **영향**: Delta vs Cumulative 구분 없이 저장 → 쿼리 시 잘못된 집계 가능

### 2.5 Sum IsMonotonic (누락)
- **스펙**: `Sum.is_monotonic` — 단조 증가 여부 (counter vs up-down-counter)
- **현황**: `m.Sum().IsMonotonic()` 저장 안 됨
- **영향**: Counter와 UpDownCounter를 구분하지 못함

### 2.6 StartTimestamp (누락)
- **스펙**: `NumberDataPoint.start_time_unix_nano`, `HistogramDataPoint.start_time_unix_nano`
- **현황**: `dp.StartTimestamp()` 호출 없음 (Timestamp만 저장)
- **영향**: 집계 시작 시점을 알 수 없어 rate 계산 정확도 저하

### 2.7 Histogram ExplicitBounds (미저장)
- **스펙**: `HistogramDataPoint.explicit_bounds` — 버킷 경계값 배열
- **현황**: `storage.Metric.HistogramBuckets` 모델은 있으나, `pdata_parser.go:122-136`에서 `dp.ExplicitBounds()` 호출 없음 → 빈 배열로 저장됨
- **영향**: 히스토그램 버킷 경계를 알 수 없어 분포 시각화 불가

### 2.8 Exemplars (누락)
- **스펙**: `Exemplar` — 메트릭 데이터 포인트에 연결된 샘플 Trace/Span 참조
- **현황**: Gauge/Sum/Histogram 모두 `dp.Exemplars()` 호출 없음
- **영향**: Metrics ↔ Traces 상관관계(RED method) 연결 불가

### 2.9 NumberDataPoint Flags (누락)
- **스펙**: `DataPointFlags` — `DATA_POINT_FLAGS_NO_RECORDED_VALUE_MASK` 등
- **현황**: `dp.Flags()` 저장 안 됨
- **영향**: 값이 없는(no-data) 데이터 포인트와 실제 0값 구분 불가

### 2.10 Instrumentation Scope (누락)
- **스펙**: `ScopeMetrics.scope`
- **현황**: `ilm.Scope()` 저장 안 됨

---

## 3. Logs 미구현 항목

### 3.1 ObservedTimestamp (누락)
- **스펙**: `LogRecord.observed_time_unix_nano` — 컬렉터/백엔드가 로그를 관측한 시각 (Timestamp와 별개)
- **현황**: `lr.ObservedTimestamp()` 호출 없음, `storage.LogRecord`에 필드 없음
- **영향**: 로그 수집 지연 측정 불가

### 3.2 TraceFlags (누락)
- **스펙**: `LogRecord.flags` — W3C TraceFlags
- **현황**: `lr.Flags()` 저장 안 됨

### 3.3 DroppedAttributesCount (누락)
- **스펙**: `LogRecord.dropped_attributes_count`
- **현황**: `lr.DroppedAttributesCount()` 저장 안 됨
- **영향**: SDK가 속성 한도 초과로 드랍한 데이터 감지 불가

### 3.4 Log Body 구조적 타입 손실
- **스펙**: `LogRecord.body`는 `AnyValue` 타입 — string, int, double, bool, bytes, array, kvlist 가능
- **현황**: `lr.Body().AsString()`으로 강제 문자열 변환 (`pdata_parser.go:169`)
- **영향**: JSON 구조체나 배열로 전송된 로그 본문의 구조 정보 유실

### 3.5 Instrumentation Scope (누락)
- **스펙**: `ScopeLogs.scope`
- **현황**: `ill.Scope()` 저장 안 됨

---

## 4. OTLP 프로토콜 미구현 항목

### 4.1 Partial Success 응답 (미구현)
- **스펙**: OTLP 수신 성공 응답에 `rejected_spans` / `rejected_data_points` / `rejected_log_records` 필드 포함 가능
- **현황**: gRPC와 HTTP 모두 `NewExportResponse()`를 그대로 반환 — rejected count 설정 없음
- **영향**: 큐 가득참(`DropOnFull=true`)으로 인한 드랍을 클라이언트가 인지 불가

### 4.2 HTTP 응답 Content-Type 헤더 (누락)
- **스펙**: OTLP/HTTP 응답은 요청의 `Accept` 헤더에 따라 `Content-Type: application/x-protobuf` 또는 `application/json` 반환
- **현황**: `w.WriteHeader(http.StatusOK)`만 반환, Content-Type 없음 (`receiver/http.go:101, 140, 179`)

### 4.3 TLS / mTLS 미지원
- **스펙**: 프로덕션 환경에서 OTLP는 TLS 암호화 권장
- **현황**: gRPC와 HTTP 모두 평문 연결만 지원 (`grpc.NewServer()`, `&http.Server{}`)

### 4.4 인증(Authentication) 미지원
- **스펙**: Bearer Token, API Key 등 헤더 기반 인증
- **현황**: 인증 미들웨어 없음 — 누구나 데이터 전송 가능

### 4.5 gRPC 압축 미지원
- **스펙**: OTLP/gRPC는 gzip 압축 지원
- **현황**: `grpc.NewServer()` 옵션에 압축 설정 없음

### 4.6 CORS 헤더 미지원
- **스펙**: 브라우저 SDK(opentelemetry-js)가 OTLP/HTTP로 직접 전송 시 CORS 필요
- **현황**: HTTP 핸들러에 CORS 헤더 없음

### 4.7 요청 크기 제한 미설정
- **스펙 권장**: 대형 배치 요청 방어를 위한 max request body size 설정
- **현황**: `io.ReadAll(req.Body)` — 제한 없음

---

## 5. Semantic Conventions 미구현 항목

### 5.1 표준 Resource 속성 인덱싱 없음
- **스펙 정의 속성**: `deployment.environment`, `host.name`, `k8s.pod.name`, `k8s.namespace.name`, `container.id` 등
- **현황**: `service.name`만 별도 컬럼으로 추출, 나머지 전부 JSON blob에 저장
- **영향**: 환경/호스트/쿠버네티스 기반 필터링을 DB 인덱스 없이 JSON scan으로만 처리

### 5.2 SpanKind 기반 시맨틱 처리 없음
- **스펙**: CLIENT/SERVER/PRODUCER/CONSUMER/INTERNAL별로 다른 속성 집합을 정의
- **현황**: SpanKind는 정수로만 저장, 시맨틱별 처리 없음
- **영향**: HTTP 스팬의 `http.status_code`, DB 스팬의 `db.statement` 등 구조적 파싱/인덱싱 불가

---

## 6. 파이프라인 기능 미구현

### 6.1 샘플링 (Sampling)
- **스펙**: Head-based sampling (확률적 수신 결정), Tail-based sampling (트레이스 완성 후 결정)
- **현황**: 없음 — 수신된 모든 데이터를 무조건 저장
- **영향**: 고트래픽 환경에서 스토리지 폭증

### 6.2 데이터 변환/처리 프로세서
- **스펙 참조**: OTel Collector의 processor 개념 (attribute processor, filter processor, batch processor)
- **현황**: 배치 처리만 존재, attribute 필터링/변환/마스킹 없음
- **영향**: PII 마스킹, 속성 정규화, 불필요 데이터 필터링 불가

### 6.3 OTLP Exporter (외부 전송)
- **현황**: 수신 전용 백엔드, 다른 백엔드로 포워딩 없음
- **영향**: Jaeger, Tempo, Honeycomb 등 외부 시스템으로의 팬아웃 불가

---

## 우선순위 요약

| 항목 | 영향도 | 구현 난이도 | 우선순위 |
|------|--------|------------|---------|
| ExponentialHistogram 타입 | 높음 (데이터 누락) | 중 | P1 |
| Partial Success 응답 | 높음 (클라이언트 재시도 불가) | 낮 | P1 |
| Histogram ExplicitBounds | 높음 (시각화 불가) | 낮 | P1 |
| SpanLinks | 중 | 중 | P2 |
| TraceState | 중 | 낮 | P2 |
| AggregationTemporality | 중 | 낮 | P2 |
| ObservedTimestamp (Logs) | 중 | 낮 | P2 |
| Log Body 구조적 타입 | 중 | 중 | P2 |
| TLS / 인증 | 높음 (보안) | 높음 | P2 |
| Instrumentation Scope | 낮 | 낮 | P3 |
| Dropped Counts | 낮 | 낮 | P3 |
| Exemplars | 낮 | 높음 | P3 |
| Summary 타입 | 낮 (deprecated) | 중 | P3 |
| CORS | 중 (브라우저 SDK) | 낮 | P3 |
| Semantic Conventions 인덱싱 | 중 | 높음 | P3 |
| Sampling | 중 | 높음 | P4 |

---

## 참고 문서

- [OTLP Specification](https://opentelemetry.io/docs/specs/otlp/)
- [OTel Trace Data Model](https://opentelemetry.io/docs/specs/otel/trace/sdk_exporters/otlp/)
- [OTel Metrics Data Model](https://opentelemetry.io/docs/specs/otel/metrics/data-model/)
- [OTel Logs Data Model](https://opentelemetry.io/docs/specs/otel/logs/data-model/)
- [OTel Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/)
