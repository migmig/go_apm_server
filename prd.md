# Go APM Server - PRD (Product Requirements Document)

## 개요

OpenTelemetry 에이전트로부터 트레이스(Trace), 메트릭(Metric), 로그(Log) 데이터를 수신하고, 웹 UI를 통해 시각화하는 경량 APM 서버.

## 목표

- OpenTelemetry Protocol(OTLP) gRPC/HTTP 수신 엔드포인트 제공
- 수신된 데이터를 로컬 스토리지에 저장
- 내장 웹 UI로 트레이스, 메트릭, 로그 조회 및 시각화
- 단일 바이너리로 배포 가능한 경량 서버

## 아키텍처

```
[OTel Agent/SDK] --OTLP gRPC/HTTP--> [Receiver] --> [Processor (Memory Buffer & Batcher)] --> [Storage (Time-partitioned SQLite)]
                                                                                                          |
                                                                         [Web UI] <-- [API Server / Metrics]
```

### 핵심 컴포넌트

| 컴포넌트 | 역할 |
|----------|------|
| OTLP Receiver | gRPC(:4317) / HTTP(:4318) 프로토콜로 텔레메트리 데이터 수신 |
| Processor | `pdata` 패키지를 활용한 데이터 파싱/변환 및 Go Channel/Ring Buffer 기반 비동기 배치(Batch) 처리 (`Memory Buffer & Batcher`) |
| Storage | SQLite 기반 일별(Daily) 파티셔닝 데이터 저장소, WAL 모드 및 JSON1 확장 활용 |
| API Server | REST API로 저장된 데이터 조회 및 프로메테우스 포맷 시스템/비즈니스 지표 제공 (`GET /metrics`) (:8080) |
| Web UI | Vite 기반 SPA (React/Vue/Svelte 등), 빌드 결과물(dist)을 Go `embed`로 포함 |

## 기술 스택

- **언어**: Go 1.22+
- **OTLP 수신 & 파싱**: OpenTelemetry Collector의 `go.opentelemetry.io/collector/pdata` 패키지 활용
- **gRPC**: `google.golang.org/grpc`
- **HTTP Router**: `net/http` (Go 1.22 enhanced routing)
- **Storage**: SQLite (`modernc.org/sqlite` - CGO-free, WAL 모드, JSON1 확장)
- **Web UI**: Vite + (React/Vue/Svelte), 빌드 결과물을 Go `embed`로 바이너리에 포함
- **차트**: 오픈소스 컴포넌트 (Jaeger UI, 간략화된 간트 차트 라이브러리, uPlot 등)

## 구현 단계

### Phase 1: 프로젝트 기반 구축
- [ ] Go 모듈 초기화, 프로젝트 디렉토리 구조 설정
- [ ] SQLite 스키마 설계 및 일별(Daily) DB 파일 파티셔닝 구조 초기화 (예: `apm-2026-03-08.db`)
- [ ] SQLite WAL 모드 (`journal_mode=WAL;`, `synchronous=NORMAL;`) 설정
- [ ] 기본 설정(config) 로딩

### Phase 2: OTLP 수신기 및 프로세서 구현
- [ ] OTLP gRPC 서버 구현 (Trace, Metric, Log 서비스)
- [ ] OTLP HTTP 서버 구현 (protobuf/JSON)
- [ ] `go.opentelemetry.io/collector/pdata` 모듈을 활용한 OTLP 바이트 배열 파싱 (언마샬링/순회)
- [ ] 비동기 배치(Batch) 처리를 위한 Memory Buffer (Go Channel / Ring Buffer) 구현

