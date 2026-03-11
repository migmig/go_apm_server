# WebSocket 실시간 스트리밍 - Tasks

> **관련 문서**: `websocket-stream-prd.md`, `websocket-stream-spec.md`

---

## Phase 1: 백엔드 - WebSocket 기반 구축

- [x] **T-056**: `go get nhooyr.io/websocket` 의존성 추가, `go.mod` / `go.sum` 업데이트
- [x] **T-057**: `internal/api/ws_hub.go` - WSMessage, ClientMessage, Client 구조체 정의 (Subscribe/Unsubscribe/IsSubscribed 메서드 포함)
- [x] **T-058**: `internal/api/ws_hub.go` - Hub 구조체 구현 (NewHub, Run, ClientCount, broadcast, broadcastToChannel)
- [x] **T-059**: `internal/api/ws_hub.go` - broadcastLogsFiltered, filterLogsForClient 구현 (클라이언트별 service 필터 적용)
- [x] **T-060**: `internal/api/ws_hub.go` - BroadcastFlush 구현 (dashboard: stats/services 조회 push, traces: spansToTraceSummaries push, logs: 필터 적용 push)
- [x] **T-061**: `internal/api/ws_hub.go` - spansToTraceSummaries 헬퍼 함수 구현 (flush된 span → TraceSummary 변환)

## Phase 2: 백엔드 - 핸들러 & 라우트 연결

- [x] **T-062**: `internal/api/handler.go` - Handler 구조체에 `hub *Hub` 필드 추가, NewHandler 시그니처 변경
- [x] **T-063**: `internal/api/handler.go` - HandleWebSocket 메서드 구현 (websocket.Accept, Client 생성, Hub 등록, readPump/writePump 시작)
- [x] **T-064**: `internal/api/ws_hub.go` - Client readPump 구현 (ClientMessage 파싱, subscribe/unsubscribe 처리)
- [x] **T-065**: `internal/api/ws_hub.go` - Client writePump 구현 (send 채널 → conn.Write, context 취소 시 종료)
- [x] **T-066**: `internal/api/routes.go` - NewServer 시그니처에 `hub *Hub` 파라미터 추가, `GET /ws` 라우트 등록, WriteTimeout 0 변경

## Phase 3: 백엔드 - Processor 콜백 연결

- [x] **T-067**: `internal/processor/processor.go` - FlushEvent 구조체 정의 (Spans, Logs, Metrics 필드)
- [x] **T-068**: `internal/processor/processor.go` - Processor에 `onFlush func(FlushEvent)` 필드 및 SetOnFlush 메서드 추가
- [x] **T-069**: `internal/processor/processor.go` - batchWorker의 flush 로직 리팩토링: 공통 flush() 함수로 통합 + 콜백 호출 (Storage 저장 완료 후 go p.onFlush 실행)
- [x] **T-070**: `internal/processor/processor.go` - batch 크기 초과 시 즉시 flush 경로도 flush() 함수 재사용하도록 변경
- [x] **T-071**: `cmd/server/main.go` - Hub 생성(NewHub), `go hub.Run(ctx)`, proc.SetOnFlush 콜백 연결, NewServer에 hub 전달

## Phase 4: 프론트엔드 - WebSocket 인프라

- [x] **T-072**: `web/src/lib/websocket.ts` - WSManager 클래스 구현 (connect, disconnect, 자동 재연결 exponential backoff 1s~30s)
- [x] **T-073**: `web/src/lib/websocket.ts` - 메시지 리스너 (on/off), 상태 리스너 (onStatusChange/offStatusChange), subscribe/unsubscribe 메서드
- [x] **T-074**: `web/src/lib/websocket.ts` - getWSUrl() 헬퍼 (현재 호스트 기반 ws:// 또는 wss:// URL 생성)
- [x] **T-075**: `web/src/hooks/useWebSocket.tsx` - WebSocketProvider (React Context + WSManager 싱글톤 관리)
- [x] **T-076**: `web/src/hooks/useWebSocket.tsx` - useWSStatus, useWSMessage, useWSChannel hooks 구현
- [x] **T-077**: `web/src/App.tsx` - `<WebSocketProvider>`로 앱 전체 래핑

## Phase 5: 프론트엔드 - 페이지별 실시간 적용

- [x] **T-078**: `web/src/pages/Dashboard.tsx` - useWSChannel('dashboard') 자동 구독, useWSMessage('stats'/'services')로 state 직접 업데이트
- [x] **T-079**: `web/src/pages/Dashboard.tsx` - 폴링 간격 조정 (WS connected → 30초, disconnected → 10초 fallback)
- [x] **T-080**: `web/src/pages/Traces.tsx` - useWSChannel('traces') 자동 구독, useWSMessage('traces')로 새 trace 목록 상단 추가 (최대 200건)
- [x] **T-081**: `web/src/pages/Logs.tsx` - streaming state + Play/Pause 토글 버튼 UI 구현 (WS disconnected 시 disabled)
- [x] **T-082**: `web/src/pages/Logs.tsx` - 스트리밍 ON: subscribe('logs', { service }) → useWSMessage('logs')로 실시간 로그 추가 (최대 500건), 폴링 비활성화
- [x] **T-083**: `web/src/pages/Logs.tsx` - 스트리밍 OFF: unsubscribe('logs') → REST 폴링 복구, 필터 변경 시 재구독 처리

## Phase 6: 프론트엔드 - 연결 상태 UI

- [x] **T-084**: `web/src/components/SidebarNavigation.tsx` - 기존 "서버 상태: 정상" 하드코딩 → useWSStatus() 기반 동적 인디케이터 (초록/빨강/노랑 dot + 텍스트)

## Phase 7: 테스트 & 검증

- [x] **T-085**: `internal/api/ws_hub_test.go` - Hub 등록/해제/MaxClients 초과 테스트
- [x] **T-086**: `internal/api/ws_hub_test.go` - broadcastToChannel 채널별 필터링 테스트
- [x] **T-087**: `internal/api/ws_hub_test.go` - filterLogsForClient 서비스 필터 테스트
- [ ] **T-088**: 수동 E2E 검증 - `make run` → 브라우저 접속 → DevTools WS 탭 연결 확인, `make sample-data` → Dashboard/Traces 즉시 업데이트
- [ ] **T-089**: 수동 E2E 검증 - Logs 스트리밍 토글 ON/OFF, 필터 변경 시 재구독, WS 끊김/재연결 시나리오
