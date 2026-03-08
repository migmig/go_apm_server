package tests

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/migmig/go_apm_server/internal/api"
	"github.com/migmig/go_apm_server/internal/config"
	"github.com/migmig/go_apm_server/internal/processor"
	"github.com/migmig/go_apm_server/internal/receiver"
	"github.com/migmig/go_apm_server/internal/storage"

	collogspb "go.opentelemetry.io/proto/otlp/collector/logs/v1"
	colmetricspb "go.opentelemetry.io/proto/otlp/collector/metrics/v1"
	coltracepb "go.opentelemetry.io/proto/otlp/collector/trace/v1"
	commonpb "go.opentelemetry.io/proto/otlp/common/v1"
	logspb "go.opentelemetry.io/proto/otlp/logs/v1"
	metricspb "go.opentelemetry.io/proto/otlp/metrics/v1"
	resourcepb "go.opentelemetry.io/proto/otlp/resource/v1"
	tracepb "go.opentelemetry.io/proto/otlp/trace/v1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/protobuf/proto"
)

type testServer struct {
	store    storage.Storage
	proc     *processor.Processor
	grpcRecv *receiver.GRPCReceiver
	httpRecv *receiver.HTTPReceiver
	apiSrv   *httptest.Server

	grpcPort int
	httpPort int
}

func setupTestEnvironment(t *testing.T) *testServer {
	t.Helper()

	ctx := context.Background()
	store, err := storage.NewSQLite(ctx, ":memory:")
	if err != nil {
		t.Fatalf("failed to init storage: %v", err)
	}

	procCfg := config.ProcessorConfig{
		BatchSize:     10,
		FlushInterval: "1s",
		QueueSize:     100,
		DropOnFull:    false,
	}
	proc := processor.New(procCfg, store)
	proc.Start(ctx)

	recvCfg := config.ReceiverConfig{}

	grpcRecv := receiver.NewGRPCReceiver(recvCfg, proc)
	go func() {
		if err := grpcRecv.Start(ctx, 0); err != nil {
			fmt.Fprintf(os.Stderr, "gRPC receiver error: %v\n", err)
		}
	}()

	httpRecv := receiver.NewHTTPReceiver(recvCfg, proc)
	go func() {
		if err := httpRecv.Start(ctx, 0); err != nil {
			fmt.Fprintf(os.Stderr, "HTTP receiver error: %v\n", err)
		}
	}()

	// Wait for receivers to start and retrieve their assigned ports
	time.Sleep(100 * time.Millisecond)

	apiHandler := api.NewHandler(store)
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/services", apiHandler.HandleGetServices)
	mux.HandleFunc("GET /api/traces", apiHandler.HandleGetTraces)
	mux.HandleFunc("GET /api/traces/{traceId}", apiHandler.HandleGetTraceDetail)
	mux.HandleFunc("GET /api/metrics", apiHandler.HandleGetMetrics)
	mux.HandleFunc("GET /api/logs", apiHandler.HandleGetLogs)
	mux.HandleFunc("GET /api/stats", apiHandler.HandleGetStats)

	apiSrv := httptest.NewServer(mux)

	return &testServer{
		store:    store,
		proc:     proc,
		grpcRecv: grpcRecv,
		httpRecv: httpRecv,
		apiSrv:   apiSrv,
		grpcPort: grpcRecv.Port(),
		httpPort: httpRecv.Port(),
	}
}

func (ts *testServer) teardown() {
	ts.grpcRecv.Stop()
	ts.httpRecv.Stop(context.Background())
	ts.apiSrv.Close()
	ts.store.Close()
}

func createTestTraceRequest() *coltracepb.ExportTraceServiceRequest {
	return &coltracepb.ExportTraceServiceRequest{
		ResourceSpans: []*tracepb.ResourceSpans{
			{
				Resource: &resourcepb.Resource{
					Attributes: []*commonpb.KeyValue{
						{Key: "service.name", Value: &commonpb.AnyValue{Value: &commonpb.AnyValue_StringValue{StringValue: "test-service"}}},
					},
				},
				ScopeSpans: []*tracepb.ScopeSpans{
					{
						Spans: []*tracepb.Span{
							{
								TraceId:           []byte{0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15},
								SpanId:            []byte{0, 1, 2, 3, 4, 5, 6, 7},
								Name:              "test-span",
								Kind:              tracepb.Span_SPAN_KIND_SERVER,
								StartTimeUnixNano: uint64(time.Now().UnixNano()),
								EndTimeUnixNano:   uint64(time.Now().Add(time.Second).UnixNano()),
								Status:            &tracepb.Status{Code: tracepb.Status_STATUS_CODE_OK},
								Attributes: []*commonpb.KeyValue{
									{Key: "http.method", Value: &commonpb.AnyValue{Value: &commonpb.AnyValue_StringValue{StringValue: "GET"}}},
								},
							},
						},
					},
				},
			},
		},
	}
}