### Phase 3: 스토리지 계층 (최적화)
- [ ] 트레이스 테이블 (trace_id, span_id, parent_span_id, service_name, operation, duration, status, attributes, timestamp)
- [ ] 메트릭 테이블 (metric_name, type, value, attributes, timestamp)
- [ ] 로그 테이블 (trace_id, span_id, severity, body, attributes, timestamp)
- [ ] OTLP의 `attributes`(태그, 메타데이터)는 SQLite의 JSON1 확장을 활용하여 별도의 정규화 없이 `TEXT` 컬럼에 JSON 포맷으로 저장 및 `json_extract()`로 쿼리
- [ ] 데이터 보존 정책 (TTL): `DELETE FROM` 대신 일별(Daily) DB 파일을 분리하고 오래된 파일을 `os.Remove()`로 통째로 삭제하는 방식(Time-partitioned Database)으로 변경하여 단편화(Fragmentation) 방지 및 I/O 오버헤드 최소화

### Phase 4: REST API & 자기 관측성(Self-Observability)
- [ ] `GET /api/services` - 서비스 목록
- [ ] `GET /api/traces` - 트레이스 검색 (서비스, 시간범위, 상태 필터)
- [ ] `GET /api/traces/:traceId` - 트레이스 상세 (스팬 트리)
- [ ] `GET /api/metrics` - 메트릭 조회 (이름, 시간범위)
- [ ] `GET /api/logs` - 로그 검색 (서비스, 시간범위, severity 필터)
- [ ] `GET /api/stats` - 대시보드용 요약 통계
- [ ] `GET /metrics` - Prometheus 포맷. Go 런타임 지표(GC, 고루틴) 및 파이프라인 지표(큐 사이즈, 처리량/드롭) 노출

### Phase 5: 웹 UI (Vite + SPA)
- [ ] 대시보드: 서비스별 요청 수, 에러율, 응답시간 개요
- [ ] 트레이스 목록: 검색/필터, 서비스별 분류
- [ ] 트레이스 상세: 스팬 타임라인(오픈소스 간트 차트/Jaeger UI 컴포넌트 활용 워터폴 차트), 스팬 속성
- [ ] 로그 뷰: 로그 스트림, 검색, severity 필터
- [ ] 메트릭 뷰: 시계열 차트

### Phase 6: 운영 기능
- [ ] Graceful shutdown
- [ ] Health check 엔드포인트
- [ ] 설정 파일(YAML) 지원
- [ ] Docker 빌드

## 디렉토리 구조

```
go_apm_server/
├── cmd/
│   └── server/
│       └── main.go            # 엔트리포인트
├── internal/
│   ├── config/
│   │   └── config.go          # 설정 로딩
│   ├── receiver/
│   │   ├── grpc.go            # OTLP gRPC 수신
│   │   └── http.go            # OTLP HTTP 수신
│   ├── processor/
│   │   └── processor.go       # 데이터 변환/처리
│   ├── storage/
│   │   ├── sqlite.go          # SQLite 구현
│   │   ├── models.go          # 데이터 모델
│   │   └── migrations.go      # 스키마 마이그레이션
│   └── api/
│       ├── handler.go         # REST API 핸들러
│       └── routes.go          # 라우트 정의
├── web/
│   ├── static/
│   │   ├── css/
│   │   ├── js/
│   │   └── index.html
│   └── embed.go               # go:embed 선언
├── configs/
│   └── config.yaml            # 기본 설정 파일
├── prd.md
├── go.mod
└── go.sum
```

## 설정 예시 (config.yaml)

```yaml
server:
  api_port: 8080

receiver:
  grpc_port: 4317
  http_port: 4318

storage:
  path: "./data/apm.db"
  retention_days: 7
```

## 비기능 요구사항

- **단일 바이너리**: `go build`로 하나의 실행파일 생성, 외부 의존 없음
- **경량**: 메모리 사용량 100MB 이하 (일반 워크로드)
- **호환성**: OpenTelemetry SDK/Agent 표준 OTLP 프로토콜 호환
- **데이터 보존**: 설정 가능한 TTL, 기본 7일

## 향후 확장 고려사항 (현재 스코프 외)

- 알림/알람 규칙 엔진
- 서비스 맵 (서비스 간 의존성 시각화)
- 사용자 인증/인가
- 분산 스토리지 (PostgreSQL, ClickHouse)
- Prometheus remote write 호환
