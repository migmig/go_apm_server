package receiver

import (
	"context"
	"fmt"
	"net"

	"go.opentelemetry.io/collector/pdata/plog/plogotlp"
	"go.opentelemetry.io/collector/pdata/pmetric/pmetricotlp"
	"go.opentelemetry.io/collector/pdata/ptrace/ptraceotlp"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"

	"github.com/migmig/go_apm_server/internal/config"
	"github.com/migmig/go_apm_server/internal/processor"
)

type GRPCReceiver struct {
	server *grpc.Server
	proc   *processor.Processor
	port   int
}

func NewGRPCReceiver(cfg config.ReceiverConfig, proc *processor.Processor) *GRPCReceiver {
	var opts []grpc.ServerOption

	if cfg.TLSEnabled && cfg.TLSCertPath != "" && cfg.TLSKeyPath != "" {
		creds, err := credentials.NewServerTLSFromFile(cfg.TLSCertPath, cfg.TLSKeyPath)
		if err == nil {
			opts = append(opts, grpc.Creds(creds))
		} else {
			fmt.Printf("failed to load gRPC TLS creds: %v\n", err)
		}
	}

	if cfg.MaxBodySize > 0 {
		opts = append(opts, grpc.MaxRecvMsgSize(cfg.MaxBodySize*1024*1024))
	}

	s := grpc.NewServer(opts...)
	r := &GRPCReceiver{server: s, proc: proc}

	ptraceotlp.RegisterGRPCServer(s, &traceServer{proc: proc})
	pmetricotlp.RegisterGRPCServer(s, &metricServer{proc: proc})
	plogotlp.RegisterGRPCServer(s, &logServer{proc: proc})

	return r
}

var _port int

func (r *GRPCReceiver) Start(ctx context.Context, port int) error {
	lis, err := net.Listen("tcp", fmt.Sprintf(":%d", port))
	if err != nil {
		return err
	}
	r.port = lis.Addr().(*net.TCPAddr).Port

	go func() {
		if err := r.server.Serve(lis); err != nil {
			fmt.Printf("grpc server error: %v\n", err)
		}
	}()
	return nil
}

func (r *GRPCReceiver) Port() int {
	return r.port
}

func (r *GRPCReceiver) Stop() {
	r.server.GracefulStop()
}

type traceServer struct {
	ptraceotlp.UnimplementedGRPCServer
	proc *processor.Processor
}

func (s *traceServer) Export(ctx context.Context, req ptraceotlp.ExportRequest) (ptraceotlp.ExportResponse, error) {
	spans := processor.ParseTraces(req.Traces())
	resp := ptraceotlp.NewExportResponse()
	if err := s.proc.PushSpans(ctx, spans); err != nil {
		ps := resp.PartialSuccess()
		ps.SetRejectedSpans(int64(len(spans)))
		ps.SetErrorMessage(err.Error())
		return resp, nil
	}
	return resp, nil
}

type metricServer struct {
	pmetricotlp.UnimplementedGRPCServer
	proc *processor.Processor
}

func (s *metricServer) Export(ctx context.Context, req pmetricotlp.ExportRequest) (pmetricotlp.ExportResponse, error) {
	metrics := processor.ParseMetrics(req.Metrics())
	resp := pmetricotlp.NewExportResponse()
	if err := s.proc.PushMetrics(ctx, metrics); err != nil {
		ps := resp.PartialSuccess()
		ps.SetRejectedDataPoints(int64(len(metrics)))
		ps.SetErrorMessage(err.Error())
		return resp, nil
	}
	return resp, nil
}

type logServer struct {
	plogotlp.UnimplementedGRPCServer
	proc *processor.Processor
}

func (s *logServer) Export(ctx context.Context, req plogotlp.ExportRequest) (plogotlp.ExportResponse, error) {
	logs := processor.ParseLogs(req.Logs())
	resp := plogotlp.NewExportResponse()
	if err := s.proc.PushLogs(ctx, logs); err != nil {
		ps := resp.PartialSuccess()
		ps.SetRejectedLogRecords(int64(len(logs)))
		ps.SetErrorMessage(err.Error())
		return resp, nil
	}
	return resp, nil
}
