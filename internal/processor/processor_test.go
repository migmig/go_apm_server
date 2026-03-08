package processor

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/migmig/go_apm_server/internal/config"
	"github.com/migmig/go_apm_server/internal/storage"
)

type MockStorage struct {
	storage.Storage
	mu          sync.Mutex
	spanBatches [][]storage.Span
}

func (m *MockStorage) InsertSpans(ctx context.Context, spans []storage.Span) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	batch := make([]storage.Span, len(spans))
	copy(batch, spans)
	m.spanBatches = append(m.spanBatches, batch)
	return nil
}

func (m *MockStorage) GetSpanBatches() [][]storage.Span {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.spanBatches
}

func TestProcessorBatching(t *testing.T) {
	mock := &MockStorage{}
	cfg := config.ProcessorConfig{
		BatchSize:     5,
		FlushInterval: "100ms",
		QueueSize:     100,
		DropOnFull:    false,
	}

	p := New(cfg, mock)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	p.Start(ctx)

	// 1. Test BatchSize trigger
	spans := make([]storage.Span, 5)
	for i := 0; i < 5; i++ {
		spans[i] = storage.Span{TraceID: "t1", SpanID: "s1"}
	}

	p.PushSpans(ctx, spans)

	// Wait a bit for async processing
	time.Sleep(50 * time.Millisecond)

	batches := mock.GetSpanBatches()
	if len(batches) != 1 {
		t.Errorf("expected 1 batch triggered by BatchSize, got %d", len(batches))
	}

	// 2. Test FlushInterval trigger
	p.PushSpans(ctx, []storage.Span{{TraceID: "t2", SpanID: "s2"}})

	// Should not be flushed immediately
	if len(mock.GetSpanBatches()) != 1 {
		t.Errorf("expected still 1 batch before flush interval, got %d", len(mock.GetSpanBatches()))
	}

	// Wait for flush interval (100ms)
	time.Sleep(200 * time.Millisecond)

	if len(mock.GetSpanBatches()) != 2 {
		t.Errorf("expected 2 batches after flush interval, got %d", len(mock.GetSpanBatches()))
	}

	p.Stop()
}

func TestProcessorStopFlush(t *testing.T) {
	mock := &MockStorage{}
	cfg := config.ProcessorConfig{
		BatchSize:     100,
		FlushInterval: "10s",
		QueueSize:     100,
		DropOnFull:    false,
	}

	p := New(cfg, mock)
	ctx := context.Background()
	p.Start(ctx)

	p.PushSpans(ctx, []storage.Span{{TraceID: "t3", SpanID: "s3"}})

	// Stopping should trigger immediate flush
	p.Stop()

	batches := mock.GetSpanBatches()
	if len(batches) != 1 {
		t.Errorf("expected 1 batch after Stop(), got %d", len(batches))
	}
}
