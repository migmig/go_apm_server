package api

import (
	"encoding/json"
	"io/fs"
	"log"
	"net/http"
	"path/filepath"
	"runtime"
	"strconv"
	"time"

	"github.com/migmig/go_apm_server/internal/config"
	"github.com/migmig/go_apm_server/internal/storage"
	"nhooyr.io/websocket"
)

type Handler struct {
	store     storage.Storage
	cfg       *config.Config
	startTime time.Time
	hub       *Hub
}

func NewHandler(store storage.Storage, cfg *config.Config, hub *Hub) *Handler {
	return &Handler{store: store, cfg: cfg, startTime: time.Now(), hub: hub}
}

func (h *Handler) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		InsecureSkipVerify: true,
	})
	if err != nil {
		log.Printf("websocket accept error: %v", err)
		return
	}

	client := &Client{
		hub:      h.hub,
		conn:     conn,
		send:     make(chan []byte, sendBufSize),
		channels: make(map[string]bool),
		filter:   make(map[string]any),
	}

	h.hub.register <- client

	go client.writePump(r.Context())
	client.readPump(r.Context())
}

func (h *Handler) HandleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) HandleGetConfig(w http.ResponseWriter, r *http.Request) {
	if h.cfg == nil {
		writeJSON(w, http.StatusOK, map[string]any{})
		return
	}
	writeJSON(w, http.StatusOK, h.cfg)
}

func (h *Handler) HandleGetSystem(w http.ResponseWriter, r *http.Request) {
	var dataSize int64
	if h.cfg != nil {
		dataSize = calcDirSize(filepath.Dir(h.cfg.Storage.Path))
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"version":             "v0.1.0-alpha",
		"go_version":          runtime.Version(),
		"os":                  runtime.GOOS,
		"arch":                runtime.GOARCH,
		"uptime_seconds":      int(time.Since(h.startTime).Seconds()),
		"data_dir_size_bytes": dataSize,
	})
}

func (h *Handler) HandleGetPartitions(w http.ResponseWriter, r *http.Request) {
	partitions, err := h.store.GetPartitions()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if partitions == nil {
		partitions = []storage.PartitionInfo{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"partitions": partitions})
}

func calcDirSize(dir string) int64 {
	var size int64
	filepath.WalkDir(dir, func(_ string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		info, err := d.Info()
		if err == nil {
			size += info.Size()
		}
		return nil
	})
	return size
}

