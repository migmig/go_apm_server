# OTel & UI Gap Analysis - Tasks Checklist

> 작성일: 2026-03-12
> 관련 문서: `docs/otel-gaps/otel-gaps-analysis-prd.md` (PRD), `docs/otel-gaps/otel-gaps-spec.md` (Spec)

## Phase 1: 즉시 적용 가시성 확보 및 OTel 기초 보강 (Quick Wins)

- [x] **Task 1: Trace 검색 필터 고도화 (UI/API)**
  - UI: `status_code` 필터 셀렉트박스 및 `min_duration` 인풋 추가
  - UI: 상대 시간(Relative Time) 프리셋 추가
  - API: `/api/traces` 쿼리에 `status_code`, `min_duration_ms` 파라미터 연동 처리

- [x] **Task 2: TraceDetail 인시던트 요약 카드 (UI)**
  - Trace 상세 상단에 총 에러 스팬 카운트 표시
  - 소요 시간 Top 3 스팬을 요약 카드에 노출

- [x] **Task 3: ExponentialHistogram 타입 수용 (Backend)**
  - `pmetric.MetricTypeExponentialHistogram` 스위치 케이스 파서 추가 및 DB 저장

- [x] **Task 4: Histogram ExplicitBounds 파싱 및 보존 (Backend)**
  - `storage.Metric.HistogramBuckets` 활용을 위해 `dp.ExplicitBounds()` JSON 배열 직렬화 후 DB 저장

- [x] **Task 5: OTLP Partial Success 응답 처리 (Backend)**
  - gRPC/HTTP OTLP 리시버가 큐 드랍 발생 시 `rejected_data_points` 등을 클라이언트(SDK) 측에 응답하도록 로직 수정

- [x] **Task 6: 앱 버전 갱신**
  - 모든 작업 완료 후 `AppLayout.tsx`의 `v0.1.0-alpha`를 `v0.2.0-alpha` (또는 적절한 버전)로 최신화

---

## Phase 2: 컨텍스트 정보 및 타입 보존 (Context & Structural Fidelity)

- [x] **Task 7: Log Body JSON 구조 원형 보존 (Backend)**
  - `AnyValue` 원형을 강제 String 변환(`AsString()`)하지 않고 구조체(JSON)타입 유지시켜 직렬화하여 DB에 저장

- [x] **Task 8: Logs ↔ Traces / Spans 딥링크 (UI)**
  - Logs 항목에 연결 가능한 TraceID가 있을 경우 즉시 이동 링크 포함
  - Trace 상세 뷰의 특정 Span에서 `span_id`를 쿼리로 Logs 화면으로 넘어갈 수 있도록 버튼 추가

- [x] **Task 9: Metrics AggregationTemporality & StartTimestamp (Backend)**
  - 메트릭 스키마에 `Temporality`, `StartTimestamp`, `IsMonotonic` 컬럼 추가 및 파싱 로직 반영

- [x] **Task 10: Instrumentation Scope 파싱 (Backend)**
  - Trace, Metric, Log 파서 전체에 걸쳐 `Scope().Name()`, `Scope().Version()` 파싱 및 `instrumentation_scope` 컬럼 추가

- [x] **Task 11: 앱 버전 갱신**
  - 작업 완료 후 `AppLayout.tsx` 버전 갱신

---

## Phase 3: 분산 연동 심층 분석 및 A11y 보강

- [x] **Task 12: 스크린 리더(A11y) 점검 (UI)**
  - 필터링 입력 폼 및 `TraceList` 테이블에 적절한 `aria-label`, `aria-live` 속성 배포

- [x] **Task 13: SpanLinks, TraceState, TraceFlags 보존 (Backend)**
  - 스키마에 `links`, `trace_state`, `flags` 컬럼 신설 및 분산 Trace 상관관계 로직 준비

- [x] **Task 14: Log ObservedTimestamp 추가 (Backend)**
  - `lr.ObservedTimestamp()` 필드 정보 보존

- [x] **Task 15: OTLP 통신 프로토콜 수준 보안/안정성 확보 (Backend)**
  - TLS 허용 설정 스위치 추가
  - 요청 사이즈(Body Size Limit) 제한 헤더 설정
  - gzip 압축 등 통신 옵션 점검

- [x] **Task 16: 앱 버전 갱신**
  - 작업 완료 후 `AppLayout.tsx` 버전 갱신

---

## Phase 4+: 장기 아키텍처 (Future Pipeline)

- [ ] **Task 17: Exemplars (메트릭-트레이스 상관관계) 분석 구현**
- [ ] **Task 18: OTel Exporter(팬아웃) 구축**
- [ ] **Task 19: Semantic Conventions 기반 DB 인덱싱 정규화**
