# Go APM Server - Tasks

## Phase 1: 프로젝트 기반 구축 ✅

- [x] **T-001**: Go 모듈 초기화 (`go mod init`)
- [x] **T-002**: 디렉토리 구조 생성 (`cmd/`, `internal/`, `web/`, `configs/`)
- [x] **T-003**: `internal/config/config.go` - Config 구조체 정의 및 YAML/환경변수/기본값 로딩
- [x] **T-004**: `configs/config.yaml` - 기본 설정 파일 작성
- [x] **T-005**: `internal/storage/models.go` - 데이터 모델 구조체 정의 (Span, Metric, LogRecord, 필터 등)
- [x] **T-006**: `internal/storage/migrations.go` - SQLite 스키마 DDL 및 마이그레이션 함수
- [x] **T-007**: `internal/storage/sqlite.go` - SQLite 연결, WAL 설정, Storage 인터페이스 정의
- [x] **T-008**: `cmd/server/main.go` - 엔트리포인트 스켈레톤 (config 로드 → storage 초기화 → 시그널 대기)

## Phase 2: OTLP 수신기 ✅

- [x] **T-009**: OTLP protobuf 의존성 추가 (`go.opentelemetry.io/proto/otlp`, `google.golang.org/grpc`)
- [x] **T-010**: `internal/processor/processor.go` - OTLP protobuf → 내부 모델 변환 함수
  - ResourceSpans → []Span 변환
  - ResourceMetrics → []Metric 변환
  - ResourceLogs → []LogRecord 변환
  - service.name 추출, trace_id/span_id hex 인코딩, attributes 변환
- [x] **T-011**: `internal/receiver/grpc.go` - gRPC 서버 구현
  - TraceService.Export 핸들러
  - MetricsService.Export 핸들러
  - LogsService.Export 핸들러
- [x] **T-012**: `internal/receiver/http.go` - HTTP 서버 구현
  - `POST /v1/traces` (protobuf + JSON)
  - `POST /v1/metrics` (protobuf + JSON)
  - `POST /v1/logs` (protobuf + JSON)
- [x] **T-013**: main.go에 gRPC/HTTP receiver 연결 및 동시 실행

## Phase 3: 스토리지 구현 ✅

- [x] **T-014**: `storage/sqlite.go` - InsertSpans 구현 (배치 INSERT)
- [x] **T-015**: `storage/sqlite.go` - InsertMetrics 구현
- [x] **T-016**: `storage/sqlite.go` - InsertLogs 구현
- [x] **T-017**: `storage/sqlite.go` - QueryTraces 구현 (필터, 페이징, TraceSummary 집계)
- [x] **T-018**: `storage/sqlite.go` - GetTraceByID 구현 (스팬 전체 반환)
- [x] **T-019**: `storage/sqlite.go` - QueryMetrics 구현
- [x] **T-020**: `storage/sqlite.go` - QueryLogs 구현 (body 검색 포함)
- [x] **T-021**: `storage/sqlite.go` - GetServices 구현 (서비스별 집계)
- [x] **T-022**: `storage/sqlite.go` - GetStats 구현 (대시보드 통계, P99 계산)
- [x] **T-023**: `storage/sqlite.go` - DeleteOlderThan 구현 (TTL 정리)
- [x] **T-024**: Retention worker 고루틴 (1시간 간격 실행)

## Phase 4: REST API ✅

- [x] **T-025**: `internal/api/handler.go` - API 핸들러 구조체 (Storage 의존성 주입)
- [x] **T-026**: `internal/api/routes.go` - 라우트 등록 + CORS 미들웨어
- [x] **T-027**: `GET /api/services` 핸들러
- [x] **T-028**: `GET /api/traces` 핸들러 (쿼리 파라미터 파싱, 필터 적용)
- [x] **T-029**: `GET /api/traces/{traceId}` 핸들러
- [x] **T-030**: `GET /api/metrics` 핸들러
- [x] **T-031**: `GET /api/logs` 핸들러
- [x] **T-032**: `GET /api/stats` 핸들러
- [x] **T-033**: `GET /health` 핸들러
- [x] **T-034**: main.go에 API 서버 연결

## Phase 5: Web UI ✅

- [x] **T-035**: `web/embed.go` - go:embed 선언
- [x] **T-036**: `web/static/index.html` - SPA 레이아웃 (사이드바 네비게이션, 콘텐츠 영역)
- [x] **T-037**: `web/static/css/style.css` - 다크 테마 기본 스타일
- [x] **T-038**: `web/static/js/app.js` - Hash 라우터, API 클라이언트, 공통 유틸
- [x] **T-039**: `web/static/js/dashboard.js` - 대시보드 페이지
  - 서비스 카드 (요청 수, 에러율, 평균 응답시간)
  - 최근 트레이스 목록
- [x] **T-040**: `web/static/js/traces.js` - 트레이스 목록 페이지
  - 서비스/시간범위/상태/duration 필터
  - 트레이스 테이블 (페이징)
- [x] **T-041**: `web/static/js/trace-detail.js` - 트레이스 상세 페이지
  - 스팬 워터폴 타임라인 (SVG)
  - 스팬 클릭 시 속성 사이드 패널
- [x] **T-042**: `web/static/js/logs.js` - 로그 뷰어 페이지
  - severity 필터, 검색, 서비스 필터
  - 로그 스트림 테이블
- [x] **T-043**: `web/static/js/metrics.js` - 메트릭 페이지
  - 메트릭 이름 선택
  - SVG 시계열 차트
- [x] **T-044**: API 서버에 정적 파일 서빙 연결 (`/` → embed.FS)

## Phase 6: 운영 기능 ✅

- [x] **T-045**: Graceful shutdown 구현 (리스너 닫기 → 요청 대기 → storage 닫기)
- [x] **T-046**: `configs/config.yaml` 완성 및 CLI `--config` 플래그
- [x] **T-047**: Dockerfile 작성 (멀티스테이지 빌드)
- [x] **T-048**: Makefile 작성 (`build`, `run`, `docker-build`)

## Phase 7: 테스트 및 검증 ✅

- [x] **T-049**: OTel SDK로 테스트 데이터 전송하는 예제 클라이언트 작성
- [x] **T-050**: storage 패키지 단위 테스트 (6 tests PASS)
- [x] **T-051**: API 핸들러 통합 테스트 (7 tests PASS)
- [x] **T-052**: gRPC receiver 수신 테스트 (E2E에서 검증)
- [x] **T-053**: 전체 E2E 테스트 (에이전트 → 수신 → 저장 → API 조회 → UI 확인)