func (h *Handler) HandleGetServices(w http.ResponseWriter, r *http.Request) {
	services, err := h.store.GetServices(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if services == nil {
		services = []storage.ServiceInfo{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"services": services})
}

func (h *Handler) HandleGetServiceDetail(w http.ResponseWriter, r *http.Request) {
	serviceName := r.PathValue("serviceName")
	if serviceName == "" {
		writeError(w, http.StatusBadRequest, "serviceName required")
		return
	}

	svc, err := h.store.GetServiceByName(r.Context(), serviceName)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if svc == nil {
		writeError(w, http.StatusNotFound, "service not found")
		return
	}

	writeJSON(w, http.StatusOK, svc)
}

func (h *Handler) HandleGetTraces(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	filter := storage.TraceFilter{
		ServiceName: q.Get("service"),
		Limit:       intParam(q.Get("limit"), 50),
		Offset:      intParam(q.Get("offset"), 0),
	}

	if v := q.Get("start"); v != "" {
		if ms, err := strconv.ParseInt(v, 10, 64); err == nil {
			filter.StartTime = time.UnixMilli(ms)
		}
	}
	if v := q.Get("end"); v != "" {
		if ms, err := strconv.ParseInt(v, 10, 64); err == nil {
			filter.EndTime = time.UnixMilli(ms)
		}
	}
	if v := q.Get("status"); v != "" {
		if code, err := strconv.ParseInt(v, 10, 32); err == nil {
			c := int32(code)
			filter.StatusCode = &c
		}
	}
	if v := q.Get("min_duration"); v != "" {
		if ms, err := strconv.ParseInt(v, 10, 64); err == nil {
			filter.MinDuration = time.Duration(ms) * time.Millisecond
		}
	}

	traces, total, err := h.store.QueryTraces(r.Context(), filter)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if traces == nil {
		traces = []storage.TraceSummary{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"traces": traces, "total": total})
}

func (h *Handler) HandleGetTraceDetail(w http.ResponseWriter, r *http.Request) {
	traceID := r.PathValue("traceId")
	if traceID == "" {
		writeError(w, http.StatusBadRequest, "traceId required")
		return
	}

	spans, err := h.store.GetTraceByID(r.Context(), traceID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if len(spans) == 0 {
		writeError(w, http.StatusNotFound, "trace not found")
		return
	}

	type spanResp struct {
		SpanID             string              `json:"span_id"`
		ParentSpanID       string              `json:"parent_span_id"`
		ServiceName        string              `json:"service_name"`
		SpanName           string              `json:"span_name"`
		SpanKind           int32               `json:"span_kind"`
		StartTime          int64               `json:"start_time"`
		EndTime            int64               `json:"end_time"`
		DurationMs         float64             `json:"duration_ms"`
		StatusCode         int32               `json:"status_code"`
		StatusMessage      string              `json:"status_message"`
		Attributes         map[string]any      `json:"attributes"`
		Events             []storage.SpanEvent `json:"events"`
		ResourceAttributes map[string]any      `json:"resource_attributes"`
	}

	respSpans := make([]spanResp, 0, len(spans))
	for _, s := range spans {
		respSpans = append(respSpans, spanResp{
			SpanID:             s.SpanID,
			ParentSpanID:       s.ParentSpanID,
			ServiceName:        s.ServiceName,
			SpanName:           s.SpanName,
			SpanKind:           s.SpanKind,
			StartTime:          s.StartTime,
			EndTime:            s.EndTime,
			DurationMs:         float64(s.DurationNs) / 1e6,
			StatusCode:         s.StatusCode,
			StatusMessage:      s.StatusMessage,
			Attributes:         s.Attributes,
			Events:             s.Events,
			ResourceAttributes: s.ResourceAttributes,
		})
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"trace_id": traceID,
		"spans":    respSpans,
	})
}

func (h *Handler) HandleGetMetrics(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	filter := storage.MetricFilter{
		ServiceName: q.Get("service"),
		MetricName:  q.Get("name"),
		Limit:       intParam(q.Get("limit"), 1000),
	}

	if v := q.Get("start"); v != "" {
		if ms, err := strconv.ParseInt(v, 10, 64); err == nil {
			filter.StartTime = time.UnixMilli(ms)
		}
	}
	if v := q.Get("end"); v != "" {
		if ms, err := strconv.ParseInt(v, 10, 64); err == nil {
			filter.EndTime = time.UnixMilli(ms)
		}
	}

	points, err := h.store.QueryMetrics(r.Context(), filter)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if points == nil {
		points = []storage.MetricDataPoint{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"data_points": points})
}

func (h *Handler) HandleGetLogs(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	filter := storage.LogFilter{
		ServiceName: q.Get("service"),
		TraceID:     q.Get("trace_id"),
		SearchBody:  q.Get("search"),
		Limit:       intParam(q.Get("limit"), 100),
		Offset:      intParam(q.Get("offset"), 0),
	}

	if v := q.Get("severity_min"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 32); err == nil {
			filter.SeverityMin = int32(n)
		}
	}
	if v := q.Get("start"); v != "" {
		if ms, err := strconv.ParseInt(v, 10, 64); err == nil {
			filter.StartTime = time.UnixMilli(ms)
		}
	}
	if v := q.Get("end"); v != "" {
		if ms, err := strconv.ParseInt(v, 10, 64); err == nil {
			filter.EndTime = time.UnixMilli(ms)
		}
	}

	type logResp struct {
		Timestamp      string         `json:"timestamp"`
		ServiceName    string         `json:"service_name"`
		SeverityText   string         `json:"severity_text"`
		SeverityNumber int32          `json:"severity_number"`
		Body           string         `json:"body"`
		TraceID        string         `json:"trace_id"`
		SpanID         string         `json:"span_id"`
		Attributes     map[string]any `json:"attributes"`
	}

	logs, total, err := h.store.QueryLogs(r.Context(), filter)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respLogs := make([]logResp, 0, len(logs))
	for _, l := range logs {
		respLogs = append(respLogs, logResp{
			Timestamp:      time.Unix(0, l.Timestamp).UTC().Format(time.RFC3339),
			ServiceName:    l.ServiceName,
			SeverityText:   l.SeverityText,
			SeverityNumber: l.SeverityNumber,
			Body:           l.Body,
			TraceID:        l.TraceID,
			SpanID:         l.SpanID,
			Attributes:     l.Attributes,
		})
	}

	writeJSON(w, http.StatusOK, map[string]any{"logs": respLogs, "total": total})
}

func (h *Handler) HandleGetStats(w http.ResponseWriter, r *http.Request) {
	sinceMs := int64(0)
	if v := r.URL.Query().Get("since"); v != "" {
		if ms, err := strconv.ParseInt(v, 10, 64); err == nil {
			sinceMs = ms
		}
	}

	sinceNano := sinceMs * 1e6
	stats, err := h.store.GetStats(r.Context(), sinceNano)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, stats)
}

// --- helpers ---

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func intParam(s string, def int) int {
	if s == "" {
		return def
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return def
	}
	return n
}
