package api

import (
	"context"
	"encoding/json"
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
	channels map[string]bool
	filter   map[string]any
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
			writeCtx, cancel := context.WithTimeout(ctx, writeTimeout)
			err := c.conn.Write(writeCtx, websocket.MessageText, msg)
			cancel()
			if err != nil {
				return
			}
		}
	}
}

// --- Hub ---

const (
	maxClients   = 100
	pingInterval = 30 * time.Second
	writeTimeout = 10 * time.Second
	sendBufSize  = 256
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
	pingTicker := time.NewTicker(pingInterval)
	defer pingTicker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case client := <-h.register:
			h.mu.Lock()
			if len(h.clients) >= maxClients {
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
			go func(c *Client) { h.unregister <- c }(client)
		}
	}
}

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

// BroadcastFlush is called after the Processor flushes data to storage.
func (h *Hub) BroadcastFlush(ctx context.Context, spans []storage.Span, logs []storage.LogRecord) {
	if h.ClientCount() == 0 {
		return
	}

	// dashboard subscribers: push latest stats/services from storage
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

	// traces subscribers: push new trace summaries
	if len(spans) > 0 {
		go func() {
			summaries := spansToTraceSummaries(spans)
			if len(summaries) > 0 {
				h.broadcastToChannel("traces", WSMessage{Type: "traces", Payload: summaries})
			}
		}()
	}

	// logs subscribers: push filtered logs
	if len(logs) > 0 {
		go func() {
			h.broadcastLogsFiltered(logs)
		}()
	}
}

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
