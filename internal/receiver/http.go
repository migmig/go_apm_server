package receiver

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	collogspb "go.opentelemetry.io/proto/otlp/collector/logs/v1"
	colmetricspb "go.opentelemetry.io/proto/otlp/collector/metrics/v1"
	coltracepb "go.opentelemetry.io/proto/otlp/collector/trace/v1"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"

	"github.com/migmig/go_apm_server/internal/processor"
)

type HTTPReceiver struct {
	proc   *processor.Processor
	server *http.Server
	port   int
}

func NewHTTP(port int, proc *processor.Processor) *HTTPReceiver {
	return &HTTPReceiver{
		proc: proc,
		port: port,
	}
}

func (r *HTTPReceiver) Start() error {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /v1/traces", r.handleTraces)
	mux.HandleFunc("POST /v1/metrics", r.handleMetrics)
	mux.HandleFunc("POST /v1/logs", r.handleLogs)

	r.server = &http.Server{
		Addr:         fmt.Sprintf(":%d", r.port),
		Handler:      mux,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	log.Printf("OTLP HTTP receiver listening on :%d", r.port)
	return r.server.ListenAndServe()
}

func (r *HTTPReceiver) Stop(ctx context.Context) error {
	if r.server != nil {
		return r.server.Shutdown(ctx)
	}
	return nil
}

func (r *HTTPReceiver) handleTraces(w http.ResponseWriter, req *http.Request) {
	body, err := io.ReadAll(req.Body)
	if err != nil {
		http.Error(w, "failed to read body", http.StatusBadRequest)
		return
	}

	var msg coltracepb.ExportTraceServiceRequest
	if err := unmarshal(req.Header.Get("Content-Type"), body, &msg); err != nil {
		http.Error(w, "failed to decode: "+err.Error(), http.StatusBadRequest)
		return
	}

	if err := r.proc.ProcessTraces(req.Context(), msg.ResourceSpans); err != nil {
		log.Printf("error processing traces: %v", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("{}"))
}

func (r *HTTPReceiver) handleMetrics(w http.ResponseWriter, req *http.Request) {
	body, err := io.ReadAll(req.Body)
	if err != nil {
		http.Error(w, "failed to read body", http.StatusBadRequest)
		return
	}

	var msg colmetricspb.ExportMetricsServiceRequest
	if err := unmarshal(req.Header.Get("Content-Type"), body, &msg); err != nil {
		http.Error(w, "failed to decode: "+err.Error(), http.StatusBadRequest)
		return
	}

	if err := r.proc.ProcessMetrics(req.Context(), msg.ResourceMetrics); err != nil {
		log.Printf("error processing metrics: %v", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("{}"))
}

func (r *HTTPReceiver) handleLogs(w http.ResponseWriter, req *http.Request) {
	body, err := io.ReadAll(req.Body)
	if err != nil {
		http.Error(w, "failed to read body", http.StatusBadRequest)
		return
	}

	var msg collogspb.ExportLogsServiceRequest
	if err := unmarshal(req.Header.Get("Content-Type"), body, &msg); err != nil {
		http.Error(w, "failed to decode: "+err.Error(), http.StatusBadRequest)
		return
	}

	if err := r.proc.ProcessLogs(req.Context(), msg.ResourceLogs); err != nil {
		log.Printf("error processing logs: %v", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("{}"))
}

func unmarshal(contentType string, data []byte, msg proto.Message) error {
	if strings.Contains(contentType, "application/json") {
		return protojson.Unmarshal(data, msg)
	}
	// Default to protobuf
	return proto.Unmarshal(data, msg)
}
