# WebSocket 실시간 스트리밍 UI 구현 계획

## Context

현재 APM 서버의 UI는 `setInterval`로 10초마다 REST API를 폴링하여 데이터를 갱신합니다 (Dashboard.tsx:58-63). OTLP 데이터가 수집되어도 UI에 즉시 반영되지 않아 모니터링 도구로서의 실시간성이 떨어집니다. WebSocket을 도입하여 서버에서 새 데이터가 들어올 때 **실제 데이터를 WS로 직접 스트리밍**하여 UI에 즉시 반영합니다.

## 현재 아키텍처

- **Backend**: Go `net/http` 서버, SQLite 파티셔닝 스토리지, batch Processor (`processor.go`)
- **Frontend**: React 18 + Vite + TypeScript + Tailwind, axios 기반 REST 호출
- **데이터 흐름**: OTLP → Receiver → Processor(channel + batch) → Storage → REST API → UI (10초 폴링)

## 작업 순서

### Step 1: PRD 문서 생성
- **파일**: `docs/websocket-realtime-prd.md`
- WebSocket 실시간 스트리밍 기능의 요구사항, 범위, 비기능 요구사항 정의

### Step 2: Backend - WebSocket Hub 및 스트리밍

#### 2-1. WebSocket 라이브러리 추가
- `nhooyr.io/websocket` 추가 (Go 표준에 가깝고 context 지원 우수)
- `go get nhooyr.io/websocket`

#### 2-2. Hub(브로드캐스트 매니저) 구현
- **새 파일**: `internal/api/ws_hub.go`
- Hub 구조체: 클라이언트 등록/해제, 구독 채널별 관리
- 클라이언트별 구독 타입 지원 (dashboard / traces / logs)
- 클라이언트 연결 수 제한 (최대 100개)

#### 2-3. WS 메시지 프로토콜 (실제 데이터 스트리밍)

```jsonc
// === Server → Client ===

// Dashboard: stats + services 전체 데이터 push
{
  "type": "stats",
  "payload": { "total_traces": 1234, "total_spans": 5678, ... }
}
{
  "type": "services",
  "payload": [{ "name": "api-gateway", "span_count": 100, ... }]
}

// Traces: 새로 들어온 trace 요약 데이터 push
{
  "type": "traces",
  "payload": [{ "trace_id": "abc123", "root_service": "api", "duration_ms": 42, ... }]
}

// Logs: 새로 들어온 로그 레코드 push (스트리밍 모드일 때만)
{
  "type": "logs",
  "payload": [{ "timestamp": "...", "service_name": "api", "body": "...", ... }]
}

// 연결 확인 (30초 간격)
{ "type": "ping" }

// === Client → Server ===

// 구독 시작/중지 (logs 페이지에서 사용자가 토글)
{ "action": "subscribe", "channel": "logs", "filter": { "service": "api" } }
{ "action": "unsubscribe", "channel": "logs" }

// Dashboard/Traces는 WS 연결 시 자동 구독
{ "action": "subscribe", "channel": "dashboard" }
{ "action": "subscribe", "channel": "traces" }
```

#### 2-4. WebSocket 핸들러 등록
- **수정 파일**: `internal/api/routes.go`
- `GET /ws` 엔드포인트 추가
- WebSocket upgrade + Hub 클라이언트 등록
- **수정 파일**: `internal/api/handler.go` - Handler에 Hub 필드 추가

#### 2-5. Processor → Hub 실데이터 브로드캐스트
- **수정 파일**: `internal/processor/processor.go`
- `OnFlush` 콜백 추가: flush 시 저장된 spans/logs/metrics 원본 데이터를 Hub으로 전달
- Hub은 수신된 데이터를 각 구독 채널별로 가공하여 클라이언트에 push
  - `dashboard` 구독자: flush 후 storage에서 stats/services를 조회하여 push
  - `traces` 구독자: 새 span들에서 TraceSummary를 생성하여 push
  - `logs` 구독자: 새 로그 레코드 원본을 그대로 push
- **수정 파일**: `cmd/server/main.go` - Hub 생성, Processor 콜백 연결

### Step 3: Frontend - WebSocket 클라이언트

