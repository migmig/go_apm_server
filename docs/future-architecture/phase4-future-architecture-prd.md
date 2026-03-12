# APM Server Phase 4+ (Future Architecture) PRD

## 1. 개요 (Overview)
현재 APM Server 인프라 구성은 경량화된 통합 관측 환경 제공에 초점을 맞추어 단일 SQLite 및 Go 백엔드로 구성되어 있습니다. 
하지만 서비스가 확장되거나 OTel 트래픽 규모 구조가 거대해질 경우, 단일 스토리지/쿼리의 한계와 메트릭-트레이스의 유기적 연동 분석에 한계가 발생할 수 있습니다.
Phase 4+에서는 **성능 고도화, 유연한 외부 시스템 확장 파이프라인 적용, 그리고 Exemplar 분석 도입** 등을 메인 과제로 삼아, 장기 아키텍처의 비전을 구축하고 실행 가능한 로드맵으로 세분화합니다.

## 2. 상세 과제 정리 (Detailed Tasks)

### 2.1 Task 17: Exemplars (메트릭-트레이스 상관관계) 분석 구현
- **배경**: 현재 Metric의 통계 수치(Histogram 등)와 실제 이 수치를 만들어 낸 Trace/Span 컨텍스트가 논리적으로 단절되어 있습니다. 레이턴시 스파이크가 발생했을 때 이 수치를 유발한 실제 에러나 슬로우 쿼리 트레이스를 빠르게 역추적하기 위해서는 Exemplar 데이터를 통한 연관 분석이 반드시 필요합니다.
- **구현 명세 (Backend)**
  - 메트릭 파서(`internal/processor/pdata_parser.go`)에서 Metric 스키마 내에 존재하는 `Exemplars` 데이터를 추출.
  - 추출한 데이터(`timestamp`, `value`, `trace_id`, `span_id`)를 보관할 DB 스키마(`metric_exemplars` 관계 테이블 등) 신설.
- **구현 명세 (API & UI)**
  - API 측면: Metric 조회 API 요청 시, 특정 타임라인에 연관된 Exemplar 목록 반환 기능 개발.
  - 프론트엔드: 시계열 차트 혹은 히스토그램 뷰에서 특정 지점을 클릭(인터랙션)하면, Exemplar 데이터를 표시해 주고 바로 TraceDetail 뷰로 도약하는 딥링크 추가.

### 2.2 Task 18: OTel Exporter (팬아웃 파이프라인) 구축
- **배경**: 현재는 내부 스토리지만을 바라보고 데이터가 적재됩니다. 대규모 서비스로 전환하게 되어 내부 내장 SQLite의 스토리지 용량을 넘어서거나, 외부의 전문적인 분석 툴(Elasticsearch, Prometheus, Jaeger, Datadog 등)의 힘을 빌려야 할 경우 확장성에 제약이 있습니다. 
- **구현 명세 (Backend)**
  - OTLP 데이터를 메모리 큐에서 읽어들인 이후, SQLite에 파싱해 넣을 뿐 아니라 OTLP 스펙 그대로 지정된 외부 호스트로 브로드캐스트 전송(팬아웃)하는 **Exporter 서비스 모듈 신규 개발**.
  - `internal/config/config.go` 를 고도화하여 내보낼 Endpoints 목록 배포(`exporter.otlp.endpoint` 등).
  - 대량 트래픽 통신 안정성을 위한 전송 실패 재시도 로직(Retry mechanism) 및 지수 백오프(Exponential Backoff), DLQ(Dead Letter Queue) 시스템 기초 적용.

### 2.3 Task 19: Semantic Conventions 기반 DB 인덱싱 정규화 및 검색 최적화
- **배경**: 현재 유연성을 위해 거의 모든 부가 정보(Attributes, ResourceAttributes)가 JSON 문자열 포맷으로 DB의 TEXT 컬럼에 삽입되어 있습니다. 시간이 지남에 따라 HTTP 경로(`http.target`)나 데이터베이스 시스템 종류(`db.system`) 등 주요 메타데이터를 기반으로 쿼리하는 요구사항이 많아지면, JSON 전문 스캔(Full Scan)으로 인한 심각한 I/O 병목이 발생할 것입니다.
- **구현 명세 (Schema Design)**
  - OTel 공식 **Semantic Conventions** 상 빈번한 검색 필터 조건으로 쓰이는 속성 추출 그룹핑 (`http.method`, `http.route`, `http.status_code`, `db.system`, `db.operation` 등).
  - 추출된 핵심 필드들을 실제 테이블 컬럼으로 정규화하여 `ALTER TABLE`을 통해 승격.
- **구현 명세 (Backend & UI)**
  - 승격된 컬럼들에 대해 복합 `CREATE INDEX` 적용.
  - UI 상에 "상세 검색/고급 필터 옵션 모달"을 제공하고, 해당 컬럼 기반의 고속 필터링 API 엔드포인트 연동.

## 3. 마일스톤 및 릴리즈 계획 (Milestones)

| 마일스톤 버전 | 목표 주제 | 포함 Task | 예상 산출물 |
|:---:|---|---|---|
| **v0.5.0-alpha** | **Metric ↔ Trace 입체 분석** | Task 17 | DB 마이그레이션 (`exemplars` 테이블 추가), 대시보드 내 스파이크 추적 차트 위젯 도입 |
| **v0.6.0-alpha** | **검색 엔진 수준의 고속 필터링 최적화** | Task 19 | OTel 표준 필드 정규화, 고도화된 UI 검색 패널 추가, 쿼리 응답 테스트 지표 개선 리포트 |
| **v0.7.0-alpha** | **엔터프라이즈급 확장성(팬아웃) 모듈** | Task 18 | OTLP Exporter 구현체 코드, 멀티 엔드포인트 설정 파일 반영, Prometheus 연동 가이드 문서 |

## 4. 기대 효과 (Impact)
1. **문제 해결 속도(MTTR) 단축**: 단순 지표 파악 수준을 넘어, 스파이크의 물리적 원인(Exemplar/Tracing)으로 단 한 번의 클릭을 통해 직행하여 디버깅 생산성이 폭등.
2. **APM 솔루션 유연성**: 스케일 아웃이 필요한 규모에서는 SQLite 구조 한계를 Exporter로 바이패스(Bypass)할 수 있어 대규모 기업형 생태계에도 하위 호환 구조로 투입 가능.
3. **사용성 극대화**: 정규화 파이프라인 도입을 통한 체감 로딩/검색 속도(Query Latency) 획기적 증가.
