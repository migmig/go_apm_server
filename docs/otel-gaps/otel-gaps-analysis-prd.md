# OTel & UI Gap Analysis PRD

> 작성일: 2026-03-12
> 기준 스펙: OpenTelemetry Protocol (OTLP) v1.x, OTel Specification v1.x
> 분석 대상: `go_apm_server` 현재 구현체 (웹 UI 및 백엔드 데이터 파이프라인)

---

## 1. 개요 및 목적

본 문서(PRD)는 현재 운영 중인 `go_apm_server`의 사용자 관점 UI(웹 대시보드) 사용성과 백엔드의 OpenTelemetry(OTel) 스펙 준수 여부를 종합적으로 점검한 갭 분석(Gap Analysis) 결과입니다.
목적은 실제 장애 추적(Troubleshooting) 시의 디버깅 효율을 높이고, 타 OTel 생태계와의 상호운용성을 확보하기 위해 개선해야 할 UI/UX 및 데이터 파이프라인(파싱/저장/전송)의 누락 항목을 식별하고 우선순위를 정의하는 데 있습니다.

---

## 2. UI/UX 사용자 관점 갭 (Pain Points)

현재 기본 관측 3종(Trace/Metric/Log)의 접근성과 기본적인 화면 흐름은 확보되었으나, 실무 운영 상황에서 다음과 같은 불편함이 존재합니다.

### 2.1. [P0] Trace 검색 필터 제한 및 딥 다이브 시각화 부족
- **문제점**: UI에서 트레이스 검색이 서비스 이름 위주로 제한되어 있으며(Status, Duration 필터 부재), 상세 워터폴 차트에서는 수많은 Span 중 "에러 원인"이나 "지연 기여도가 높은 Span"을 한눈에 식별하기 어렵습니다.
- **개선안**: 
  - 상단 필터바에 Status(All/OK/Error), Min duration(ms), 상대 시간 프리셋(5m, 1h 등) 제공.
  - URL Query를 통한 필터 상태 공유 기능 제공.
  - Trace 상세 상단에 인시던트 요약 카드(Error span count, Slowest span Top 3 등) 추가 및 오류/시간 중심의 정렬 토글 제공.

### 2.2. [P1] 로그 탐색 컨텍스트 손실 및 접근성 부족
- **문제점**: 로그와 Trace 간의 상호 딥링크(Deep Link)가 부족하여 탐색 흐름이 끊기며, 키보드 내비게이션 및 스크린 리더(ARIA) 등 접근성(A11y) 구조가 미흡합니다.
- **개선안**:
  - 로그 아이템에 Trace/Span 상시 딥링크 노출 및 활성화 필터칩(서비스/TraceID 등) 상단 노출.
  - 핵심 플로우에 Tab 순서 설정, `aria-label`, `aria-live` 반영 및 axe 자동 점검 도입.

### 2.3. [P2] 실시간 업데이트 신뢰성 인지 부족
- **문제점**: 웹소켓 데이터 수신 시 현재 실시간 연결 상태인지 지연 중인지 명확한 시각적 피드백이 부족합니다.
- **개선안**:
  - 글로벌 헤더 등에 연결 상태 배지(Connected / Reconnecting) 노출 및 지연/오프라인 시 Stale 데이터 배너 표시.

---

## 3. OTel 스펙 데이터 및 백엔드 갭 (Data & Protocol Gaps)

현재 OTLP(gRPC/HTTP) 수신 및 SQLite 저장 파이프라인에서 파싱, 저장, 처리되지 않고 유실되는 OTel 스펙 데이터입니다.

### 3.1. Traces 미구현 항목
- **SpanLinks (P2)**: `Span.links` 스펙 미지원. 비동기 메시징이나 Fan-out/In 패턴에서 다른 Trace/Span과의 인과관계 추적 불가.
- **TraceState & Span Flags (P2)**: W3C TraceState 및 Sampling 비트(Flags) 처리 부재. 벤더간 상호운용 및 데이터 신뢰성 표시 불가.
- **Dropped Counts (P3)**: 속성/이벤트/링크가 한도 초과로 드랍된 경우의 count 값 손실.
- **Instrumentation Scope (P3)**: 어떤 계측 라이브러리(버전 등)에서 생성된 스팬인지 추적 불가 (Scope 정보 미저장).

