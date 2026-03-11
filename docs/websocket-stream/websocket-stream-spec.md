# WebSocket 실시간 스트리밍 - Technical Specification

> **관련 PRD**: `websocket-stream-prd.md`
> **영향 범위**: `internal/api`, `internal/processor`, `cmd/server`, `web/src`

---

## 1. 백엔드 변경

### 1.1 의존성 추가

```bash
go get nhooyr.io/websocket
```

`nhooyr.io/websocket`은 Go 표준 `net/http`와 자연스럽게 통합되며, `context.Context`를 지원한다. gorilla/websocket 대비 유지보수가 활발하고 API가 간결하다.

### 1.2 Hub 구조체 (신규)

**파일**: `internal/api/ws_hub.go`

```go
package api

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/migmig/go_apm_server/internal/storage"
	"nhooyr.io/websocket"
)

// --- 메시지 타입 ---

type WSMessage struct {
	Type    string `json:"type"`
	Payload any    `json:"payload"`
}

type ClientMessage struct {
	Action  string         `json:"action"`           // "subscribe" | "unsubscribe"
	Channel string         `json:"channel"`          // "dashboard" | "traces" | "logs"
	Filter  map[string]any `json:"filter,omitempty"` // logs 필터용
}

// --- 클라이언트 ---

type Client struct {
	hub      *Hub
	conn     *websocket.Conn
	send     chan []byte
	channels map[string]bool     // 구독 중인 채널
	filter   map[string]any      // logs 채널 필터 (service, severity_min 등)
	mu       sync.RWMutex
}

func (c *Client) Subscribe(channel string, filter map[string]any) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.channels[channel] = true
	if channel == "logs" && filter != nil {
		c.filter = filter
	}
}

func (c *Client) Unsubscribe(channel string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.channels, channel)
	if channel == "logs" {
		c.filter = nil
	}
}

func (c *Client) IsSubscribed(channel string) bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.channels[channel]
}

// --- Hub ---

const (
	MaxClients    = 100
	PingInterval  = 30 * time.Second
	WriteTimeout  = 10 * time.Second
	SendBufSize   = 256
)

type Hub struct {
	clients    map[*Client]bool
	register   chan *Client
	unregister chan *Client
	store      storage.Storage
	mu         sync.RWMutex
}

func NewHub(store storage.Storage) *Hub {
	return &Hub{
		clients:    make(map[*Client]bool),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		store:      store,
	}
}

func (h *Hub) Run(ctx context.Context) {
	pingTicker := time.NewTicker(PingInterval)
	defer pingTicker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case client := <-h.register:
			h.mu.Lock()
			if len(h.clients) >= MaxClients {
				h.mu.Unlock()
				close(client.send)
				continue
			}
			h.clients[client] = true
			h.mu.Unlock()
		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
			h.mu.Unlock()
		case <-pingTicker.C:
			h.broadcast(WSMessage{Type: "ping"})
		}
	}
}

func (h *Hub) ClientCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

// broadcast: 모든 클라이언트에 메시지 전송
func (h *Hub) broadcast(msg WSMessage) {
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}

	h.mu.RLock()
	defer h.mu.RUnlock()

	for client := range h.clients {
		select {
		case client.send <- data:
		default:
			// send 버퍼 가득 찬 클라이언트는 제거 예약
			go func(c *Client) { h.unregister <- c }(client)
		}
	}
}

// broadcastToChannel: 특정 채널 구독자에게만 메시지 전송
func (h *Hub) broadcastToChannel(channel string, msg WSMessage) {
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}

	h.mu.RLock()
	defer h.mu.RUnlock()

	for client := range h.clients {
		if !client.IsSubscribed(channel) {
			continue
		}
		select {
		case client.send <- data:
		default:
			go func(c *Client) { h.unregister <- c }(client)
		}
	}
}

// broadcastLogsFiltered: logs 채널 구독자에게 필터 적용 후 전송
func (h *Hub) broadcastLogsFiltered(logs []storage.LogRecord) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	for client := range h.clients {
		if !client.IsSubscribed("logs") {
			continue
		}

		filtered := filterLogsForClient(logs, client)
		if len(filtered) == 0 {
			continue
		}

		// LogRecord → logResp 변환 (handler.go HandleGetLogs와 동일 형식)
		respLogs := make([]map[string]any, 0, len(filtered))
		for _, l := range filtered {
			respLogs = append(respLogs, map[string]any{
				"timestamp":       time.Unix(0, l.Timestamp).UTC().Format(time.RFC3339),
				"service_name":    l.ServiceName,
				"severity_text":   l.SeverityText,
				"severity_number": l.SeverityNumber,
				"body":            l.Body,
				"trace_id":        l.TraceID,
				"span_id":         l.SpanID,
				"attributes":      l.Attributes,
			})
		}

		data, _ := json.Marshal(WSMessage{Type: "logs", Payload: respLogs})
		select {
		case client.send <- data:
		default:
			go func(c *Client) { h.unregister <- c }(client)
		}
	}
}

func filterLogsForClient(logs []storage.LogRecord, client *Client) []storage.LogRecord {
	client.mu.RLock()
	defer client.mu.RUnlock()

	if client.filter == nil || len(client.filter) == 0 {
		return logs
	}

	svcFilter, _ := client.filter["service"].(string)
	if svcFilter == "" {
		return logs
	}

	filtered := make([]storage.LogRecord, 0)
	for _, l := range logs {
		if l.ServiceName == svcFilter {
			filtered = append(filtered, l)
		}
	}
	return filtered
}
```

