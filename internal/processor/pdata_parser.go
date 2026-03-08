package processor

import (
	"encoding/hex"
	"fmt"

	"go.opentelemetry.io/collector/pdata/pcommon"
	"go.opentelemetry.io/collector/pdata/plog"
	"go.opentelemetry.io/collector/pdata/pmetric"
	"go.opentelemetry.io/collector/pdata/ptrace"

	"github.com/migmig/go_apm_server/internal/storage"
)

func ParseTraces(td ptrace.Traces) []storage.Span {
	var spans []storage.Span

	rss := td.ResourceSpans()
	for i := 0; i < rss.Len(); i++ {
		rs := rss.At(i)
		res := rs.Resource()
		resAttrs := pcommonMapToMap(res.Attributes())

		serviceName := "unknown"
		if sn, ok := resAttrs["service.name"]; ok {
			serviceName = fmt.Sprint(sn)
		}

		ilss := rs.ScopeSpans()
		for j := 0; j < ilss.Len(); j++ {
			ils := ilss.At(j)

			for k := 0; k < ils.Spans().Len(); k++ {
				sp := ils.Spans().At(k)

				attrs := pcommonMapToMap(sp.Attributes())
				events := make([]storage.SpanEvent, 0, sp.Events().Len())
				for l := 0; l < sp.Events().Len(); l++ {
					e := sp.Events().At(l)
					events = append(events, storage.SpanEvent{
						Name:       e.Name(),
						Timestamp:  int64(e.Timestamp()),
						Attributes: pcommonMapToMap(e.Attributes()),
					})
				}

				traceID := traceIDToHexOrEmpty(sp.TraceID())
				spanID := spanIDToHexOrEmpty(sp.SpanID())
				parentSpanID := spanIDToHexOrEmpty(sp.ParentSpanID())

				s := storage.Span{
					TraceID:            traceID,
					SpanID:             spanID,
					ParentSpanID:       parentSpanID,
					ServiceName:        serviceName,
					SpanName:           sp.Name(),
					SpanKind:           int32(sp.Kind()),
					StartTime:          int64(sp.StartTimestamp()),
					EndTime:            int64(sp.EndTimestamp()),
					DurationNs:         int64(sp.EndTimestamp() - sp.StartTimestamp()),
					StatusCode:         int32(sp.Status().Code()),
					StatusMessage:      sp.Status().Message(),
					Attributes:         attrs,
					Events:             events,
					ResourceAttributes: resAttrs,
				}
				spans = append(spans, s)
			}
		}
	}
	return spans
}

func ParseMetrics(md pmetric.Metrics) []storage.Metric {
	var metrics []storage.Metric

	rms := md.ResourceMetrics()
	for i := 0; i < rms.Len(); i++ {
		rm := rms.At(i)
		resAttrs := pcommonMapToMap(rm.Resource().Attributes())

		serviceName := "unknown"
		if sn, ok := resAttrs["service.name"]; ok {
			serviceName = fmt.Sprint(sn)
		}

		ilms := rm.ScopeMetrics()
		for j := 0; j < ilms.Len(); j++ {
			ilm := ilms.At(j)
			for k := 0; k < ilm.Metrics().Len(); k++ {
				m := ilm.Metrics().At(k)

				switch m.Type() {
				case pmetric.MetricTypeGauge:
					dps := m.Gauge().DataPoints()
					for l := 0; l < dps.Len(); l++ {
						dp := dps.At(l)
						metrics = append(metrics, storage.Metric{
							ServiceName:        serviceName,
							MetricName:         m.Name(),
							MetricType:         int32(m.Type()),
							Value:              getValue(dp),
							Attributes:         pcommonMapToMap(dp.Attributes()),
							ResourceAttributes: resAttrs,
							Timestamp:          int64(dp.Timestamp()),
						})
					}
				case pmetric.MetricTypeSum:
					dps := m.Sum().DataPoints()
					for l := 0; l < dps.Len(); l++ {
						dp := dps.At(l)
						metrics = append(metrics, storage.Metric{
							ServiceName:        serviceName,
							MetricName:         m.Name(),
							MetricType:         int32(m.Type()),
							Value:              getValue(dp),
							Attributes:         pcommonMapToMap(dp.Attributes()),
							ResourceAttributes: resAttrs,
							Timestamp:          int64(dp.Timestamp()),
						})
					}
				case pmetric.MetricTypeHistogram:
					dps := m.Histogram().DataPoints()
					for l := 0; l < dps.Len(); l++ {
						dp := dps.At(l)
						metrics = append(metrics, storage.Metric{
							ServiceName:        serviceName,
							MetricName:         m.Name(),
							MetricType:         int32(m.Type()),
							HistogramCount:     int64(dp.Count()),
							HistogramSum:       dp.Sum(),
							Attributes:         pcommonMapToMap(dp.Attributes()),
							ResourceAttributes: resAttrs,
							Timestamp:          int64(dp.Timestamp()),
						})
					}
				}
			}
		}
	}
	return metrics
}

func ParseLogs(ld plog.Logs) []storage.LogRecord {
	var logs []storage.LogRecord

	rls := ld.ResourceLogs()
	for i := 0; i < rls.Len(); i++ {
		rl := rls.At(i)
		resAttrs := pcommonMapToMap(rl.Resource().Attributes())

		serviceName := "unknown"
		if sn, ok := resAttrs["service.name"]; ok {
			serviceName = fmt.Sprint(sn)
		}

		ills := rl.ScopeLogs()
		for j := 0; j < ills.Len(); j++ {
			ill := ills.At(j)
			for k := 0; k < ill.LogRecords().Len(); k++ {
				lr := ill.LogRecords().At(k)

				logs = append(logs, storage.LogRecord{
					TraceID:            traceIDToHexOrEmpty(lr.TraceID()),
					SpanID:             spanIDToHexOrEmpty(lr.SpanID()),
					ServiceName:        serviceName,
					SeverityNumber:     int32(lr.SeverityNumber()),
					SeverityText:       lr.SeverityText(),
					Body:               lr.Body().AsString(),
					Attributes:         pcommonMapToMap(lr.Attributes()),
					ResourceAttributes: resAttrs,
					Timestamp:          int64(lr.Timestamp()),
				})
			}
		}
	}
	return logs
}

func pcommonMapToMap(m pcommon.Map) map[string]any {
	result := make(map[string]any)
	m.Range(func(k string, v pcommon.Value) bool {
		result[k] = v.AsRaw()
		return true
	})
	return result
}

func traceIDToHexOrEmpty(t pcommon.TraceID) string {
	if t.IsEmpty() {
		return ""
	}
	arr := t
	return hex.EncodeToString(arr[:])
}

func spanIDToHexOrEmpty(s pcommon.SpanID) string {
	if s.IsEmpty() {
		return ""
	}
	arr := s
	return hex.EncodeToString(arr[:])
}

func getValue(dp pmetric.NumberDataPoint) float64 {
	if dp.ValueType() == pmetric.NumberDataPointValueTypeDouble {
		return dp.DoubleValue()
	}
	return float64(dp.IntValue())
}
