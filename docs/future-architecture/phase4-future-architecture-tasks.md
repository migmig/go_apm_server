# Phase 4+ (Future Architecture) 작업 관리 체계

본 문서는 [Phase 4+ Technical Specification](phase4-future-architecture-spec.md)의 구현 목록을 바탕으로, 실행 관리를 위한 태스크(Task) 체크리스트를 정의합니다.

## Phase 4.1: Metric ↔ Trace 입체 분석 (Exemplars)

- [ ] **Task 17-1: Exemplar 스토리지 데이터 모델링 (Backend)**
  - `storage.Exemplar` 구조체 정의 (models.go)
  - `metric_exemplars` 관계 테이블 신설 및 마이그레이터(`migrations.go`) 적용 (`metric_name`, `timestamp` 복합 인덱스 포함)

- [ ] **Task 17-2: Exemplar 파서 및 영속성 구현 (Backend)**
  - `ParseMetrics` 함수 수정: `Histogram`, `ExponentialHistogram` 의 DataPoint 순회 시 Exemplar 데이터 수집
  - `InsertExemplars` 메서드 구현 (`sqlite.go`) 및 트랜잭션 Save 반영

- [ ] **Task 17-3: Exemplar 노출 및 분석 API (API)**
  - `GET /api/metrics/exemplars` 라우트 및 핸들러 개발
  - Query Parameter (`metric_name`, `start`, `end`, `limit`) 처리
  - 과부하 방지를 위한 최대 반환 개수(Limit) 필터링

- [ ] **Task 17-4: Exemplar UI 및 딥링크 (Frontend)**
  - `Metrics.tsx` 차트 컴포넌트에 Exemplar 포인터(Scatter) 표시
  - 포인터 클릭 시 연계된 트레이스 상세 경로(`/traces/<trace_id>?span_id=<span_id>`)로 라우팅 이동 처리

## Phase 4.2: 검색 최적화 및 DB 정규화

- [ ] **Task 19-1: Semantic Conventions 스키마 승격 (Backend)**
  - `spans` 테이블 컬럼 확장: `http_method`, `http_route`, `http_status_code`, `db_system`, `db_operation` (`migrations.go`)
  - 빈번한 검색 대상인 `http_route`와 `db_system`에 대해 `CREATE INDEX` 적용

- [ ] **Task 19-2: 데이터 파싱 최적화 (Backend)**
  - `ParseTraces` 구문 내 Attributes 파싱 시, 분리 승격된 Semantic 예약어 항목은 `Attributes` JSON 페이로드에서 제외하여 중복 방지 (Capacity Optimization).
  - SQLite `InsertSpans` SQL 문 변경 및 승격된 필드 바인딩 

- [ ] **Task 19-3: API 고급 검색 쿼리 연동 (API)**
  - `GET /api/traces` 필터 구조체(`storage.TraceFilter`)에 5개 신규 필드 조건(`db_system` 등) 추가
  - `QuerySpans` 함수 내 `WHERE` 절 동적 생성 로직 보강

- [ ] **Task 19-4: 시맨틱 통합 필터 (Frontend)**
  - `Traces.tsx` 검색 폼에 "고급 검색(Advanced Search)" 모달 혹은 확장 토글 구현
  - `http_route`, `db_system` 등 세부 항목을 입력받아 API에 쿼리스트링으로 엮어 요청

## Phase 4.3: OTel Exporter (팬아웃 기반) 구축

- [ ] **Task 18-1: Exporter Config 및 워커 큐 프로토콜 설계 (Backend)**
  - `Config` 구조체에 `ExporterConfig` 도입 (Endpoints, Protocol, Retry 등 명시)
  - 메모리 버퍼 고루틴 채널 생성 (OOM 방지를 위한 QueueSize 한도 지원)

- [ ] **Task 18-2: OTLP Client 송신 로직 구현 (Backend)**
  - 내부 파싱과 별개로 수신된 텔레메트리 페이로드를 외부 Endpoints로 브로드캐스팅(HTTP/gRPC)하는 포워더(`internal/exporter`) 패키지 제작
  - 패킷 유실 방지를 위한 Exponential Backoff & Retry 구문 적용

- [ ] **Task 18-3: 앱 릴리즈 및 문서화 (Docs)**
  - 작업 완료 시 버전 상향(`AppLayout.tsx` 및 백엔드) 및 Prometheus/Jaeger 등과의 연동 시나리오 문서화