#### Hub의 Flush 이벤트 처리

```go
// BroadcastFlush: Processor flush 후 호출됨
func (h *Hub) BroadcastFlush(ctx context.Context, spans []storage.Span, logs []storage.LogRecord) {
	if h.ClientCount() == 0 {
		return
	}

	// 1) dashboard 구독자: storage에서 최신 stats/services 조회하여 push
	go func() {
		stats, err := h.store.GetStats(ctx, 0)
		if err == nil && stats != nil {
			h.broadcastToChannel("dashboard", WSMessage{Type: "stats", Payload: stats})
		}
		services, err := h.store.GetServices(ctx)
		if err == nil {
			h.broadcastToChannel("dashboard", WSMessage{Type: "services", Payload: services})
		}
	}()

	// 2) traces 구독자: 새 span에서 trace 요약 생성하여 push
	if len(spans) > 0 {
		go func() {
			summaries := spansToTraceSummaries(spans)
			if len(summaries) > 0 {
				h.broadcastToChannel("traces", WSMessage{Type: "traces", Payload: summaries})
			}
		}()
	}

	// 3) logs 구독자: 필터 적용 후 push
	if len(logs) > 0 {
		go func() {
			h.broadcastLogsFiltered(logs)
		}()
	}
}

// spansToTraceSummaries: flush된 span들로 간단한 TraceSummary 생성
func spansToTraceSummaries(spans []storage.Span) []storage.TraceSummary {
	traceMap := make(map[string]*storage.TraceSummary)
	for _, sp := range spans {
		ts, exists := traceMap[sp.TraceID]
		if !exists {
			traceMap[sp.TraceID] = &storage.TraceSummary{
				TraceID:     sp.TraceID,
				RootService: sp.ServiceName,
				RootSpan:    sp.SpanName,
				SpanCount:   1,
				DurationMs:  float64(sp.DurationNs) / 1e6,
				StatusCode:  sp.StatusCode,
				StartTime:   sp.StartTime,
			}
			continue
		}
		ts.SpanCount++
		if sp.ParentSpanID == "" {
			ts.RootService = sp.ServiceName
			ts.RootSpan = sp.SpanName
			ts.DurationMs = float64(sp.DurationNs) / 1e6
			ts.StatusCode = sp.StatusCode
			ts.StartTime = sp.StartTime
		}
	}

	summaries := make([]storage.TraceSummary, 0, len(traceMap))
	for _, ts := range traceMap {
		summaries = append(summaries, *ts)
	}
	return summaries
}
```

### 1.3 WebSocket 핸들러

**파일**: `internal/api/handler.go`

Handler 구조체에 `hub` 필드 추가:

```go
type Handler struct {
	store     storage.Storage
	cfg       *config.Config
	startTime time.Time
	hub       *Hub // 추가
}

func NewHandler(store storage.Storage, cfg *config.Config, hub *Hub) *Handler {
	return &Handler{store: store, cfg: cfg, startTime: time.Now(), hub: hub}
}
```

WebSocket 핸들러 메서드 추가:

