package processor

import (
	"context"
	"encoding/hex"
	"fmt"

	commonpb "go.opentelemetry.io/proto/otlp/common/v1"
	logspb "go.opentelemetry.io/proto/otlp/logs/v1"
	metricspb "go.opentelemetry.io/proto/otlp/metrics/v1"
	tracepb "go.opentelemetry.io/proto/otlp/trace/v1"

	"github.com/migmig/go_apm_server/internal/storage"
)

type Processor struct {
	store storage.Storage
}

func New(store storage.Storage) *Processor {
	return &Processor{store: store}
}

// ProcessTraces converts OTLP ResourceSpans to internal Span models and stores them.
func (p *Processor) ProcessTraces(ctx context.Context, resourceSpans []*tracepb.ResourceSpans) error {
	var spans []storage.Span

	for _, rs := range resourceSpans {
		serviceName := extractServiceName(rs.Resource)
		resAttrs := convertAttributes(rs.Resource.GetAttributes())

		for _, ss := range rs.ScopeSpans {
			for _, s := range ss.Spans {
				span := storage.Span{
					TraceID:            hexEncode(s.TraceId),
					SpanID:             hexEncode(s.SpanId),
					ParentSpanID:       hexEncode(s.ParentSpanId),
					ServiceName:        serviceName,
					SpanName:           s.Name,
					SpanKind:           int32(s.Kind),
					StartTime:          int64(s.StartTimeUnixNano),
					EndTime:            int64(s.EndTimeUnixNano),
					DurationNs:         int64(s.EndTimeUnixNano) - int64(s.StartTimeUnixNano),
					StatusCode:         int32(s.Status.GetCode()),
					StatusMessage:      s.Status.GetMessage(),
					Attributes:         convertAttributes(s.Attributes),
					Events:             convertEvents(s.Events),
					ResourceAttributes: resAttrs,
				}
				spans = append(spans, span)
			}
		}
	}

	if len(spans) == 0 {
		return nil
	}
	return p.store.InsertSpans(ctx, spans)
}

// ProcessMetrics converts OTLP ResourceMetrics to internal Metric models and stores them.
func (p *Processor) ProcessMetrics(ctx context.Context, resourceMetrics []*metricspb.ResourceMetrics) error {
	var metrics []storage.Metric

	for _, rm := range resourceMetrics {
		serviceName := extractServiceName(rm.Resource)
		resAttrs := convertAttributes(rm.Resource.GetAttributes())

		for _, sm := range rm.ScopeMetrics {
			for _, m := range sm.Metrics {
				extracted := extractMetricDataPoints(m, serviceName, resAttrs)
				metrics = append(metrics, extracted...)
			}
		}
	}

	if len(metrics) == 0 {
		return nil
	}
	return p.store.InsertMetrics(ctx, metrics)
}

// ProcessLogs converts OTLP ResourceLogs to internal LogRecord models and stores them.
func (p *Processor) ProcessLogs(ctx context.Context, resourceLogs []*logspb.ResourceLogs) error {
	var logs []storage.LogRecord

	for _, rl := range resourceLogs {
		serviceName := extractServiceName(rl.Resource)
		resAttrs := convertAttributes(rl.Resource.GetAttributes())

		for _, sl := range rl.ScopeLogs {
			for _, lr := range sl.LogRecords {
				rec := storage.LogRecord{
					TraceID:            hexEncode(lr.TraceId),
					SpanID:             hexEncode(lr.SpanId),
					ServiceName:        serviceName,
					SeverityNumber:     int32(lr.SeverityNumber),
					SeverityText:       lr.SeverityText,
					Body:               anyValueToString(lr.Body),
					Attributes:         convertAttributes(lr.Attributes),
					ResourceAttributes: resAttrs,
					Timestamp:          int64(lr.TimeUnixNano),
				}
				logs = append(logs, rec)
			}
		}
	}

	if len(logs) == 0 {
		return nil
	}
	return p.store.InsertLogs(ctx, logs)
}

// --- helpers ---

func extractServiceName(res interface{ GetAttributes() []*commonpb.KeyValue }) string {
	if res == nil {
		return "unknown"
	}
	for _, kv := range res.GetAttributes() {
		if kv.Key == "service.name" {
			return anyValueToString(kv.Value)
		}
	}
	return "unknown"
}

