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
[OTel Agent/SDK] --OTLP gRPC/HTTP--> [Receiver] --> [Processor] --> [Storage]
                                                                        |
                                                        [Web UI] <-- [API Server]
```

### 핵심 컴포넌트

| 컴포넌트 | 역할 |
|----------|------|
| OTLP Receiver | gRPC(:4317) / HTTP(:4318) 프로토콜로 텔레메트리 데이터 수신 |
| Processor | 수신 데이터 파싱, 변환, 배치 처리 |
| Storage | SQLite 기반 로컬 저장소 (트레이스, 메트릭, 로그) |
| API Server | REST API로 저장된 데이터 조회 (:8080) |
| Web UI | 내장 SPA (Go embed), 대시보드/트레이스뷰/로그뷰 |

## 기술 스택

- **언어**: Go 1.22+
- **OTLP 수신**: `go.opentelemetry.io/collector/receiver/otlpreceiver` 또는 직접 protobuf 구현
- **gRPC**: `google.golang.org/grpc`
- **HTTP Router**: `net/http` (Go 1.22 enhanced routing)
- **Storage**: SQLite (`modernc.org/sqlite` - CGO-free)
- **Web UI**: HTML/CSS/JS (Go `embed`로 바이너리에 포함)
- **차트**: 프론트엔드 경량 차트 라이브러리 (Chart.js 또는 uPlot)

## 구현 단계

### Phase 1: 프로젝트 기반 구축
- [ ] Go 모듈 초기화, 프로젝트 디렉토리 구조 설정
- [ ] SQLite 스키마 설계 및 DB 초기화
- [ ] 기본 설정(config) 로딩

### Phase 2: OTLP 수신기 구현
- [ ] OTLP gRPC 서버 구현 (Trace, Metric, Log 서비스)
- [ ] OTLP HTTP 서버 구현 (protobuf/JSON)
- [ ] 수신 데이터를 Storage에 저장하는 파이프라인

### Phase 3: 스토리지 계층
- [ ] 트레이스 테이블 (trace_id, span_id, parent_span_id, service_name, operation, duration, status, attributes, timestamp)
- [ ] 메트릭 테이블 (metric_name, type, value, attributes, timestamp)
- [ ] 로그 테이블 (trace_id, span_id, severity, body, attributes, timestamp)
- [ ] 데이터 보존 정책 (TTL 기반 자동 삭제)

### Phase 4: REST API
- [ ] `GET /api/services` - 서비스 목록
- [ ] `GET /api/traces` - 트레이스 검색 (서비스, 시간범위, 상태 필터)
- [ ] `GET /api/traces/:traceId` - 트레이스 상세 (스팬 트리)
- [ ] `GET /api/metrics` - 메트릭 조회 (이름, 시간범위)
- [ ] `GET /api/logs` - 로그 검색 (서비스, 시간범위, severity 필터)
- [ ] `GET /api/stats` - 대시보드용 요약 통계

### Phase 5: 웹 UI
- [ ] 대시보드: 서비스별 요청 수, 에러율, 응답시간 개요
- [ ] 트레이스 목록: 검색/필터, 서비스별 분류
- [ ] 트레이스 상세: 스팬 타임라인(워터폴 차트), 스팬 속성
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
