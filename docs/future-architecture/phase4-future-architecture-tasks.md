# Phase 4+ (Future Architecture) 작업 관리 체계

본 문서는 [Phase 4+ Technical Specification](phase4-future-architecture-spec.md)의 구현 목록을 바탕으로, 실행 관리를 위한 태스크(Task) 체크리스트를 정의합니다.

## Phase 4.1: Metric ↔ Trace 입체 분석 (Exemplars) — 목표: v0.5.0-alpha

- [x] **Task 17-1: Exemplar 스토리지 데이터 모델링 (Backend)**
  - `storage.Exemplar` 구조체 정의 (models.go) — `metric_id`, `metric_type` 필드 포함
  - `metric_exemplars` 관계 테이블 신설 및 마이그레이터(`migrations.go`) 적용
    - `metric_name`, `timestamp` 복합 인덱스
    - `trace_id` 단일 인덱스
    - `metrics` 테이블 FK 참조 (`ON DELETE CASCADE`)
  - DB 마이그레이션 실행 전 `apm.db` 백업 스크립트 작성

- [x] **Task 17-2: Exemplar 파서 및 영속성 구현 (Backend)**
  - `ParseMetrics` 함수 수정: 아래 메트릭 타입별 DataPoint 순회 시 Exemplar 데이터 수집
    - `Histogram`, `ExponentialHistogram` (주요 대상)
    - `Sum` (Monotonic) — 카운터 급증 시점 추적
    - `Gauge` — 임계값 초과 시점 추적
  - `InsertExemplars` 메서드 구현 (`sqlite.go`) 및 트랜잭션 Save 반영
  - `metric_type` 필드에 출처 메트릭 타입 기록

- [x] **Task 17-3: Exemplar 데이터 보존 정책 (Backend)**
  - `ExemplarConfig` 구조체 도입 (`retention_days`, `max_per_metric`)
  - 백그라운드 고루틴: 1시간 간격으로 보존 기간 초과 데이터 삭제
  - 기본 보존 기간 7일, 메트릭당 최대 반환 개수 100건

- [x] **Task 17-4: Exemplar 노출 및 분석 API (API)**
  - `GET /api/metrics/exemplars` 라우트 및 핸들러 개발
  - Query Parameter (`metric_name`, `start`, `end`, `limit`) 처리
  - 과부하 방지를 위한 최대 반환 개수(Limit) 필터링

- [x] **Task 17-5: Exemplar UI 및 딥링크 (Frontend)**
  - `Metrics.tsx` 차트 컴포넌트에 Exemplar 포인터(Scatter) 표시
  - 포인터 클릭 시 연계된 트레이스 상세 경로(`/traces/<trace_id>?span_id=<span_id>`)로 라우팅 이동 처리

- [ ] **Task 17-6: Exemplar 통합 테스트 (Test)**
  - Exemplar 파싱 단위 테스트: 4가지 메트릭 타입별 Exemplar 추출 검증
  - `InsertExemplars` / `QueryExemplars` DB 통합 테스트
  - API 엔드포인트 테스트: 정상 응답, 빈 결과, limit 초과 시나리오
  - UI E2E 테스트: Scatter 포인트 렌더링 및 딥링크 이동 확인 (Browser MCP)

## Phase 4.2: 검색 최적화 및 DB 정규화 — 목표: v0.6.0-alpha

- [ ] **Task 19-1: Semantic Conventions 스키마 승격 (Backend)**
  - `spans` 테이블 컬럼 확장 (`migrations.go`):
    - `http_method` (TEXT), `http_route` (TEXT), `http_status_code` (INTEGER)
    - `db_system` (TEXT), `db_operation` (TEXT)
    - `rpc_system` (TEXT), `messaging_system` (TEXT)
  - 복합 인덱스 생성:
    - `idx_spans_http_composite`: (`http_method`, `http_route`, `http_status_code`)
    - `idx_spans_db_composite`: (`db_system`, `db_operation`)
  - 단일 인덱스: `http_route`, `db_system`, `rpc_system`, `messaging_system`
  - DB 마이그레이션 실행 전 `apm.db` 백업 스크립트 작성

- [ ] **Task 19-2: 기존 데이터 백필 마이그레이션 (Backend)**
  - `json_extract` 활용하여 기존 `attributes` JSON에서 승격 대상 키 값을 신규 컬럼에 역채움
  - DB 잠금 방지를 위한 배치 단위(1000건) 분할 실행 로직 구현
  - 백필 진행률 로깅 (처리 건수 / 전체 건수)

- [ ] **Task 19-3: 데이터 파싱 최적화 (Backend)**
  - `ParseTraces` 구문 내 Attributes 파싱 시, 분리 승격된 Semantic 예약어 항목(7개 필드)은 `Attributes` JSON 페이로드에서 제외하여 중복 방지 (Capacity Optimization)
  - SQLite `InsertSpans` SQL 문 변경 및 승격된 필드 바인딩

- [ ] **Task 19-4: API 고급 검색 쿼리 연동 (API)**
  - `GET /api/traces` 필터 구조체(`storage.TraceFilter`)에 7개 신규 필드 조건 추가
  - `QuerySpans` 함수 내 `WHERE` 절 동적 생성 로직 보강
  - 복합 필터 조합 시 복합 인덱스 활용 확인 (`EXPLAIN QUERY PLAN` 검증)