func convertAttributes(kvs []*commonpb.KeyValue) map[string]any {
	m := make(map[string]any, len(kvs))
	for _, kv := range kvs {
		m[kv.Key] = anyValueToAny(kv.Value)
	}
	return m
}

func anyValueToAny(v *commonpb.AnyValue) any {
	if v == nil {
		return nil
	}
	switch val := v.Value.(type) {
	case *commonpb.AnyValue_StringValue:
		return val.StringValue
	case *commonpb.AnyValue_IntValue:
		return val.IntValue
	case *commonpb.AnyValue_DoubleValue:
		return val.DoubleValue
	case *commonpb.AnyValue_BoolValue:
		return val.BoolValue
	case *commonpb.AnyValue_ArrayValue:
		arr := make([]any, 0, len(val.ArrayValue.Values))
		for _, item := range val.ArrayValue.Values {
			arr = append(arr, anyValueToAny(item))
		}
		return arr
	case *commonpb.AnyValue_KvlistValue:
		return convertAttributes(val.KvlistValue.Values)
	case *commonpb.AnyValue_BytesValue:
		return hex.EncodeToString(val.BytesValue)
	default:
		return fmt.Sprintf("%v", v)
	}
}

func anyValueToString(v *commonpb.AnyValue) string {
	if v == nil {
		return ""
	}
	switch val := v.Value.(type) {
	case *commonpb.AnyValue_StringValue:
		return val.StringValue
	default:
		return fmt.Sprintf("%v", anyValueToAny(v))
	}
}

func hexEncode(b []byte) string {
	if len(b) == 0 {
		return ""
	}
	return hex.EncodeToString(b)
}

func convertEvents(events []*tracepb.Span_Event) []storage.SpanEvent {
	if len(events) == 0 {
		return nil
	}
	result := make([]storage.SpanEvent, 0, len(events))
	for _, e := range events {
		result = append(result, storage.SpanEvent{
			Name:       e.Name,
			Timestamp:  int64(e.TimeUnixNano),
			Attributes: convertAttributes(e.Attributes),
		})
	}
	return result
}

func extractMetricDataPoints(m *metricspb.Metric, serviceName string, resAttrs map[string]any) []storage.Metric {
	var metrics []storage.Metric

	switch data := m.Data.(type) {
	case *metricspb.Metric_Gauge:
		for _, dp := range data.Gauge.DataPoints {
			metrics = append(metrics, storage.Metric{
				ServiceName:        serviceName,
				MetricName:         m.Name,
				MetricType:         1, // Gauge
				Value:              numberValue(dp),
				Attributes:         convertAttributes(dp.Attributes),
				ResourceAttributes: resAttrs,
				Timestamp:          int64(dp.TimeUnixNano),
			})
		}
	case *metricspb.Metric_Sum:
		for _, dp := range data.Sum.DataPoints {
			metrics = append(metrics, storage.Metric{
				ServiceName:        serviceName,
				MetricName:         m.Name,
				MetricType:         2, // Sum
				Value:              numberValue(dp),
				Attributes:         convertAttributes(dp.Attributes),
				ResourceAttributes: resAttrs,
				Timestamp:          int64(dp.TimeUnixNano),
			})
		}
	case *metricspb.Metric_Histogram:
		for _, dp := range data.Histogram.DataPoints {
			buckets := make([]storage.HistogramBucket, 0, len(dp.ExplicitBounds))
			for i, bound := range dp.ExplicitBounds {
				var count uint64
				if i < len(dp.BucketCounts) {
					count = dp.BucketCounts[i]
				}
				buckets = append(buckets, storage.HistogramBucket{
					UpperBound: bound,
					Count:      count,
				})
			}
			metrics = append(metrics, storage.Metric{
				ServiceName:        serviceName,
				MetricName:         m.Name,
				MetricType:         3, // Histogram
				HistogramCount:     int64(dp.GetCount()),
				HistogramSum:       dp.GetSum(),
				HistogramBuckets:   buckets,
				Attributes:         convertAttributes(dp.Attributes),
				ResourceAttributes: resAttrs,
				Timestamp:          int64(dp.TimeUnixNano),
			})
		}
	}

	return metrics
}

type numberDataPoint interface {
	GetAsDouble() float64
	GetAsInt() int64
}

func numberValue(dp numberDataPoint) float64 {
	if v := dp.GetAsDouble(); v != 0 {
		return v
	}
	return float64(dp.GetAsInt())
}
