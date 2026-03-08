package receiver

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"time"

	"go.opentelemetry.io/collector/pdata/plog/plogotlp"
	"go.opentelemetry.io/collector/pdata/pmetric/pmetricotlp"
	"go.opentelemetry.io/collector/pdata/ptrace/ptraceotlp"

	"github.com/migmig/go_apm_server/internal/config"
	"github.com/migmig/go_apm_server/internal/processor"
)

type HTTPReceiver struct {
	server *http.Server
	proc   *processor.Processor
	port   int
}

func NewHTTPReceiver(cfg config.ReceiverConfig, proc *processor.Processor) *HTTPReceiver {
	mux := http.NewServeMux()

	r := &HTTPReceiver{
		proc: proc,
	}

	mux.HandleFunc("/v1/traces", r.handleTraces)
	mux.HandleFunc("/v1/metrics", r.handleMetrics)
	mux.HandleFunc("/v1/logs", r.handleLogs)

	r.server = &http.Server{Handler: mux}
	return r
}

func (r *HTTPReceiver) Start(ctx context.Context, port int) error {
	lis, err := net.Listen("tcp", fmt.Sprintf(":%d", port))
	if err != nil {
		return err
	}
	r.port = lis.Addr().(*net.TCPAddr).Port

	go func() {
		if err := r.server.Serve(lis); err != nil && err != http.ErrServerClosed {
			fmt.Printf("http server error: %v\n", err)
		}
	}()
	return nil
}

func (r *HTTPReceiver) Port() int {
	return r.port
}

func (r *HTTPReceiver) Stop(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	return r.server.Shutdown(ctx)
}

func (r *HTTPReceiver) handleTraces(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	body, err := io.ReadAll(req.Body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer req.Body.Close()

	var exportReq ptraceotlp.ExportRequest

	contentType := req.Header.Get("Content-Type")
	if contentType == "application/x-protobuf" {
		exportReq = ptraceotlp.NewExportRequest()
		if err := exportReq.UnmarshalProto(body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
	} else {
		exportReq = ptraceotlp.NewExportRequest()
		if err := exportReq.UnmarshalJSON(body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
	}

	spans := processor.ParseTraces(exportReq.Traces())
	if err := r.proc.PushSpans(req.Context(), spans); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (r *HTTPReceiver) handleMetrics(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	body, err := io.ReadAll(req.Body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer req.Body.Close()

	var exportReq pmetricotlp.ExportRequest

	contentType := req.Header.Get("Content-Type")
	if contentType == "application/x-protobuf" {
		exportReq = pmetricotlp.NewExportRequest()
		if err := exportReq.UnmarshalProto(body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
	} else {
		exportReq = pmetricotlp.NewExportRequest()
		if err := exportReq.UnmarshalJSON(body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
	}

	metrics := processor.ParseMetrics(exportReq.Metrics())
	if err := r.proc.PushMetrics(req.Context(), metrics); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (r *HTTPReceiver) handleLogs(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	body, err := io.ReadAll(req.Body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer req.Body.Close()

	var exportReq plogotlp.ExportRequest

	contentType := req.Header.Get("Content-Type")
	if contentType == "application/x-protobuf" {
		exportReq = plogotlp.NewExportRequest()
		if err := exportReq.UnmarshalProto(body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
	} else {
		exportReq = plogotlp.NewExportRequest()
		if err := exportReq.UnmarshalJSON(body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
	}

	logs := processor.ParseLogs(exportReq.Logs())
	if err := r.proc.PushLogs(req.Context(), logs); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}