```go
func (h *Handler) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		InsecureSkipVerify: true, // 개발용 CORS 허용
	})
	if err != nil {
		log.Printf("websocket accept error: %v", err)
		return
	}

	client := &Client{
		hub:      h.hub,
		conn:     conn,
		send:     make(chan []byte, SendBufSize),
		channels: make(map[string]bool),
		filter:   make(map[string]any),
	}

	h.hub.register <- client

	go client.writePump(r.Context())
	client.readPump(r.Context())
}
```

Client의 read/write pump:

```go
func (c *Client) readPump(ctx context.Context) {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close(websocket.StatusNormalClosure, "")
	}()

	for {
		_, data, err := c.conn.Read(ctx)
		if err != nil {
			return
		}

		var msg ClientMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			continue
		}

		switch msg.Action {
		case "subscribe":
			c.Subscribe(msg.Channel, msg.Filter)
		case "unsubscribe":
			c.Unsubscribe(msg.Channel)
		}
	}
}

func (c *Client) writePump(ctx context.Context) {
	defer c.conn.Close(websocket.StatusNormalClosure, "")

	for {
		select {
		case <-ctx.Done():
			return
		case msg, ok := <-c.send:
			if !ok {
				return
			}
			writeCtx, cancel := context.WithTimeout(ctx, WriteTimeout)
			err := c.conn.Write(writeCtx, websocket.MessageText, msg)
			cancel()
			if err != nil {
				return
			}
		}
	}
}
```

### 1.4 라우트 등록

**파일**: `internal/api/routes.go`

```go
func NewServer(port int, store storage.Storage, cfg *config.Config, hub *Hub) *http.Server {
	h := NewHandler(store, cfg, hub)

	mux := http.NewServeMux()

	// 기존 라우트 유지...
	mux.HandleFunc("GET /ws", h.HandleWebSocket) // 추가

	// ... 나머지 기존 코드 ...

	return &http.Server{
		Addr:         fmt.Sprintf(":%d", port),
		Handler:      cors(mux),
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 0, // WebSocket 장기 연결을 위해 0으로 변경
	}
}
```

> **중요**: `WriteTimeout`을 `0`으로 변경해야 WS 장기 연결이 끊기지 않는다. 기존 REST API는 Handler 레벨에서 `http.TimeoutHandler`로 보호할 수 있으나, 현재는 단순 read-only API이므로 위험도가 낮다.

### 1.5 Processor 콜백

**파일**: `internal/processor/processor.go`

```go
type FlushEvent struct {
	Spans   []storage.Span
	Logs    []storage.LogRecord
	Metrics []storage.Metric
}

type Processor struct {
	cfg       config.ProcessorConfig
	store     storage.Storage
	spansCh   chan storage.Span
	metricsCh chan storage.Metric
	logsCh    chan storage.LogRecord
	stopCh    chan struct{}
	wg        sync.WaitGroup
	onFlush   func(FlushEvent) // 추가
}

func (p *Processor) SetOnFlush(fn func(FlushEvent)) {
	p.onFlush = fn
}
```

`batchWorker`의 `flush()` 함수 수정:

```go
flush := func() {
	// 콜백용으로 데이터 복사 (flush 전에 캡처)
	var flushSpans []storage.Span
	var flushLogs []storage.LogRecord
	var flushMetrics []storage.Metric

	if len(spansBatch) > 0 {
		flushSpans = make([]storage.Span, len(spansBatch))
		copy(flushSpans, spansBatch)
		if err := p.store.InsertSpans(ctx, spansBatch); err != nil {
			fmt.Printf("failed to flush spans: %v\n", err)
		}
		spansBatch = spansBatch[:0]
	}
	if len(metricsBatch) > 0 {
		flushMetrics = make([]storage.Metric, len(metricsBatch))
		copy(flushMetrics, metricsBatch)
		if err := p.store.InsertMetrics(ctx, metricsBatch); err != nil {
			fmt.Printf("failed to flush metrics: %v\n", err)
		}
		metricsBatch = metricsBatch[:0]
	}
	if len(logsBatch) > 0 {
		flushLogs = make([]storage.LogRecord, len(logsBatch))
		copy(flushLogs, logsBatch)
		if err := p.store.InsertLogs(ctx, logsBatch); err != nil {
			fmt.Printf("failed to flush logs: %v\n", err)
		}
		logsBatch = logsBatch[:0]
	}

	// 콜백 호출 (Storage 저장 완료 후)
	if p.onFlush != nil && (len(flushSpans) > 0 || len(flushLogs) > 0 || len(flushMetrics) > 0) {
		go p.onFlush(FlushEvent{
			Spans:   flushSpans,
			Logs:    flushLogs,
			Metrics: flushMetrics,
		})
	}
}
```