func createTestMetricRequest() *colmetricspb.ExportMetricsServiceRequest {
	return &colmetricspb.ExportMetricsServiceRequest{
		ResourceMetrics: []*metricspb.ResourceMetrics{
			{
				Resource: &resourcepb.Resource{
					Attributes: []*commonpb.KeyValue{
						{Key: "service.name", Value: &commonpb.AnyValue{Value: &commonpb.AnyValue_StringValue{StringValue: "test-service-metrics"}}},
					},
				},
				ScopeMetrics: []*metricspb.ScopeMetrics{
					{
						Metrics: []*metricspb.Metric{
							{
								Name:        "test-metric",
								Description: "A test metric",
								Unit:        "1",
								Data: &metricspb.Metric_Gauge{
									Gauge: &metricspb.Gauge{
										DataPoints: []*metricspb.NumberDataPoint{
											{
												TimeUnixNano: uint64(time.Now().UnixNano()),
												Value:        &metricspb.NumberDataPoint_AsDouble{AsDouble: 42.0},
											},
										},
									},
								},
							},
						},
					},
				},
			},
		},
	}
}

func TestOTLPTraceCompliance(t *testing.T) {
	ts := setupTestEnvironment(t)
	defer ts.teardown()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// --- 1. gRPC Trace Export ---
	conn, err := grpc.DialContext(ctx, fmt.Sprintf("localhost:%d", ts.grpcPort), grpc.WithTransportCredentials(insecure.NewCredentials()), grpc.WithBlock())
	if err != nil {
		t.Fatalf("Failed to connect to gRPC server: %v", err)
	}
	defer conn.Close()

	traceClient := coltracepb.NewTraceServiceClient(conn)
	req := createTestTraceRequest()

	// Modify trace ID slightly to distinguish from HTTP test
	req.ResourceSpans[0].ScopeSpans[0].Spans[0].TraceId[0] = 1

	_, err = traceClient.Export(ctx, req)
	if err != nil {
		t.Fatalf("gRPC Trace Export failed: %v", err)
	}

	// --- 2. HTTP Trace Export (protobuf) ---
	reqHttp := createTestTraceRequest()
	reqHttp.ResourceSpans[0].ScopeSpans[0].Spans[0].TraceId[0] = 2

	data, err := proto.Marshal(reqHttp)
	if err != nil {
		t.Fatalf("Failed to marshal HTTP trace request: %v", err)
	}

	resp, err := http.Post(fmt.Sprintf("http://localhost:%d/v1/traces", ts.httpPort), "application/x-protobuf", bytes.NewReader(data))
	if err != nil {
		t.Fatalf("HTTP Trace Export failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("Expected HTTP 200 OK, got %d", resp.StatusCode)
	}

	// --- 3. Verify via API ---
	// Use polling to avoid flaky tests due to background processing
	deadline := time.Now().Add(2 * time.Second)
	var tracesResult struct {
		Traces []struct {
			TraceID string `json:"trace_id"`
			Name    string `json:"name"`
			Service string `json:"service_name"`
		} `json:"traces"`
	}
	var body []byte

	for time.Now().Before(deadline) {
		apiResp, err := http.Get(fmt.Sprintf("%s/api/traces?service=test-service", ts.apiSrv.URL))
		if err != nil {
			t.Fatalf("Failed to query traces API: %v", err)
		}

		if apiResp.StatusCode == http.StatusOK {
			body, _ = io.ReadAll(apiResp.Body)
			json.Unmarshal(body, &tracesResult)
			if len(tracesResult.Traces) == 2 {
				apiResp.Body.Close()
				break
			}
		}
		apiResp.Body.Close()
		time.Sleep(50 * time.Millisecond)
	}

	if len(tracesResult.Traces) != 2 {
		t.Fatalf("Expected 2 traces, found %d: %s", len(tracesResult.Traces), string(body))
	}
}

func createTestLogRequest() *collogspb.ExportLogsServiceRequest {
	return &collogspb.ExportLogsServiceRequest{
		ResourceLogs: []*logspb.ResourceLogs{
			{
				Resource: &resourcepb.Resource{
					Attributes: []*commonpb.KeyValue{
						{Key: "service.name", Value: &commonpb.AnyValue{Value: &commonpb.AnyValue_StringValue{StringValue: "test-service-logs"}}},
					},
				},
				ScopeLogs: []*logspb.ScopeLogs{
					{
						LogRecords: []*logspb.LogRecord{
							{
								TimeUnixNano:   uint64(time.Now().UnixNano()),
								SeverityText:   "INFO",
								SeverityNumber: logspb.SeverityNumber_SEVERITY_NUMBER_INFO,
								Body: &commonpb.AnyValue{
									Value: &commonpb.AnyValue_StringValue{StringValue: "This is a test log message"},
								},
								Attributes: []*commonpb.KeyValue{
									{Key: "custom.attr", Value: &commonpb.AnyValue{Value: &commonpb.AnyValue_StringValue{StringValue: "test-value"}}},
								},
							},
						},
					},
				},
			},
		},
	}
}

func TestOTLPMetricCompliance(t *testing.T) {
	ts := setupTestEnvironment(t)
	defer ts.teardown()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// --- 1. gRPC Metric Export ---
	conn, err := grpc.DialContext(ctx, fmt.Sprintf("localhost:%d", ts.grpcPort), grpc.WithTransportCredentials(insecure.NewCredentials()), grpc.WithBlock())
	if err != nil {
		t.Fatalf("Failed to connect to gRPC server: %v", err)
	}
	defer conn.Close()

	metricsClient := colmetricspb.NewMetricsServiceClient(conn)
	req := createTestMetricRequest()

	// Change metric name slightly to distinguish from HTTP test
	req.ResourceMetrics[0].ScopeMetrics[0].Metrics[0].Name = "test-metric-grpc"

	_, err = metricsClient.Export(ctx, req)
	if err != nil {
		t.Fatalf("gRPC Metric Export failed: %v", err)
	}

	// --- 2. HTTP Metric Export (protobuf) ---
	reqHttp := createTestMetricRequest()
	reqHttp.ResourceMetrics[0].ScopeMetrics[0].Metrics[0].Name = "test-metric-http"

	data, err := proto.Marshal(reqHttp)
	if err != nil {
		t.Fatalf("Failed to marshal HTTP metric request: %v", err)
	}

	resp, err := http.Post(fmt.Sprintf("http://localhost:%d/v1/metrics", ts.httpPort), "application/x-protobuf", bytes.NewReader(data))
	if err != nil {
		t.Fatalf("HTTP Metric Export failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("Expected HTTP 200 OK, got %d", resp.StatusCode)
	}

	// --- 3. Verify via API ---
	// Use polling to avoid flaky tests due to background processing
	deadline := time.Now().Add(2 * time.Second)

	// Verify gRPC metric
	var metricsResult struct {
		DataPoints []struct {
			Value float64 `json:"value"`
		} `json:"data_points"`
	}
	var body []byte

	for time.Now().Before(deadline) {
		apiResp, err := http.Get(fmt.Sprintf("%s/api/metrics?name=test-metric-grpc", ts.apiSrv.URL))
		if err == nil && apiResp.StatusCode == http.StatusOK {
			body, _ = io.ReadAll(apiResp.Body)
			json.Unmarshal(body, &metricsResult)
			if len(metricsResult.DataPoints) == 1 {
				apiResp.Body.Close()
				break
			}
		}
		if err == nil {
			apiResp.Body.Close()
		}
		time.Sleep(50 * time.Millisecond)
	}

	if len(metricsResult.DataPoints) != 1 {
		t.Fatalf("Expected 1 data point for grpc metric, found %d: %s", len(metricsResult.DataPoints), string(body))
	}
	if metricsResult.DataPoints[0].Value != 42.0 {
		t.Fatalf("Expected value 42.0, got %f", metricsResult.DataPoints[0].Value)
	}

	// Verify HTTP metric
	var metricsResultHttp struct {
		DataPoints []struct {
			Value float64 `json:"value"`
		} `json:"data_points"`
	}
	var bodyHttp []byte

	deadline = time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		apiRespHttp, err := http.Get(fmt.Sprintf("%s/api/metrics?name=test-metric-http", ts.apiSrv.URL))
		if err == nil && apiRespHttp.StatusCode == http.StatusOK {
			bodyHttp, _ = io.ReadAll(apiRespHttp.Body)
			json.Unmarshal(bodyHttp, &metricsResultHttp)
			if len(metricsResultHttp.DataPoints) == 1 {
				apiRespHttp.Body.Close()
				break
			}
		}
		if err == nil {
			apiRespHttp.Body.Close()
		}
		time.Sleep(50 * time.Millisecond)
	}

	if len(metricsResultHttp.DataPoints) != 1 {
		t.Fatalf("Expected 1 data point for http metric, found %d: %s", len(metricsResultHttp.DataPoints), string(bodyHttp))
	}
}

func TestOTLPLogCompliance(t *testing.T) {
	ts := setupTestEnvironment(t)
	defer ts.teardown()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// --- 1. gRPC Log Export ---
	conn, err := grpc.DialContext(ctx, fmt.Sprintf("localhost:%d", ts.grpcPort), grpc.WithTransportCredentials(insecure.NewCredentials()), grpc.WithBlock())
	if err != nil {
		t.Fatalf("Failed to connect to gRPC server: %v", err)
	}
	defer conn.Close()

	logsClient := collogspb.NewLogsServiceClient(conn)
	req := createTestLogRequest()

	req.ResourceLogs[0].ScopeLogs[0].LogRecords[0].Body.Value = &commonpb.AnyValue_StringValue{StringValue: "grpc-test-log"}

	_, err = logsClient.Export(ctx, req)
	if err != nil {
		t.Fatalf("gRPC Log Export failed: %v", err)
	}

	// --- 2. HTTP Log Export (protobuf) ---
	reqHttp := createTestLogRequest()
	reqHttp.ResourceLogs[0].ScopeLogs[0].LogRecords[0].Body.Value = &commonpb.AnyValue_StringValue{StringValue: "http-test-log"}

	data, err := proto.Marshal(reqHttp)
	if err != nil {
		t.Fatalf("Failed to marshal HTTP log request: %v", err)
	}

	resp, err := http.Post(fmt.Sprintf("http://localhost:%d/v1/logs", ts.httpPort), "application/x-protobuf", bytes.NewReader(data))
	if err != nil {
		t.Fatalf("HTTP Log Export failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("Expected HTTP 200 OK, got %d", resp.StatusCode)
	}

	// --- 3. Verify via API ---
	// Use polling to avoid flaky tests due to background processing
	deadline := time.Now().Add(2 * time.Second)
	var logsResult struct {
		Logs []struct {
			Body string `json:"body"`
		} `json:"logs"`
	}
	var body []byte

	for time.Now().Before(deadline) {
		apiResp, err := http.Get(fmt.Sprintf("%s/api/logs?service=test-service-logs", ts.apiSrv.URL))
		if err == nil && apiResp.StatusCode == http.StatusOK {
			body, _ = io.ReadAll(apiResp.Body)
			json.Unmarshal(body, &logsResult)
			if len(logsResult.Logs) == 2 {
				apiResp.Body.Close()
				break
			}
		}
		if err == nil {
			apiResp.Body.Close()
		}
		time.Sleep(50 * time.Millisecond)
	}

	if len(logsResult.Logs) != 2 {
		t.Fatalf("Expected 2 logs, found %d: %s", len(logsResult.Logs), string(body))
	}

	foundGrpc := false
	foundHttp := false
	for _, l := range logsResult.Logs {
		if l.Body == "grpc-test-log" {
			foundGrpc = true
		} else if l.Body == "http-test-log" {
			foundHttp = true
		}
	}

	if !foundGrpc || !foundHttp {
		t.Fatalf("Expected both 'grpc-test-log' and 'http-test-log', got %s", string(body))
	}
}
