package api

import (
	"context"
	"encoding/json"
	"sync"
	"testing"
	"time"

	"github.com/migmig/go_apm_server/internal/storage"
)

// newTestClient creates a Client with no real websocket connection (for unit testing Hub logic).
func newTestClient(hub *Hub) *Client {
	return &Client{
		hub:      hub,
		send:     make(chan []byte, sendBufSize),
		channels: make(map[string]bool),
		filter:   make(map[string]any),
	}
}

func TestHubRegisterUnregister(t *testing.T) {
	hub := NewHub(nil)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go hub.Run(ctx)

	c1 := newTestClient(hub)
	c2 := newTestClient(hub)

	hub.register <- c1
	hub.register <- c2
	time.Sleep(50 * time.Millisecond)

	if hub.ClientCount() != 2 {
		t.Fatalf("expected 2 clients, got %d", hub.ClientCount())
	}

	hub.unregister <- c1
	time.Sleep(50 * time.Millisecond)

	if hub.ClientCount() != 1 {
		t.Fatalf("expected 1 client after unregister, got %d", hub.ClientCount())
	}
}

func TestHubMaxClients(t *testing.T) {
	hub := NewHub(nil)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go hub.Run(ctx)

	clients := make([]*Client, maxClients+5)
	for i := range clients {
		clients[i] = newTestClient(hub)
		hub.register <- clients[i]
	}
	time.Sleep(100 * time.Millisecond)

	if hub.ClientCount() != maxClients {
		t.Fatalf("expected %d clients (max), got %d", maxClients, hub.ClientCount())
	}

	// Clients beyond maxClients should have their send channel closed
	for i := maxClients; i < len(clients); i++ {
		select {
		case _, ok := <-clients[i].send:
			if ok {
				t.Fatalf("expected send channel of excess client %d to be closed", i)
			}
		default:
			// channel might already be closed and drained
		}
	}
}

func TestBroadcastToChannel(t *testing.T) {
	hub := NewHub(nil)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go hub.Run(ctx)

	dashClient := newTestClient(hub)
	dashClient.Subscribe("dashboard", nil)

	tracesClient := newTestClient(hub)
	tracesClient.Subscribe("traces", nil)

	noneClient := newTestClient(hub)

	hub.register <- dashClient
	hub.register <- tracesClient
	hub.register <- noneClient
	time.Sleep(50 * time.Millisecond)

	// Broadcast to "dashboard" channel
	hub.broadcastToChannel("dashboard", WSMessage{Type: "stats", Payload: "test"})

	// dashClient should receive
	select {
	case msg := <-dashClient.send:
		var wsMsg WSMessage
		if err := json.Unmarshal(msg, &wsMsg); err != nil {
			t.Fatalf("failed to unmarshal: %v", err)
		}
		if wsMsg.Type != "stats" {
			t.Fatalf("expected type 'stats', got %q", wsMsg.Type)
		}
	case <-time.After(100 * time.Millisecond):
		t.Fatal("dashClient did not receive message")
	}

	// tracesClient should NOT receive
	select {
	case <-tracesClient.send:
		t.Fatal("tracesClient should not receive dashboard message")
	case <-time.After(50 * time.Millisecond):
		// expected
	}

	// noneClient should NOT receive
	select {
	case <-noneClient.send:
		t.Fatal("noneClient should not receive dashboard message")
	case <-time.After(50 * time.Millisecond):
		// expected
	}
}

func TestFilterLogsForClient(t *testing.T) {
	logs := []storage.LogRecord{
		{ServiceName: "api", Body: "request received"},
		{ServiceName: "db", Body: "query executed"},
		{ServiceName: "api", Body: "response sent"},
		{ServiceName: "cache", Body: "cache miss"},
	}

	t.Run("no filter returns all", func(t *testing.T) {
		client := &Client{
			channels: map[string]bool{"logs": true},
			filter:   nil,
		}
		result := filterLogsForClient(logs, client)
		if len(result) != 4 {
			t.Fatalf("expected 4 logs, got %d", len(result))
		}
	})

	t.Run("empty filter returns all", func(t *testing.T) {
		client := &Client{
			channels: map[string]bool{"logs": true},
			filter:   map[string]any{},
		}
		result := filterLogsForClient(logs, client)
		if len(result) != 4 {
			t.Fatalf("expected 4 logs, got %d", len(result))
		}
	})

	t.Run("service filter", func(t *testing.T) {
		client := &Client{
			channels: map[string]bool{"logs": true},
			filter:   map[string]any{"service": "api"},
		}
		result := filterLogsForClient(logs, client)
		if len(result) != 2 {
			t.Fatalf("expected 2 logs for service 'api', got %d", len(result))
		}
		for _, l := range result {
			if l.ServiceName != "api" {
				t.Fatalf("expected service 'api', got %q", l.ServiceName)
			}
		}
	})

	t.Run("service filter no match", func(t *testing.T) {
		client := &Client{
			channels: map[string]bool{"logs": true},
			filter:   map[string]any{"service": "nonexistent"},
		}
		result := filterLogsForClient(logs, client)
		if len(result) != 0 {
			t.Fatalf("expected 0 logs, got %d", len(result))
		}
	})
}