또한 `batchWorker`의 batch 크기 초과 시 즉시 flush하는 경우(`case sp := <-p.spansCh:` 등)에도 동일하게 콜백을 호출해야 한다. 이를 위해 즉시 flush 로직도 `flush()` 함수를 재사용하도록 리팩토링한다:

```go
case sp := <-p.spansCh:
	spansBatch = append(spansBatch, sp)
	if len(spansBatch) >= p.cfg.BatchSize {
		flush() // 기존 직접 InsertSpans 호출 → flush()로 교체
	}
case m := <-p.metricsCh:
	metricsBatch = append(metricsBatch, m)
	if len(metricsBatch) >= p.cfg.BatchSize {
		flush()
	}
case l := <-p.logsCh:
	logsBatch = append(logsBatch, l)
	if len(logsBatch) >= p.cfg.BatchSize {
		flush()
	}
```

### 1.6 Main 연결

**파일**: `cmd/server/main.go`

```go
// Hub 생성 및 실행
hub := api.NewHub(store)
go hub.Run(ctx)

// Processor에 flush 콜백 연결
proc.SetOnFlush(func(event processor.FlushEvent) {
	hub.BroadcastFlush(ctx, event.Spans, event.Logs)
})

// NewServer에 hub 전달
apiServer := api.NewServer(cfg.Server.APIPort, store, cfg, hub)
```

---

## 2. 프론트엔드 변경

### 2.1 WebSocket 커넥션 매니저 (신규)

**파일**: `web/src/lib/websocket.ts`

```typescript
export type WSStatus = 'connected' | 'disconnected' | 'reconnecting';

export type WSMessageHandler = (payload: any) => void;

export class WSManager {
  private ws: WebSocket | null = null;
  private url: string;
  private listeners = new Map<string, Set<WSMessageHandler>>();
  private statusListeners = new Set<(status: WSStatus) => void>();
  private status: WSStatus = 'disconnected';
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;

  constructor(url: string) {
    this.url = url;
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.setStatus('reconnecting');
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.reconnectDelay = 1000;
      this.setStatus('connected');
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as { type: string; payload: any };
        if (msg.type === 'ping') return;
        const handlers = this.listeners.get(msg.type);
        handlers?.forEach((handler) => handler(msg.payload));
      } catch {
        // 파싱 실패 무시
      }
    };

    this.ws.onclose = () => {
      this.setStatus('disconnected');
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.setStatus('disconnected');
  }

  private scheduleReconnect() {
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
      this.connect();
    }, this.reconnectDelay);
  }

  private setStatus(status: WSStatus) {
    this.status = status;
    this.statusListeners.forEach((fn) => fn(status));
  }

  getStatus(): WSStatus {
    return this.status;
  }

  // 메시지 타입별 리스너
  on(type: string, handler: WSMessageHandler) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(handler);
  }

  off(type: string, handler: WSMessageHandler) {
    this.listeners.get(type)?.delete(handler);
  }

  onStatusChange(handler: (status: WSStatus) => void) {
    this.statusListeners.add(handler);
  }

  offStatusChange(handler: (status: WSStatus) => void) {
    this.statusListeners.delete(handler);
  }

  // 채널 구독/해제
  subscribe(channel: string, filter?: Record<string, any>) {
    this.send({ action: 'subscribe', channel, filter });
  }

  unsubscribe(channel: string) {
    this.send({ action: 'unsubscribe', channel });
  }

  private send(data: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }
}
```

WS URL 결정 로직:

```typescript
export function getWSUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}
```

### 2.2 React Context & Hooks (신규)

**파일**: `web/src/hooks/useWebSocket.ts`

