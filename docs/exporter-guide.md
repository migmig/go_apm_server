# Go APM Server Exporter Guide

Go APM Server(v0.7.0-alpha 이상)는 내장된 스토리지를 넘어 외부 OTel 호환 백엔드로 데이터를 팬아웃(Fan-out)할 수 있는 OTLP Exporter 기능을 지원합니다.

이 문서는 Exporter의 설정 방법, 주요 백엔드(Prometheus, Jaeger, Datadog)와의 연동 시나리오, 그리고 DLQ(Dead Letter Queue) 운영 가이드를 제공합니다.

## 1. Exporter 설정 가이드

`configs/config.yaml` 파일에 `exporter` 섹션을 추가하여 여러 엔드포인트로 데이터를 라우팅할 수 있습니다.

```yaml
exporter:
  endpoints:
    - name: "primary-jaeger"
      url: "http://jaeger-collector:4317"
      protocol: "grpc" # grpc 또는 http/protobuf
      signal_types: ["traces"]
      tls:
        insecure: true
      retry:
        enabled: true
        max_attempts: 3

    - name: "datadog-agent"
      url: "http://datadog-agent:4318"
      protocol: "http/protobuf"
      signal_types: ["traces", "metrics", "logs"]
      headers:
        "DD-API-KEY": "your-datadog-api-key"
      tls:
        insecure: false
      retry:
        enabled: true

  dlq:
    enabled: true
    store_path: "./data/dlq"
    max_size_mb: 1024
    retry_interval: "1m"
```

### 주요 설정 속성
- **`url`**: OTLP 수신 엔드포인트 주소입니다. (gRPC는 주로 `4317`, HTTP는 `4318` 포트를 사용합니다)
- **`protocol`**: `grpc` 또는 `http/protobuf` 중 하나를 선택합니다.
- **`signal_types`**: 이 엔드포인트로 전송할 텔레메트리 타입을 배열로 지정합니다 (`traces`, `metrics`, `logs`).
- **`headers`**: 인증 토큰 등 커스텀 HTTP/gRPC 헤더를 주입합니다.

---

## 2. 연동 시나리오

### 시나리오 A: Jaeger (Traces 전용)
Jaeger는 분산 트레이싱 백엔드입니다. OTLP gRPC 프로토콜을 네이티브로 지원하므로 포트 4317로 바로 전송할 수 있습니다.
```yaml
    - name: "jaeger"
      url: "http://localhost:4317"
      protocol: "grpc"
      signal_types: ["traces"]
      tls:
        insecure: true
```

### 시나리오 B: Prometheus (Metrics 전용)
최신 Prometheus는 OTLP Write Receiver 기능을 지원합니다. 시작 시 `--web.enable-remote-write-receiver` 및 `--enable-feature=otlp-write-receiver` 플래그를 켜고 연동할 수 있습니다.
```yaml
    - name: "prometheus"
      url: "http://localhost:9090/api/v1/otlp"
      protocol: "http/protobuf"
      signal_types: ["metrics"]
      tls:
        insecure: true
```

### 시나리오 C: Datadog Agent (All Signals)
Datadog Agent는 OTLP Ingest 기능을 지원합니다. `datadog.yaml`에서 `otlp_config`를 활성화한 후 로컬 Agent로 전송합니다. Agent가 Datadog 클라우드로 데이터를 포워딩합니다.
```yaml
    - name: "datadog"
      url: "http://localhost:4318"
      protocol: "http/protobuf"
      signal_types: ["traces", "metrics", "logs"]
      tls:
        insecure: true
```

---

## 3. DLQ (Dead Letter Queue) 운영 가이드

네트워크 단절이나 백엔드 장애로 인해 전송이 실패한 텔레메트리 데이터는 유실을 방지하기 위해 로컬 DLQ에 저장됩니다.

### DLQ 동작 방식
1. **저장**: 재시도 횟수를 초과하거나 Circuit Breaker가 Open된 경우, 데이터는 OTLP 바이너리 포맷(`.pb`)으로 `store_path`에 파일로 저장됩니다.
2. **복구**: 백그라운드 워커가 `retry_interval`마다 DLQ 디렉토리를 스캔하여 저장된 데이터를 읽어들인 후 재전송을 시도합니다.
3. **성공 시**: 재전송이 성공하면 DLQ 파일은 자동 삭제됩니다.

### 모니터링
DLQ 상태는 다음 엔드포인트를 통해 실시간으로 모니터링할 수 있습니다.
- `GET /api/exporter/status`
- 반환 정보: 각 엔드포인트별 연결 상태, Circuit Breaker 상태 (Closed/Open/Half-Open), 현재 DLQ에 쌓인 파일 개수.

### 수동 재전송 및 정리
- **수동 재전송**: 서버를 재시작하면 초기화 과정에서 DLQ 워커가 즉시 스캔을 시작합니다.
- **수동 정리**: 디스크 공간이 부족할 경우, 관리자가 `data/dlq/` 경로 내의 오래된 `.pb` 파일들을 OS 명령어로 직접 삭제할 수 있습니다.
- **용량 제한**: `max_size_mb`를 초과할 경우 향후 릴리즈에서 오래된 데이터부터 FIFO 방식으로 자동 삭제되도록 동작할 예정입니다(현재는 물리적 정리 필요 권장).
