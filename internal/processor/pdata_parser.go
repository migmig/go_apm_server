package processor

import (
	"encoding/hex"
	"encoding/json"
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
			scopeMap := getScopeMap(ils.Scope().Name(), ils.Scope().Version())

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

				spanLinks := make([]storage.SpanLink, 0, sp.Links().Len())
				for l := 0; l < sp.Links().Len(); l++ {
					lnk := sp.Links().At(l)
					spanLinks = append(spanLinks, storage.SpanLink{
						TraceID:    traceIDToHexOrEmpty(lnk.TraceID()),
						SpanID:     spanIDToHexOrEmpty(lnk.SpanID()),
						TraceState: lnk.TraceState().AsRaw(),
						Flags:      int32(lnk.Flags()),
						Attributes: pcommonMapToMap(lnk.Attributes()),
					})
				}

				s := storage.Span{
					TraceID:              traceID,
					SpanID:               spanID,
					ParentSpanID:         parentSpanID,
					ServiceName:          serviceName,
					SpanName:             sp.Name(),
					SpanKind:             int32(sp.Kind()),
					StartTime:            int64(sp.StartTimestamp()),
					EndTime:              int64(sp.EndTimestamp()),
					DurationNs:           int64(sp.EndTimestamp() - sp.StartTimestamp()),
					StatusCode:           int32(sp.Status().Code()),
					StatusMessage:        sp.Status().Message(),
					Attributes:           attrs,
					Events:               events,
					Links:                spanLinks,
					ResourceAttributes:   resAttrs,
					InstrumentationScope: scopeMap,
					TraceState:           sp.TraceState().AsRaw(),
					Flags:                int32(sp.Flags()),
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
			scopeMap := getScopeMap(ilm.Scope().Name(), ilm.Scope().Version())
			for k := 0; k < ilm.Metrics().Len(); k++ {
				m := ilm.Metrics().At(k)

				switch m.Type() {
				case pmetric.MetricTypeGauge:
					dps := m.Gauge().DataPoints()
					for l := 0; l < dps.Len(); l++ {
						dp := dps.At(l)
						metrics = append(metrics, storage.Metric{
							ServiceName:          serviceName,
							MetricName:           m.Name(),
							MetricType:           int32(m.Type()),
							Value:                getValue(dp),
							Attributes:           pcommonMapToMap(dp.Attributes()),
							ResourceAttributes:   resAttrs,
							Timestamp:            int64(dp.Timestamp()),
							StartTimestamp:       int64(dp.StartTimestamp()),
							InstrumentationScope: scopeMap,
						})
					}
				case pmetric.MetricTypeSum:
					dps := m.Sum().DataPoints()
					for l := 0; l < dps.Len(); l++ {
						dp := dps.At(l)
						metrics = append(metrics, storage.Metric{
							ServiceName:            serviceName,
							MetricName:             m.Name(),
							MetricType:             int32(m.Type()),
							Value:                  getValue(dp),
							Attributes:             pcommonMapToMap(dp.Attributes()),
							ResourceAttributes:     resAttrs,
							Timestamp:              int64(dp.Timestamp()),
							StartTimestamp:         int64(dp.StartTimestamp()),
							AggregationTemporality: int32(m.Sum().AggregationTemporality()),
							IsMonotonic:            m.Sum().IsMonotonic(),
							InstrumentationScope:   scopeMap,
						})
					}
				case pmetric.MetricTypeHistogram:
					dps := m.Histogram().DataPoints()
					for l := 0; l < dps.Len(); l++ {
						dp := dps.At(l)

						var buckets []storage.HistogramBucket
						bounds := dp.ExplicitBounds()
						counts := dp.BucketCounts()

						for bIdx := 0; bIdx < bounds.Len(); bIdx++ {
							count := uint64(0)
							if bIdx < counts.Len() {
								count = counts.At(bIdx)
							}
							buckets = append(buckets, storage.HistogramBucket{
								UpperBound: bounds.At(bIdx),
								Count:      count,
							})
						}

						// Include the "+Inf" bucket if counts exist beyond bounds
						if bounds.Len() < counts.Len() {
							buckets = append(buckets, storage.HistogramBucket{
								UpperBound: 1e99, // Represents roughly +Inf for local representation
								Count:      counts.At(counts.Len() - 1),
							})
						}

						metrics = append(metrics, storage.Metric{
							ServiceName:            serviceName,
							MetricName:             m.Name(),
							MetricType:             int32(m.Type()),
							HistogramCount:         int64(dp.Count()),
							HistogramSum:           dp.Sum(),
							HistogramBuckets:       buckets,
							Attributes:             pcommonMapToMap(dp.Attributes()),
							ResourceAttributes:     resAttrs,
							Timestamp:              int64(dp.Timestamp()),
							StartTimestamp:         int64(dp.StartTimestamp()),
							AggregationTemporality: int32(m.Histogram().AggregationTemporality()),
							InstrumentationScope:   scopeMap,
						})
					}

				case pmetric.MetricTypeExponentialHistogram:
					dps := m.ExponentialHistogram().DataPoints()
					for l := 0; l < dps.Len(); l++ {
						dp := dps.At(l)
						metrics = append(metrics, storage.Metric{
							ServiceName:            serviceName,
							MetricName:             m.Name(),
							MetricType:             int32(m.Type()),
							HistogramCount:         int64(dp.Count()),
							HistogramSum:           dp.Sum(),
							Attributes:             pcommonMapToMap(dp.Attributes()),
							ResourceAttributes:     resAttrs,
							Timestamp:              int64(dp.Timestamp()),
							StartTimestamp:         int64(dp.StartTimestamp()),
							AggregationTemporality: int32(m.ExponentialHistogram().AggregationTemporality()),
							InstrumentationScope:   scopeMap,
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
			scopeMap := getScopeMap(ill.Scope().Name(), ill.Scope().Version())
			for k := 0; k < ill.LogRecords().Len(); k++ {
				lr := ill.LogRecords().At(k)

				logs = append(logs, storage.LogRecord{
					TraceID:              traceIDToHexOrEmpty(lr.TraceID()),
					SpanID:               spanIDToHexOrEmpty(lr.SpanID()),
					ServiceName:          serviceName,
					SeverityNumber:       int32(lr.SeverityNumber()),
					SeverityText:         lr.SeverityText(),
					Body:                 parseLogBody(lr.Body()),
					Attributes:           pcommonMapToMap(lr.Attributes()),
					ResourceAttributes:   resAttrs,
					Timestamp:            int64(lr.Timestamp()),
					ObservedTimestamp:    int64(lr.ObservedTimestamp()),
					InstrumentationScope: scopeMap,
				})
			}
		}
	}
	return logs
}

func getScopeMap(name, version string) map[string]any {
	if name == "" && version == "" {
		return nil
	}
	m := make(map[string]any)
	if name != "" {
		m["name"] = name
	}
	if version != "" {
		m["version"] = version
	}
	return m
}

func parseLogBody(v pcommon.Value) string {
	if v.Type() == pcommon.ValueTypeMap || v.Type() == pcommon.ValueTypeSlice {
		if b, err := json.Marshal(v.AsRaw()); err == nil {
			return string(b)
		}
	}
	return v.AsString()
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