```typescript
import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { WSManager, WSStatus, WSMessageHandler, getWSUrl } from '../lib/websocket';

interface WSContextValue {
  manager: WSManager | null;
  status: WSStatus;
}

const WSContext = createContext<WSContextValue>({ manager: null, status: 'disconnected' });

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const managerRef = useRef<WSManager | null>(null);
  const [status, setStatus] = useState<WSStatus>('disconnected');

  useEffect(() => {
    const mgr = new WSManager(getWSUrl());
    managerRef.current = mgr;

    mgr.onStatusChange(setStatus);
    mgr.connect();

    return () => {
      mgr.disconnect();
    };
  }, []);

  return (
    <WSContext.Provider value={{ manager: managerRef.current, status }}>
      {children}
    </WSContext.Provider>
  );
}

// 연결 상태 조회
export function useWSStatus(): WSStatus {
  return useContext(WSContext).status;
}

// 특정 메시지 타입 구독 hook
export function useWSMessage(type: string, handler: WSMessageHandler) {
  const { manager } = useContext(WSContext);

  useEffect(() => {
    if (!manager) return;
    manager.on(type, handler);
    return () => { manager.off(type, handler); };
  }, [manager, type, handler]);
}

// 채널 구독/해제 hook
export function useWSChannel(channel: string, autoSubscribe = true) {
  const { manager, status } = useContext(WSContext);

  const subscribe = useCallback((filter?: Record<string, any>) => {
    manager?.subscribe(channel, filter);
  }, [manager, channel]);

  const unsubscribe = useCallback(() => {
    manager?.unsubscribe(channel);
  }, [manager, channel]);

  useEffect(() => {
    if (!manager || status !== 'connected' || !autoSubscribe) return;
    manager.subscribe(channel);
    return () => { manager.unsubscribe(channel); };
  }, [manager, status, channel, autoSubscribe]);

  return { subscribe, unsubscribe };
}
```

### 2.3 Dashboard 수정

**파일**: `web/src/pages/Dashboard.tsx`

변경 사항:
- `useWSChannel('dashboard')` 호출로 자동 구독
- `useWSMessage('stats', ...)` / `useWSMessage('services', ...)` 로 실시간 데이터 수신
- 기존 `setInterval` 10초 → 30초로 완화 (WS fallback)

```typescript
import { useWSChannel, useWSMessage, useWSStatus } from '../hooks/useWebSocket';

export default function Dashboard() {
  // ... 기존 state ...
  const wsStatus = useWSStatus();

  // WS 채널 자동 구독
  useWSChannel('dashboard');

  // WS로 stats 수신 시 state 직접 업데이트
  useWSMessage('stats', useCallback((payload: Stats) => {
    setStats(payload);
    setLastUpdatedAt(new Date());
    setErrorMessage(null);
  }, []));

  useWSMessage('services', useCallback((payload: ServiceInfo[]) => {
    setServices(payload);
  }, []));

  // 폴링: WS 연결 중이면 30초, 아니면 10초
  useEffect(() => {
    void fetchData();
    const interval = setInterval(() => {
      void fetchData(true);
    }, wsStatus === 'connected' ? 30000 : 10000);
    return () => clearInterval(interval);
  }, [fetchData, wsStatus]);

  // ... 나머지 렌더링 ...
}
```

### 2.4 Traces 수정

**파일**: `web/src/pages/Traces.tsx`

변경 사항:
- `useWSChannel('traces')` 호출로 자동 구독
- `useWSMessage('traces', ...)` 로 새 trace 수신 시 목록 상단에 추가

```typescript
import { useWSChannel, useWSMessage } from '../hooks/useWebSocket';

export default function Traces() {
  // ... 기존 state ...
  const [newTraceCount, setNewTraceCount] = useState(0);

  useWSChannel('traces');

  useWSMessage('traces', useCallback((payload: TraceSummary[]) => {
    setTraces((prev) => {
      const newTraces = [...payload, ...prev];
      // 최대 200건 유지
      return newTraces.slice(0, 200);
    });
    setNewTraceCount((prev) => prev + payload.length);
  }, []));

  // ... 나머지 ...
}
```

### 2.5 Logs 수정 (스트리밍 토글)

**파일**: `web/src/pages/Logs.tsx`

변경 사항:
- `streaming` state 추가 (기본값: `false`)
- Play/Pause 토글 버튼
- 스트리밍 ON: `subscribe logs` + 폴링 중지, 새 로그 실시간 추가
- 스트리밍 OFF: `unsubscribe logs` + 기존 REST 폴링 복구

