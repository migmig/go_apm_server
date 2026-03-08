package receiver

import (
	"context"
	"fmt"
	"log"
	"net"

	collogspb "go.opentelemetry.io/proto/otlp/collector/logs/v1"
	colmetricspb "go.opentelemetry.io/proto/otlp/collector/metrics/v1"
	coltracepb "go.opentelemetry.io/proto/otlp/collector/trace/v1"
	"google.golang.org/grpc"

	"github.com/migmig/go_apm_server/internal/processor"
)

type GRPCReceiver struct {
	proc   *processor.Processor
	server *grpc.Server
	port   int
}

func NewGRPC(port int, proc *processor.Processor) *GRPCReceiver {
	return &GRPCReceiver{
		proc: proc,
		port: port,
	}
}

func (r *GRPCReceiver) Start() error {
	lis, err := net.Listen("tcp", fmt.Sprintf(":%d", r.port))
	if err != nil {
		return fmt.Errorf("grpc listen: %w", err)
	}

	// Update port with actual port assigned if port was 0
	if r.port == 0 {
		r.port = lis.Addr().(*net.TCPAddr).Port
	}

	r.server = grpc.NewServer()
	coltracepb.RegisterTraceServiceServer(r.server, &traceService{proc: r.proc})
	colmetricspb.RegisterMetricsServiceServer(r.server, &metricsService{proc: r.proc})
	collogspb.RegisterLogsServiceServer(r.server, &logsService{proc: r.proc})

	log.Printf("OTLP gRPC receiver listening on :%d", r.port)
	return r.server.Serve(lis)
}

func (r *GRPCReceiver) Stop() {
	if r.server != nil {
		r.server.GracefulStop()
	}
}

func (r *GRPCReceiver) Port() int {
	return r.port
}

// --- Trace Service ---

type traceService struct {
	coltracepb.UnimplementedTraceServiceServer
	proc *processor.Processor
}

func (s *traceService) Export(ctx context.Context, req *coltracepb.ExportTraceServiceRequest) (*coltracepb.ExportTraceServiceResponse, error) {
	if err := s.proc.ProcessTraces(ctx, req.ResourceSpans); err != nil {
		log.Printf("error processing traces: %v", err)
		return nil, err
	}
	return &coltracepb.ExportTraceServiceResponse{}, nil
}

// --- Metrics Service ---

type metricsService struct {
	colmetricspb.UnimplementedMetricsServiceServer
	proc *processor.Processor
}

func (s *metricsService) Export(ctx context.Context, req *colmetricspb.ExportMetricsServiceRequest) (*colmetricspb.ExportMetricsServiceResponse, error) {
	if err := s.proc.ProcessMetrics(ctx, req.ResourceMetrics); err != nil {
		log.Printf("error processing metrics: %v", err)
		return nil, err
	}
	return &colmetricspb.ExportMetricsServiceResponse{}, nil
}

// --- Logs Service ---

type logsService struct {
	collogspb.UnimplementedLogsServiceServer
	proc *processor.Processor
}

func (s *logsService) Export(ctx context.Context, req *collogspb.ExportLogsServiceRequest) (*collogspb.ExportLogsServiceResponse, error) {
	if err := s.proc.ProcessLogs(ctx, req.ResourceLogs); err != nil {
		log.Printf("error processing logs: %v", err)
		return nil, err
	}
	return &collogspb.ExportLogsServiceResponse{}, nil
}
