# Go APM Server - Tasks

## Phase 1: 프로젝트 기반 구축

- [x] **T-001**: Go 모듈 초기화 (`go mod init`)
- [x] **T-002**: 디렉토리 구조 생성 (`cmd/`, `internal/`, `web/`, `configs/`)
- [x] **T-003**: `internal/config/config.go` - Config 구조체 정의 및 YAML/환경변수/기본값 로딩 (Processor 옵션 포함)
- [x] **T-004**: `configs/config.yaml` - 기본 설정 파일 작성
- [x] **T-005**: `internal/storage/models.go` - 데이터 모델 구조체 정의 (Span, Metric, LogRecord, 필터 등)
- [x] **T-006**: `internal/storage/migrations.go` - SQLite 스키마 DDL (JSON1 대응 및 일별 파티셔닝 구조 고려) 및 마이그레이션 함수
- [x] **T-007**: `internal/storage/sqlite.go` - 일별 DB 파일(`apm-YYYY-MM-DD.db`) 관리 구조체, SQLite 연결, WAL 설정 (`PRAGMA journal_mode=WAL`)
- [x] **T-008**: `cmd/server/main.go` - 엔트리포인트 스켈레톤 (config 로드 → storage 초기화 → 시그널 대기)

## Phase 2: OTLP 수신기 및 프로세서

- [x] **T-009**: OTLP 파싱을 위한 `go.opentelemetry.io/collector/pdata` 의존성 추가
- [x] **T-010**: `internal/processor/processor.go` - Memory Buffer & Batcher (Channel/Ring Buffer 기반 배치 처리기)
- [x] **T-011**: `internal/processor/pdata_parser.go` - `pdata` 활용 OTLP 데이터 파싱 및 내부 모델 변환 함수
  - `TracesUnmarshaler` 등을 이용한 바이트 파싱
  - `service.name` 추출, trace/span ID hex 변환, JSON attributes 텍스트 변환
- [x] **T-012**: `internal/receiver/grpc.go` - gRPC 서버 구현 (수신 데이터를 Memory Buffer로 전달)
- [x] **T-013**: `internal/receiver/http.go` - HTTP 서버 구현 (수신 데이터를 Memory Buffer로 전달)
- [x] **T-014**: main.go에 gRPC/HTTP receiver 및 Processor 연결 및 동시 실행

## Phase 3: 스토리지 구현

- [x] **T-015**: `storage/sqlite.go` - 일별 DB(Time-partitioned)에 따른 동적 DB 선택/라우팅
- [x] **T-016**: `storage/sqlite.go` - InsertSpans 구현 (Bulk INSERT)
- [x] **T-017**: `storage/sqlite.go` - InsertMetrics 구현 (Bulk INSERT)
- [x] **T-018**: `storage/sqlite.go` - InsertLogs 구현 (Bulk INSERT)
- [x] **T-019**: `storage/sqlite.go` - QueryTraces 구현 (필터 적용, `json_extract()` 활용, 여러 일별 DB 쿼리 병합 지원)
- [x] **T-020**: `storage/sqlite.go` - GetTraceByID 구현
- [x] **T-021**: `storage/sqlite.go` - QueryMetrics 구현
- [x] **T-022**: `storage/sqlite.go` - QueryLogs 구현 (body 검색 및 `json_extract()` 필터 적용)
- [x] **T-023**: `storage/sqlite.go` - GetServices 구현
- [x] **T-024**: `storage/sqlite.go` - GetStats 구현
- [x] **T-025**: `storage/sqlite.go` - `DeleteOldPartitions` 구현 (`os.Remove()` 기반 일별 DB 파일 삭제 로직)
- [x] **T-026**: Retention worker 고루틴 (오래된 DB 파티션 주기적 체크 및 삭제)

## Phase 4: REST API & 관측성

- [x] **T-027**: `internal/api/handler.go` - API 핸들러 구조체 (Storage 의존성 주입)
- [x] **T-028**: `internal/api/routes.go` - 라우트 등록 + CORS 미들웨어
- [x] **T-029**: `GET /api/services` 핸들러
- [x] **T-030**: `GET /api/traces` 핸들러 (쿼리 파라미터 파싱, 필터 적용)
- [x] **T-031**: `GET /api/traces/{traceId}` 핸들러
- [x] **T-032**: `GET /api/metrics` 핸들러
- [x] **T-033**: `GET /api/logs` 핸들러
- [x] **T-034**: `GET /api/stats` 핸들러
- [x] **T-035**: `GET /health` 핸들러
- [x] **T-036**: `GET /metrics` 핸들러 (Prometheus 포맷의 Go 런타임 및 수신 파이프라인 지표 노출)
- [x] **T-037**: main.go에 API 서버 연결

## Phase 5: Web UI (Vite SPA)

- [ ] **T-038**: `web/` 디렉토리에 Vite 프로젝트 초기화 (`npm create vite@latest`)
- [ ] **T-039**: `web/embed.go` - 빌드 결과물(`dist`)에 대한 `go:embed` 선언 및 서빙 핸들러 작성
- [ ] **T-040**: 라우터, API 클라이언트 설정
- [ ] **T-041**: 대시보드 페이지 (요청 수, 에러율 통계 및 최근 트레이스 목록)
- [ ] **T-042**: 트레이스 목록 페이지 (검색 및 필터링 기능)
- [ ] **T-043**: 트레이스 상세 페이지 (오픈소스 간트 차트 또는 Jaeger UI 컴포넌트를 연동한 워터폴 차트 구현) 및 스팬 속성 사이드 패널
- [ ] **T-044**: 로그 뷰어 페이지 (로그 스트림, 검색/필터)
- [ ] **T-045**: 메트릭 뷰 페이지 (시계열 차트 라이브러리 연동)
- [ ] **T-046**: 프론트엔드 빌드 파이프라인을 Go 빌드 및 `Makefile`에 통합

## Phase 6: 운영 기능

- [x] **T-047**: Graceful shutdown 구현 (리스너 닫기 → 요청 대기 → Batch Processor flush → Storage 닫기)
- [x] **T-048**: `configs/config.yaml` 완성 및 CLI `--config` 플래그
- [ ] **T-049**: Dockerfile 작성 (프론트엔드 빌드(Node) + Go 빌드 멀티스테이지)
- [ ] **T-050**: Makefile 업데이트 (`build`, `run`, `docker-build`, `build-web` 추가)

## Phase 7: 테스트 및 검증

- [x] **T-051**: OTel SDK로 테스트 데이터 전송하는 예제 클라이언트 작성
- [ ] **T-052**: storage 패키지 단위 테스트 (일별 파티셔닝 구조 검증)
- [x] **T-053**: API 핸들러 통합 테스트
- [ ] **T-054**: Batch Processor 및 pdata 파싱 단위 테스트
- [ ] **T-055**: 전체 E2E 테스트 (에이전트 → 배치 수신 → 일별 DB 저장 → API 조회 → UI 확인)
