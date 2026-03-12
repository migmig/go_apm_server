package receiver

import (
	"compress/gzip"
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
	server      *http.Server
	proc        *processor.Processor
	port        int
	maxBodySize int
	tlsEnabled  bool
	tlsCertPath string
	tlsKeyPath  string
}

func NewHTTPReceiver(cfg config.ReceiverConfig, proc *processor.Processor) *HTTPReceiver {
	mux := http.NewServeMux()

	r := &HTTPReceiver{
		proc:        proc,
		maxBodySize: cfg.MaxBodySize,
		tlsEnabled:  cfg.TLSEnabled,
		tlsCertPath: cfg.TLSCertPath,
		tlsKeyPath:  cfg.TLSKeyPath,
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
		if r.tlsEnabled && r.tlsCertPath != "" && r.tlsKeyPath != "" {
			if err := r.server.ServeTLS(lis, r.tlsCertPath, r.tlsKeyPath); err != nil && err != http.ErrServerClosed {
				fmt.Printf("https server error: %v\n", err)
			}
		} else {
			if err := r.server.Serve(lis); err != nil && err != http.ErrServerClosed {
				fmt.Printf("http server error: %v\n", err)
			}
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

func (r *HTTPReceiver) readBody(w http.ResponseWriter, req *http.Request) ([]byte, error) {
	var bodyReader io.Reader = req.Body

	if r.maxBodySize > 0 {
		bodyReader = http.MaxBytesReader(w, req.Body, int64(r.maxBodySize)*1024*1024)
	}

	if req.Header.Get("Content-Encoding") == "gzip" {
		gr, err := gzip.NewReader(bodyReader)
		if err != nil {
			return nil, fmt.Errorf("gzip reader: %w", err)
		}
		defer gr.Close()
		bodyReader = gr
	}

	return io.ReadAll(bodyReader)
}

func (r *HTTPReceiver) handleTraces(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	body, err := r.readBody(w, req)
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
	resp := ptraceotlp.NewExportResponse()

	if err := r.proc.PushSpans(req.Context(), spans); err != nil {
		ps := resp.PartialSuccess()
		ps.SetRejectedSpans(int64(len(spans)))
		ps.SetErrorMessage(err.Error())
	}

	sendTraceResponse(w, contentType, resp)
}

func sendTraceResponse(w http.ResponseWriter, contentType string, resp ptraceotlp.ExportResponse) {
	var b []byte
	var err error
	if contentType == "application/x-protobuf" {
		w.Header().Set("Content-Type", "application/x-protobuf")
		b, err = resp.MarshalProto()
	} else {
		w.Header().Set("Content-Type", "application/json")
		b, err = resp.MarshalJSON()
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
	w.Write(b)
}

func (r *HTTPReceiver) handleMetrics(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	body, err := r.readBody(w, req)
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
	resp := pmetricotlp.NewExportResponse()

	if err := r.proc.PushMetrics(req.Context(), metrics); err != nil {
		ps := resp.PartialSuccess()
		ps.SetRejectedDataPoints(int64(len(metrics)))
		ps.SetErrorMessage(err.Error())
	}

	sendMetricResponse(w, contentType, resp)
}

func sendMetricResponse(w http.ResponseWriter, contentType string, resp pmetricotlp.ExportResponse) {
	var b []byte
	var err error
	if contentType == "application/x-protobuf" {
		w.Header().Set("Content-Type", "application/x-protobuf")
		b, err = resp.MarshalProto()
	} else {
		w.Header().Set("Content-Type", "application/json")
		b, err = resp.MarshalJSON()
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
	w.Write(b)
}

func (r *HTTPReceiver) handleLogs(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	body, err := r.readBody(w, req)
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
	resp := plogotlp.NewExportResponse()

	if err := r.proc.PushLogs(req.Context(), logs); err != nil {
		ps := resp.PartialSuccess()
		ps.SetRejectedLogRecords(int64(len(logs)))
		ps.SetErrorMessage(err.Error())
	}

	sendLogResponse(w, contentType, resp)
}

func sendLogResponse(w http.ResponseWriter, contentType string, resp plogotlp.ExportResponse) {
	var b []byte
	var err error
	if contentType == "application/x-protobuf" {
		w.Header().Set("Content-Type", "application/x-protobuf")
		b, err = resp.MarshalProto()
	} else {
		w.Header().Set("Content-Type", "application/json")
		b, err = resp.MarshalJSON()
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
	w.Write(b)
}