- [ ] **Task 19-5: 시맨틱 통합 필터 (Frontend)**
  - `Traces.tsx` 검색 폼에 "고급 검색(Advanced Search)" 모달 혹은 확장 토글 구현
  - `http_route`, `http_method`, `http_status_code`, `db_system`, `db_operation`, `rpc_system`, `messaging_system` 세부 항목 입력 UI
  - API에 쿼리스트링으로 엮어 요청

- [ ] **Task 19-6: 성능 벤치마크 및 테스트 (Test)**
  - 정규화 전/후 쿼리 응답 시간 비교 벤치마크 실행 및 리포트 산출
    - 기준 쿼리: 복합 필터 시나리오 (`http_route` + `db_system` 등)
  - 스키마 마이그레이션 단위 테스트 (컬럼 존재 여부, 인덱스 생성 확인)
  - 백필 마이그레이션 통합 테스트 (기존 데이터 정확성 검증)
  - API 고급 검색 엔드포인트 테스트: 필터 조합별 정상 응답 검증
  - UI E2E 테스트: 고급 검색 모달 렌더링 및 필터 적용 확인 (Browser MCP)

## Phase 4.3: OTel Exporter (팬아웃 기반) 구축 — 목표: v0.7.0-alpha

- [ ] **Task 18-1: Exporter Config 및 워커 큐 프로토콜 설계 (Backend)**
  - `Config` 구조체에 `ExporterConfig` 도입
    - `ExporterEndpoint`: URL, Protocol, SignalTypes(traces/metrics/logs), TLS, Headers, Retry 설정
    - `DLQConfig`: Enabled, StorePath, MaxSizeMB, RetryInterval
  - 메모리 버퍼 고루틴 채널 생성 (QueueSize 한도, NumWorkers 설정)

- [ ] **Task 18-2: 멀티 시그널 OTLP Client 송신 로직 구현 (Backend)**
  - 시그널별 OTLP Client 구현:
    - Traces: `otlptrace` gRPC/HTTP 클라이언트
    - Metrics: `otlpmetric` gRPC/HTTP 클라이언트
    - Logs: `otlplog` gRPC/HTTP 클라이언트
  - 엔드포인트별 `SignalTypes` 설정에 따라 선택적 전송
  - 수신된 텔레메트리 페이로드를 외부 Endpoints로 브로드캐스팅하는 포워더(`internal/exporter`) 패키지 제작

- [ ] **Task 18-3: TLS 및 인증 지원 (Backend)**
  - 엔드포인트별 TLS 인증서 설정 (CertFile, KeyFile, CAFile)
  - mTLS(양방향 TLS) 지원
  - 커스텀 헤더 주입 (Authorization Bearer 토큰 등)
  - `SkipVerify` 옵션 (개발 환경용)

- [ ] **Task 18-4: Circuit Breaker 구현 (Backend)**
  - 엔드포인트별 연속 실패 횟수 추적
  - 임계치(기본 5회) 초과 시 Circuit Open → 전송 중단
  - 대기 시간(기본 30초) 후 Half-Open → 프로브 요청으로 복구 확인
  - Circuit 상태 변경 시 로그 및 내부 메트릭 기록

- [ ] **Task 18-5: DLQ (Dead Letter Queue) 시스템 구현 (Backend)**
  - Retry 한도 초과 / Circuit Open 시 데이터를 로컬 파일시스템 DLQ에 보관
  - 저장 형식: OTLP Proto 바이너리 (`dlq/<signal_type>/<timestamp>_<seq>.pb`)
  - 백그라운드 고루틴이 `RetryInterval` 주기로 DLQ 스캔 → 재전송 시도
  - `MaxSizeMB` 초과 시 FIFO 기반 자동 정리
  - Exporter 시작 시 DLQ 디렉토리 권한 및 디스크 여유 공간 검증

- [ ] **Task 18-6: Exporter 상태 모니터링 API (API)**
  - `GET /api/exporter/status` 엔드포인트 구현
  - 엔드포인트별 연결 상태, Circuit Breaker 상태, 큐 사용량, DLQ 크기, 전송 성공/실패 카운터 반환

- [ ] **Task 18-7: Exporter 통합 테스트 (Test)**
  - 멀티 시그널 팬아웃 단위 테스트: Traces/Metrics/Logs 각각 전송 검증
  - Retry 및 Exponential Backoff 동작 테스트
  - Circuit Breaker 상태 전이 테스트 (Closed → Open → Half-Open → Closed)
  - DLQ 저장/복구/자동정리 통합 테스트
  - TLS 연결 테스트 (자체 서명 인증서 기반)
  - Exporter 상태 API 응답 검증
  - 부하 테스트: 큐 포화(QueueSize 초과) 시 Drop 동작 확인

- [ ] **Task 18-8: 앱 릴리즈 및 문서화 (Docs)**
  - 작업 완료 시 버전 상향(`AppLayout.tsx` 및 백엔드)
  - Prometheus/Jaeger/Datadog 등과의 연동 시나리오 문서화
  - Exporter 설정 가이드 (YAML 예제 포함)
  - DLQ 운영 가이드 (모니터링, 수동 재전송, 정리 방법)