### 3.2. Metrics 미구현 항목
- **ExponentialHistogram & Summary 타입 (P1)**: 동적 버킷을 다루는 ExponentialHistogram과 구형 Summary 타입 파싱 누락. 일부 SDK 데이터가 완전히 유실됨.
- **Histogram ExplicitBounds (P1)**: 히스토그램 버킷의 경계값이 파싱/저장되지 않아 UI에서 분포 시각화 절대 불가.
- **AggregationTemporality & IsMonotonic (P2)**: Delta vs Cumulative 구분 없이 저장되어 향후 쿼리 집계 시 오류 발생 가능 여지 존재.
- **Exemplars (P3)**: 메트릭 데이터에 연결된 Trace/Span 참조(Exemplar) 파싱 부재로 RED 메서드 기반 상관관계 분석 애로.
- **단위(Unit) 및 설명(Description)**: 메트릭 메타데이터 저장 누락.
- **StartTimestamp & NumberDataPoint Flags**: 정확한 rate 계산을 위한 시작 시간 및 no-data 플래그 활용 불가.

### 3.3. Logs 미구현 항목
- **Log Body 구조적 타입 보존 (P2)**: AnyValue 구조의 Log Body(JSON Object, Array 등)를 문자열 지향(`AsString()`)으로 축소 저장하여 원시 구조체 분석 불가능.
- **ObservedTimestamp (P2)**: 실제 수집/관측 시각 필드(`observed_time_unix_nano`) 누락으로, 로그 발생(Timestamp) 대비 파이프라인 수집 지연 시간 계산 불가.
- **TraceFlags & DroppedAttributesCount**: W3C TraceFlag와 속성 드랍 카운트 정보 유실.

### 3.4. OTLP 프로토콜 및 아키텍처 갭
- **Partial Success 응답 (P1)**: 데이터 수신 시 큐 초과(`DropOnFull`) 등으로 인한 일부 데이터 드랍을 클라이언트에게 알려주는 Rejected Count 응답 처리 부재.
- **보안 및 트래픽 제어 (P2)**: TLS/mTLS, 헤더 기반 인증(Authentication), gRPC 압축, 요청 크기 제한 등 프로덕션 레벨의 통신 단 제어 장치 부재.
- **데이터 처리 파이프라인 (P4)**: 수집된 데이터의 샘플링(Sampling), 속성 마스킹(PII), 외부 전송(Exporter Fan-out) 프로세서 부재.
- **Semantic Conventions (P3)**: 환경(Env), 호스트(Host), 프로세스, SpanKind 기준의 정규화된 테이블 인덱싱 부재 (JSON 필드 일괄 검색에 의존).

---

## 4. 우선순위 로드맵 (Execution Roadmap)

사용자 가치(장애 조치 효율)와 데이터 정합성 관점에서 병합된 실행 로드맵입니다.

### Phase 1: 즉시 적용 가시성 확보 (Quick Wins)
*UI 필터 확장 및 주요 데이터 손실 방어*
- [UI] Traces 화면의 고도화된 필터 UI (status, duration, relative time) 및 상태 URL 연동
- [UI] Trace 상세 뷰의 '인시던트 요약 카드 (Error / Slow spans)' 도입
- [Backend] **ExponentialHistogram** 타입 파싱 및 저장 로직 추가
- [Backend] **Histogram ExplicitBounds** 배열 저장 지원 (분포 시각화를 위한 선행 조건)
- [Backend] Partial Success 응답 처리 (SDK의 재전송/폐기 정책 지원)

### Phase 2: 컨텍스트 및 타입 정보 보존 (Context & Structural Fidelity)
*디버깅 흐름 단절 예방 및 원시 데이터 구조 확보*
- [UI] Logs ↔ Traces 간 상호 딥링크 강화 및 웹소켓 실시간 연결 상태 배지 통합
- [Backend] Log Body 원본 구조(Raw JSON) 타입 보존 저장
- [Backend] Metrics의 `AggregationTemporality` 및 `StartTimestamp` 보존
- [Backend] Traces/Metrics/Logs 의 **Instrumentation Scope** 식별 파싱 및 저장

### Phase 3: 분산 연동 및 접근성 확립 (Advanced Interop & A11y)
*심층 분석 호환성 기틀 마련 및 엔터프라이즈 레벨 진입*
- [UI] 키보드 웹 접근성(A11y) 검증, axe 자동화 파이프라인 구축
- [Backend] Traces의 **SpanLinks**, **TraceState**, **TraceFlags** 완전 보존 및 시각화 지원
- [Backend] Logs의 **ObservedTimestamp** 분석 기능 적용
- [Backend] 안전한 운영을 위한 TLS 설정, 인증(Auth), 사이즈 제한, gRPC 압축 설정 등 프로토콜 규격 보완
- [Backend] Semantic Conventions 기반 표준 Resource 컬럼 추출 최적화

### Phase 4+: 아키텍처 확장 (Future Pipeline)
- [Backend] Exemplars 스펙 적용 및 UI RED 대시보드 상관 매핑
- [Backend] OTel Exporter 포워딩 / Tail-based Sampling / Processor 체인 도입
