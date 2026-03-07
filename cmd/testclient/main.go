package main

import (
	"context"
	"fmt"
	"log"
	"math/rand"
	"time"

	coltracepb "go.opentelemetry.io/proto/otlp/collector/trace/v1"
	colmetricspb "go.opentelemetry.io/proto/otlp/collector/metrics/v1"
	collogspb "go.opentelemetry.io/proto/otlp/collector/logs/v1"
	commonpb "go.opentelemetry.io/proto/otlp/common/v1"
	logspb "go.opentelemetry.io/proto/otlp/logs/v1"
	metricspb "go.opentelemetry.io/proto/otlp/metrics/v1"
	resourcepb "go.opentelemetry.io/proto/otlp/resource/v1"
	tracepb "go.opentelemetry.io/proto/otlp/trace/v1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

var services = []string{"api-gateway", "user-service", "order-service", "payment-service"}

var operations = map[string][]string{
	"api-gateway":     {"GET /api/users", "GET /api/orders", "POST /api/orders", "GET /api/health"},
	"user-service":    {"GetUser", "ListUsers", "CreateUser", "ValidateToken"},
	"order-service":   {"GetOrder", "CreateOrder", "ListOrders", "UpdateOrder"},
	"payment-service": {"ProcessPayment", "RefundPayment", "GetPaymentStatus"},
}

func main() {
	ctx := context.Background()

	conn, err := grpc.NewClient("localhost:4317", grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		log.Fatalf("connect: %v", err)
	}
	defer conn.Close()

	traceClient := coltracepb.NewTraceServiceClient(conn)
	metricsClient := colmetricspb.NewMetricsServiceClient(conn)
	logsClient := collogspb.NewLogsServiceClient(conn)

	log.Println("Sending test data...")

	// Generate 20 traces
	for i := 0; i < 20; i++ {
		traceID := randomBytes(16)
		svc := services[rand.Intn(len(services))]
		ops := operations[svc]
		op := ops[rand.Intn(len(ops))]
		now := time.Now().Add(-time.Duration(rand.Intn(3600)) * time.Second)

		rootSpanID := randomBytes(8)
		rootDuration := time.Duration(rand.Intn(500)+10) * time.Millisecond
		statusCode := tracepb.Status_STATUS_CODE_OK
		if rand.Float64() < 0.15 {
			statusCode = tracepb.Status_STATUS_CODE_ERROR
		}

		spans := []*tracepb.Span{
			{
				TraceId:           traceID,
				SpanId:            rootSpanID,
				Name:              op,
				Kind:              tracepb.Span_SPAN_KIND_SERVER,
				StartTimeUnixNano: uint64(now.UnixNano()),
				EndTimeUnixNano:   uint64(now.Add(rootDuration).UnixNano()),
				Status:            &tracepb.Status{Code: statusCode},
				Attributes: []*commonpb.KeyValue{
					strAttr("http.method", "GET"),
					strAttr("http.url", "/"+op),
				},
			},
		}

		// Add 1-3 child spans
		childCount := rand.Intn(3) + 1
		childServices := []string{"user-service", "order-service", "payment-service"}
		for j := 0; j < childCount; j++ {
			childSvc := childServices[rand.Intn(len(childServices))]
			childOps := operations[childSvc]
			childOp := childOps[rand.Intn(len(childOps))]
			childStart := now.Add(time.Duration(rand.Intn(50)+5) * time.Millisecond)
			childDuration := time.Duration(rand.Intn(200)+5) * time.Millisecond

			spans = append(spans, &tracepb.Span{
				TraceId:           traceID,
				SpanId:            randomBytes(8),
				ParentSpanId:      rootSpanID,
				Name:              childOp,
				Kind:              tracepb.Span_SPAN_KIND_CLIENT,
				StartTimeUnixNano: uint64(childStart.UnixNano()),
				EndTimeUnixNano:   uint64(childStart.Add(childDuration).UnixNano()),
				Status:            &tracepb.Status{Code: tracepb.Status_STATUS_CODE_OK},
				Attributes: []*commonpb.KeyValue{
					strAttr("peer.service", childSvc),
				},
			})
		}

		_, err := traceClient.Export(ctx, &coltracepb.ExportTraceServiceRequest{
			ResourceSpans: []*tracepb.ResourceSpans{{
				Resource: resource(svc),
				ScopeSpans: []*tracepb.ScopeSpans{{
					Spans: spans,
				}},
			}},
		})
		if err != nil {
			log.Printf("trace export error: %v", err)
		}
	}
	fmt.Println("  20 traces sent")

	// Generate metrics
	for _, svc := range services {
		now := time.Now()
		var dataPoints []*metricspb.NumberDataPoint
		for i := 0; i < 30; i++ {
			ts := now.Add(-time.Duration(30-i) * time.Minute)
			dataPoints = append(dataPoints, &metricspb.NumberDataPoint{
				TimeUnixNano: uint64(ts.UnixNano()),
				Value:        &metricspb.NumberDataPoint_AsDouble{AsDouble: rand.Float64()*200 + 10},
				Attributes: []*commonpb.KeyValue{
					strAttr("http.method", "GET"),
				},
			})
		}

		_, err := metricsClient.Export(ctx, &colmetricspb.ExportMetricsServiceRequest{
			ResourceMetrics: []*metricspb.ResourceMetrics{{
				Resource: resource(svc),
				ScopeMetrics: []*metricspb.ScopeMetrics{{
					Metrics: []*metricspb.Metric{
						{
							Name: "http.server.duration",
							Data: &metricspb.Metric_Gauge{
								Gauge: &metricspb.Gauge{DataPoints: dataPoints},
							},
						},
					},
				}},
			}},
		})
		if err != nil {
			log.Printf("metric export error: %v", err)
		}
	}
	fmt.Println("  120 metric data points sent (4 services x 30)")

	// Generate logs
	severities := []logspb.SeverityNumber{
		logspb.SeverityNumber_SEVERITY_NUMBER_INFO,
		logspb.SeverityNumber_SEVERITY_NUMBER_WARN,
		logspb.SeverityNumber_SEVERITY_NUMBER_ERROR,
		logspb.SeverityNumber_SEVERITY_NUMBER_DEBUG,
	}
	severityTexts := []string{"INFO", "WARN", "ERROR", "DEBUG"}
	logMessages := []string{
		"handling incoming request",
		"database query completed",
		"cache miss for key user:123",
		"failed to connect to downstream service",
		"authentication successful",
		"rate limit exceeded",
		"request completed successfully",
		"retrying operation, attempt 2",
	}

	for _, svc := range services {
		var logRecords []*logspb.LogRecord
		for i := 0; i < 15; i++ {
			sevIdx := rand.Intn(len(severities))
			ts := time.Now().Add(-time.Duration(rand.Intn(3600)) * time.Second)
			logRecords = append(logRecords, &logspb.LogRecord{
				TimeUnixNano:   uint64(ts.UnixNano()),
				SeverityNumber: severities[sevIdx],
				SeverityText:   severityTexts[sevIdx],
				Body:           &commonpb.AnyValue{Value: &commonpb.AnyValue_StringValue{StringValue: logMessages[rand.Intn(len(logMessages))]}},
				Attributes: []*commonpb.KeyValue{
					strAttr("component", "handler"),
				},
			})
		}

		_, err := logsClient.Export(ctx, &collogspb.ExportLogsServiceRequest{
			ResourceLogs: []*logspb.ResourceLogs{{
				Resource: resource(svc),
				ScopeLogs: []*logspb.ScopeLogs{{
					LogRecords: logRecords,
				}},
			}},
		})
		if err != nil {
			log.Printf("log export error: %v", err)
		}
	}
	fmt.Println("  60 log records sent (4 services x 15)")

	log.Println("Done! Visit http://localhost:8080 to see the data.")
}

func resource(serviceName string) *resourcepb.Resource {
	return &resourcepb.Resource{
		Attributes: []*commonpb.KeyValue{
			strAttr("service.name", serviceName),
			strAttr("service.version", "1.0.0"),
			strAttr("host.name", "localhost"),
		},
	}
}

func strAttr(key, value string) *commonpb.KeyValue {
	return &commonpb.KeyValue{
		Key:   key,
		Value: &commonpb.AnyValue{Value: &commonpb.AnyValue_StringValue{StringValue: value}},
	}
}

func randomBytes(n int) []byte {
	b := make([]byte, n)
	rand.Read(b)
	return b
}