func TestClientSubscribeUnsubscribe(t *testing.T) {
	client := &Client{
		channels: make(map[string]bool),
		filter:   make(map[string]any),
	}

	client.Subscribe("dashboard", nil)
	client.Subscribe("logs", map[string]any{"service": "api"})

	if !client.IsSubscribed("dashboard") {
		t.Fatal("expected subscribed to dashboard")
	}
	if !client.IsSubscribed("logs") {
		t.Fatal("expected subscribed to logs")
	}
	if client.IsSubscribed("traces") {
		t.Fatal("should not be subscribed to traces")
	}

	// Check filter
	client.mu.RLock()
	svc, _ := client.filter["service"].(string)
	client.mu.RUnlock()
	if svc != "api" {
		t.Fatalf("expected filter service 'api', got %q", svc)
	}

	client.Unsubscribe("logs")
	if client.IsSubscribed("logs") {
		t.Fatal("should not be subscribed to logs after unsubscribe")
	}
	client.mu.RLock()
	if client.filter != nil {
		t.Fatal("filter should be nil after logs unsubscribe")
	}
	client.mu.RUnlock()
}

func TestSpansToTraceSummaries(t *testing.T) {
	spans := []storage.Span{
		{TraceID: "t1", SpanID: "s1", ParentSpanID: "", ServiceName: "api", SpanName: "GET /users", DurationNs: 5000000, StatusCode: 0, StartTime: 1000},
		{TraceID: "t1", SpanID: "s2", ParentSpanID: "s1", ServiceName: "db", SpanName: "SELECT", DurationNs: 2000000, StatusCode: 0, StartTime: 1001},
		{TraceID: "t2", SpanID: "s3", ParentSpanID: "", ServiceName: "web", SpanName: "POST /login", DurationNs: 10000000, StatusCode: 2, StartTime: 2000},
	}

	summaries := spansToTraceSummaries(spans)
	if len(summaries) != 2 {
		t.Fatalf("expected 2 trace summaries, got %d", len(summaries))
	}

	byTrace := make(map[string]storage.TraceSummary)
	for _, s := range summaries {
		byTrace[s.TraceID] = s
	}

	t1 := byTrace["t1"]
	if t1.SpanCount != 2 {
		t.Fatalf("t1: expected 2 spans, got %d", t1.SpanCount)
	}
	if t1.RootService != "api" {
		t.Fatalf("t1: expected root service 'api', got %q", t1.RootService)
	}
	if t1.DurationMs != 5.0 {
		t.Fatalf("t1: expected 5.0ms, got %f", t1.DurationMs)
	}

	t2 := byTrace["t2"]
	if t2.SpanCount != 1 {
		t.Fatalf("t2: expected 1 span, got %d", t2.SpanCount)
	}
	if t2.StatusCode != 2 {
		t.Fatalf("t2: expected status 2, got %d", t2.StatusCode)
	}
}

func TestBroadcastLogsFiltered(t *testing.T) {
	hub := NewHub(nil)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go hub.Run(ctx)

	// Client subscribed to logs with service filter "api"
	apiClient := newTestClient(hub)
	apiClient.Subscribe("logs", map[string]any{"service": "api"})

	// Client subscribed to logs with no filter (receives all)
	allClient := newTestClient(hub)
	allClient.Subscribe("logs", nil)

	// Client not subscribed to logs
	otherClient := newTestClient(hub)
	otherClient.Subscribe("dashboard", nil)

	hub.register <- apiClient
	hub.register <- allClient
	hub.register <- otherClient
	time.Sleep(50 * time.Millisecond)

	logs := []storage.LogRecord{
		{ServiceName: "api", Body: "request", Timestamp: time.Now().UnixNano()},
		{ServiceName: "db", Body: "query", Timestamp: time.Now().UnixNano()},
	}

	hub.broadcastLogsFiltered(logs)

	// apiClient should receive 1 log (only "api")
	select {
	case msg := <-apiClient.send:
		var wsMsg WSMessage
		json.Unmarshal(msg, &wsMsg)
		payload, ok := wsMsg.Payload.([]any)
		if !ok {
			t.Fatalf("expected array payload")
		}
		if len(payload) != 1 {
			t.Fatalf("apiClient: expected 1 log, got %d", len(payload))
		}
	case <-time.After(100 * time.Millisecond):
		t.Fatal("apiClient did not receive logs")
	}

	// allClient should receive 2 logs
	select {
	case msg := <-allClient.send:
		var wsMsg WSMessage
		json.Unmarshal(msg, &wsMsg)
		payload, ok := wsMsg.Payload.([]any)
		if !ok {
			t.Fatalf("expected array payload")
		}
		if len(payload) != 2 {
			t.Fatalf("allClient: expected 2 logs, got %d", len(payload))
		}
	case <-time.After(100 * time.Millisecond):
		t.Fatal("allClient did not receive logs")
	}

	// otherClient should NOT receive anything
	select {
	case <-otherClient.send:
		t.Fatal("otherClient should not receive logs")
	case <-time.After(50 * time.Millisecond):
		// expected
	}
}

func TestConcurrentSubscribeUnsubscribe(t *testing.T) {
	client := &Client{
		channels: make(map[string]bool),
		filter:   make(map[string]any),
	}

	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(2)
		go func() {
			defer wg.Done()
			client.Subscribe("logs", map[string]any{"service": "test"})
		}()
		go func() {
			defer wg.Done()
			client.Unsubscribe("logs")
		}()
	}
	wg.Wait()
	// No panic = pass (testing concurrent access safety)
}
