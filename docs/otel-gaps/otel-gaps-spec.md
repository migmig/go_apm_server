# OTel & UI Gap Analysis - Technical Specification

> 작성일: 2026-03-12
> 관련 PRD: `docs/otel-gaps/otel-gaps-analysis-prd.md`

본 문서는 OTel 스펙 미구현 항목과 UI/UX 사용성 개선을 위한 기술 명세(Spec)를 정의합니다.

---

## 1. 백엔드 스토리지 스키마 변경 (SQLite)

OTel 스펙의 데이터 손실을 방지하고 구조적 보존을 위해 DB 스키마 업데이트가 필요합니다.

### 1.1. Traces (Span 테이블)
- **신규 컬럼**:
  - `links` (TEXT): SpanLinks의 JSON 배열 보존
  - `trace_state` (TEXT): W3C TraceState 문자열 보존
  - `flags` (INTEGER): Span Flags 보존
  - `instrumentation_scope` (TEXT): 계측 라이브러리 정보 (name, version) JSON
- **인덱스 추가**: 조회 성능 향상을 위해 `status_code`, `duration_ns` 인덱스 추가 검토

### 1.2. Metrics 테이블
- **신규 수용 타입**: `exponential_histogram`, `summary` 타입 처리 로직 추가 (기존 `metric_type` 컬럼 활용 및 확장)
- **신규 컬럼**:
  - `start_timestamp` (INTEGER): 시작 시간 (Start_time_unix_nano)
  - `aggregation_temporality` (INTEGER): 델타/누적 플래그
  - `is_monotonic` (BOOLEAN): 단조 증가 여부
  - `explicit_bounds` (TEXT): Histogram 버킷 사이즈 경계 배열 (JSON)
  - `unit` (TEXT), `description` (TEXT): 메타데이터
  - `instrumentation_scope` (TEXT): 계측 정보

### 1.3. Logs 테이블
- **데이터 구조 보존**:
  - `body` 컬럼에 단순히 `.AsString()` 처리된 텍스트가 아닌, AnyValue의 구조(JSON/Array/Map)를 직렬화한 JSON 문자열 저장
- **신규 컬럼**:
  - `observed_timestamp` (INTEGER): 관측 시각 보존

---

## 2. 백엔드 파서 및 API 명세 변경

### 2.1. OTLP Receiver 파서 (`pdata_parser.go`)
- **Trace 파서**:
  - `sp.Links()`를 순회하여 직렬화.
  - `ils.Scope()` 정보를 추출해 Span에 주입.
- **Metric 파서**:
  - `pmetric.MetricTypeExponentialHistogram` 및 `pmetric.MetricTypeSummary` switch-case 추가 및 데이터 추출.
  - `dp.ExplicitBounds()`를 추출하여 저장.
- **Log 파서**:
  - `lr.Body()`의 타입을 판별(TypeString, TypeMap, TypeSlice 등)하여 JSON Marshal 후 저장.
  - `lr.ObservedTimestamp()` 저장.

### 2.2. REST API 변경
- **`GET /api/traces`**:
  - 쿼리 파라미터 추가 지원: `status_code`, `min_duration_ms`
  - 응답에 새로 추가된 컬럼 데이터 포함.
- **응답 헤더 처리**:
  - OTLP gRPC/HTTP Receiver에서 Partial Success (Rejected counts) 반환 로직 추가.

---

## 3. 프론트엔드 UI/UX 컴포넌트 명세

### 3.1. Traces 검색 필터 고도화 (`Traces.tsx`)
- **UI 컨트롤**:
  - Status Select 콤보박스 (All / OK / Error)
  - Min Duration Input (ms 단위 숫자)
  - 상대 시간 드롭다운 (5m, 1h, 24h 등)
- **로직**: React Router의 `useSearchParams`를 활용하여 URL Query Parameter 실시간 동기화. API 요청 시 해당 파라미터 전달.

### 3.2. TraceDetail 인시던트 가시성 강화 (`TraceDetail.tsx`)
- **신규 컴포넌트**: `<IncidentSummaryCard />`
  - 에러 스팬 총합 표시
  - 전체 소요 시간 대비 가장 느린 Top 3 스팬을 리스트 형태로 렌더링.
- **워터폴 토글**: "오류 스팬만 보기", "지연(500ms 이상) 스팬만 보기" 상태 버튼 제공하여 `flattenedNodes` 필터링 수행.

### 3.3. Logs ↔ Traces 컨텍스트 딥링크 복원
- **로직**: 로그 아이템 내 `TraceID` 렌더링 시, 클릭하면 `/traces/:traceId` 로 즉시 이동. 그리고 트레이스 상세의 스팬에서도 해당 스팬의 로그 검색 뷰(`?trace_id=xxx&span_id=yyy`)로 이동할 수 있는 바로가기 버튼 제공.

### 3.4. 글로벌 상태 및 접근성(A11y)
- 헤더 영역에 WebSocket `isPaused`, `isConnected` 모드 뱃지 표시 강화.
- 폼 컨트롤에 `aria-label` 부여 및 키보드 조작 검증.

---

## 4. 버전 관리 정책

작업이 완료될 때마다 사용자 요구사항에 따라 `AppLayout.tsx` 내의 애플리케이션 버전을 갱신(`v0.x.x`)해야 합니다.