#### 3-1. WebSocket 커넥션 매니저
- **새 파일**: `web/src/lib/websocket.ts`
- 네이티브 WebSocket 사용 (별도 라이브러리 불필요)
- 자동 재연결 (exponential backoff: 1s → 2s → 4s → ... → 30s max)
- 메시지 타입별 리스너 등록/해제
- subscribe/unsubscribe 메시지 전송
- 연결 상태 관리 (connected/disconnected/reconnecting)

#### 3-2. React Context & Hook
- **새 파일**: `web/src/hooks/useWebSocket.ts`
- `WebSocketProvider` context: 앱 전체에 단일 WS 커넥션 공유
- `useWSChannel(channel, handler)`: 특정 채널 데이터 수신 hook
- `useWSStatus()`: 연결 상태 조회

#### 3-3. 페이지별 실시간 스트리밍 적용

**Dashboard** (`web/src/pages/Dashboard.tsx`)
- WS 연결 시 `subscribe: dashboard` 전송
- `stats` / `services` 메시지 수신 시 state 직접 업데이트 (REST 재호출 불필요)
- 기존 10초 폴링 → 30초 fallback (WS 끊겼을 때만 동작)

**Traces** (`web/src/pages/Traces.tsx`)
- WS 연결 시 `subscribe: traces` 전송
- `traces` 메시지 수신 시 목록 상단에 새 trace 추가
- "N건의 새 트레이스" 배너 표시 (사용자가 스크롤 중일 때)

**Logs** (`web/src/pages/Logs.tsx`)
- **스트리밍 토글 버튼** 추가 (Play/Pause 아이콘)
- 토글 ON: `subscribe: logs` → 새 로그가 실시간으로 목록에 추가됨
- 토글 OFF: `unsubscribe: logs` → 기존 REST 방식으로 조회
- 필터(service, severity) 변경 시 unsubscribe → 새 필터로 재구독

#### 3-4. 연결 상태 UI
- **수정 파일**: `web/src/components/AppLayout.tsx`
- 사이드바 하단에 WS 연결 상태 인디케이터
  - 초록 dot + "실시간" = connected
  - 빨간 dot + "연결 끊김" = disconnected
  - 노란 dot (깜빡임) + "재연결 중..." = reconnecting

### Step 4: App 통합
- **수정 파일**: `web/src/App.tsx` - `WebSocketProvider`로 감싸기

## 수정할 핵심 파일 목록

| 파일 | 변경 |
|------|------|
| `docs/websocket-realtime-prd.md` | **신규** - PRD 문서 |
| `go.mod` | `nhooyr.io/websocket` 의존성 추가 |
| `internal/api/ws_hub.go` | **신규** - Hub + 클라이언트 관리 + 채널별 브로드캐스트 |
| `internal/api/routes.go` | `/ws` 엔드포인트 추가, Hub을 Handler에 주입 |
| `internal/api/handler.go` | Handler에 Hub 필드 추가, WS 핸들러 메서드 |
| `internal/processor/processor.go` | OnFlush 콜백 (실데이터 전달) |
| `cmd/server/main.go` | Hub 생성, Processor 콜백 연결 |
| `web/src/lib/websocket.ts` | **신규** - WS 커넥션 매니저 |
| `web/src/hooks/useWebSocket.ts` | **신규** - React Context + Hook |
| `web/src/App.tsx` | WebSocketProvider 래핑 |
| `web/src/pages/Dashboard.tsx` | WS로 stats/services 실시간 수신 |
| `web/src/pages/Traces.tsx` | WS로 새 trace 실시간 수신 |
| `web/src/pages/Logs.tsx` | 스트리밍 토글 + 실시간 로그 수신 |
| `web/src/components/AppLayout.tsx` | 연결 상태 인디케이터 |

## 검증 방법
1. `make run`으로 서버 실행
2. 브라우저에서 Dashboard 열기 → DevTools Network WS 탭 확인
3. `make sample-data`로 테스트 데이터 전송
4. Dashboard의 stats/서비스 테이블이 폴링 없이 즉시 업데이트되는지 확인
5. Traces 페이지에서 새 trace가 목록 상단에 자동 추가되는지 확인
6. Logs 페이지에서 스트리밍 토글 ON → 새 로그가 실시간 추가되는지 확인
7. 서버 재시작 → WS 자동 재연결 → 데이터 스트리밍 복구 확인