```typescript
import { Play, Pause } from 'lucide-react';
import { useWSChannel, useWSMessage, useWSStatus } from '../hooks/useWebSocket';

export default function Logs() {
  // ... 기존 state ...
  const [streaming, setStreaming] = useState(false);
  const wsStatus = useWSStatus();
  const { subscribe, unsubscribe } = useWSChannel('logs', false); // autoSubscribe = false

  // 스트리밍 토글
  const toggleStreaming = useCallback(() => {
    if (streaming) {
      unsubscribe();
      setStreaming(false);
      void fetchLogs(); // 스트리밍 끄면 현재 데이터 한 번 조회
    } else {
      subscribe({ service: serviceName });
      setStreaming(true);
    }
  }, [streaming, subscribe, unsubscribe, serviceName, fetchLogs]);

  // WS로 로그 수신
  useWSMessage('logs', useCallback((payload: LogRecord[]) => {
    if (!streaming) return;
    setLogs((prev) => {
      const newLogs = [...payload, ...prev];
      return newLogs.slice(0, 500); // 최대 500건 유지
    });
    setLastUpdatedAt(new Date());
  }, [streaming]));

  // 스트리밍 중이면 폴링 비활성화
  useEffect(() => {
    if (streaming) return;

    void fetchLogs();
    const interval = setInterval(() => {
      void fetchLogs(true);
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchLogs, streaming]);

  // 필터 변경 시 재구독
  useEffect(() => {
    if (!streaming) return;
    unsubscribe();
    subscribe({ service: serviceName });
  }, [serviceName, streaming, subscribe, unsubscribe]);

  // --- 렌더링 (헤더 영역에 토글 버튼 추가) ---
  // <button onClick={toggleStreaming}>
  //   {streaming ? <Pause size={16} /> : <Play size={16} />}
  //   {streaming ? '스트리밍 중지' : '실시간 스트리밍'}
  // </button>
}
```

**토글 버튼 UI 스펙:**

```tsx
<button
  onClick={toggleStreaming}
  disabled={wsStatus !== 'connected'}
  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
    streaming
      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
      : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
  }`}
>
  {streaming ? <Pause size={16} /> : <Play size={16} />}
  {streaming ? '스트리밍 중지' : '실시간 스트리밍'}
</button>
```

WS 연결이 끊긴 상태에서는 버튼이 `disabled` 처리된다.

### 2.6 Sidebar 연결 상태 인디케이터

**파일**: `web/src/components/SidebarNavigation.tsx` (100~108번 줄 교체)

기존:
```tsx
<div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
  <div className="flex items-center">
    <div className="mr-2 h-2.5 w-2.5 rounded-full bg-emerald-500" />
    <span className="text-sm text-slate-200">서버 상태: 정상</span>
  </div>
  <p className="mt-2 text-xs leading-5 text-slate-500">
    모바일에서는 메뉴를 닫아 본문 공간을 확보할 수 있습니다.
  </p>
</div>
```

변경:
```tsx
import { useWSStatus } from '../hooks/useWebSocket';

// NavigationPanel 내부에서:
const wsStatus = useWSStatus();

const statusConfig = {
  connected:    { color: 'bg-emerald-500',                  text: '실시간 연결', textColor: 'text-emerald-400' },
  disconnected: { color: 'bg-rose-500',                     text: '연결 끊김',   textColor: 'text-rose-400' },
  reconnecting: { color: 'bg-amber-500 animate-pulse',      text: '재연결 중...', textColor: 'text-amber-400' },
};
const sc = statusConfig[wsStatus];

<div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
  <div className="flex items-center">
    <div className={`mr-2 h-2.5 w-2.5 rounded-full ${sc.color}`} />
    <span className={`text-sm font-medium ${sc.textColor}`}>{sc.text}</span>
  </div>
  <p className="mt-2 text-xs leading-5 text-slate-500">
    WebSocket을 통해 실시간 데이터를 수신합니다.
  </p>
</div>
```

### 2.7 App.tsx 수정

**파일**: `web/src/App.tsx`

```tsx
import { WebSocketProvider } from './hooks/useWebSocket';

function App() {
  return (
    <WebSocketProvider>
      <AppLayout>
        <Suspense fallback={...}>
          <Routes>...</Routes>
        </Suspense>
      </AppLayout>
    </WebSocketProvider>
  );
}
```

---

## 3. WS 메시지 프로토콜 상세

### Server → Client

| type | payload 타입 | 설명 | 트리거 |
|------|-------------|------|--------|
| `stats` | `Stats` (storage.Stats와 동일) | 전체 시스템 통계 | Processor flush 후 |
| `services` | `ServiceInfo[]` | 서비스별 성능 현황 | Processor flush 후 |
| `traces` | `TraceSummary[]` | 새로 들어온 trace 요약 | span flush 시 |
| `logs` | `LogRecord[]` (logResp 형식) | 새로 들어온 로그 | log flush 시 (필터 적용) |
| `ping` | (없음) | 연결 유지 확인 | 30초 간격 |

### Client → Server

| action | channel | filter | 설명 |
|--------|---------|--------|------|
| `subscribe` | `dashboard` | - | Dashboard 데이터 구독 |
| `subscribe` | `traces` | - | 새 trace 구독 |
| `subscribe` | `logs` | `{ "service": "api" }` | 로그 스트리밍 시작 (필터 선택적) |
| `unsubscribe` | `logs` | - | 로그 스트리밍 중지 |
| `unsubscribe` | `dashboard` | - | Dashboard 구독 해제 |
| `unsubscribe` | `traces` | - | Traces 구독 해제 |

---

## 4. 파일 변경 목록

| 작업 | 파일 | 변경 유형 |
|------|------|----------|
| WS 라이브러리 추가 | `go.mod`, `go.sum` | 수정 |
| Hub + Client + 메시지 타입 | `internal/api/ws_hub.go` | **신규** |
| Handler에 hub 필드, WS 핸들러 | `internal/api/handler.go` | 수정 |
| NewServer 시그니처, /ws 라우트, WriteTimeout | `internal/api/routes.go` | 수정 |
| FlushEvent, SetOnFlush, batchWorker 콜백 | `internal/processor/processor.go` | 수정 |
| Hub 생성, OnFlush 연결, NewServer 호출 | `cmd/server/main.go` | 수정 |
| WS 커넥션 매니저 | `web/src/lib/websocket.ts` | **신규** |
| React Context + Hooks | `web/src/hooks/useWebSocket.ts` | **신규** |
| WebSocketProvider 래핑 | `web/src/App.tsx` | 수정 |
| WS subscribe dashboard | `web/src/pages/Dashboard.tsx` | 수정 |
| WS subscribe traces | `web/src/pages/Traces.tsx` | 수정 |
| 스트리밍 토글 + WS logs | `web/src/pages/Logs.tsx` | 수정 |
| WS 연결 상태 인디케이터 | `web/src/components/SidebarNavigation.tsx` | 수정 |

**신규 파일**: 3개 (`ws_hub.go`, `websocket.ts`, `useWebSocket.ts`)
**수정 파일**: 8개

---

## 5. 테스트 / 검증 체크리스트

### 5.1 백엔드 단위 테스트

```go
// internal/api/ws_hub_test.go

func TestHubRegisterUnregister(t *testing.T) {
	// Hub 생성 → 클라이언트 등록 → ClientCount 확인 → 해제 → 0 확인
}

func TestHubMaxClients(t *testing.T) {
	// MaxClients 초과 시 등록 거부 확인
}

func TestBroadcastToChannel(t *testing.T) {
	// dashboard 구독자에게만 stats 메시지 전달 확인
}

func TestLogsFiltering(t *testing.T) {
	// service 필터 적용 시 해당 서비스 로그만 전달 확인
}
```

### 5.2 수동 검증 체크리스트

- [ ] `make run` → 브라우저 접속 → DevTools Network WS 탭에서 `/ws` 연결 확인
- [ ] Dashboard 접속 시 `subscribe dashboard` 메시지 전송 확인
- [ ] `make sample-data` 전송 → Dashboard stats/서비스 테이블 즉시 업데이트
- [ ] Traces 페이지 → 새 trace가 목록 상단에 자동 추가
- [ ] Logs 페이지 → "실시간 스트리밍" 버튼 클릭 → 새 로그 실시간 추가
- [ ] Logs 스트리밍 중 서비스 필터 변경 → 재구독 후 필터된 로그만 수신
- [ ] Logs "스트리밍 중지" 클릭 → REST 폴링 복구 확인
- [ ] 사이드바 하단 WS 상태 인디케이터: 초록(실시간 연결) 표시
- [ ] 서버 종료 → 사이드바 빨간(연결 끊김) → 재시작 → 노란(재연결 중) → 초록(실시간 연결)
- [ ] WS 끊긴 상태에서 Dashboard 10초 폴링 fallback 동작 확인
- [ ] WS 끊긴 상태에서 Logs 스트리밍 버튼 disabled 확인
- [ ] 브라우저 탭 여러 개 열었을 때 각각 독립적으로 WS 연결
