package processor

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strconv"

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

				// Extract and remove semantic conventions from attributes
				var (
					httpMethod, httpRoute, dbSystem, dbOp, rpcSystem, msgSystem string
					httpStatusCode                                              *int64
				)

				if v, ok := attrs["http.method"]; ok {
					httpMethod = fmt.Sprint(v)
					delete(attrs, "http.method")
				}
				if v, ok := attrs["http.route"]; ok {
					httpRoute = fmt.Sprint(v)
					delete(attrs, "http.route")
				}
				if v, ok := attrs["http.status_code"]; ok {
					if n, err := strconv.ParseInt(fmt.Sprint(v), 10, 64); err == nil {
						httpStatusCode = &n
					}
					delete(attrs, "http.status_code")
				}
				if v, ok := attrs["db.system"]; ok {
					dbSystem = fmt.Sprint(v)
					delete(attrs, "db.system")
				}
				if v, ok := attrs["db.operation"]; ok {
					dbOp = fmt.Sprint(v)
					delete(attrs, "db.operation")
				}
				if v, ok := attrs["rpc.system"]; ok {
					rpcSystem = fmt.Sprint(v)
					delete(attrs, "rpc.system")
				}
				if v, ok := attrs["messaging.system"]; ok {
					msgSystem = fmt.Sprint(v)
					delete(attrs, "messaging.system")
				}

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
					HTTPMethod:           httpMethod,
					HTTPRoute:            httpRoute,
					HTTPStatusCode:       httpStatusCode,
					DBSystem:             dbSystem,
					DBOperation:          dbOp,
					RPCSystem:            rpcSystem,
					MessagingSystem:      msgSystem,
				}
				spans = append(spans, s)
			}
		}
	}
	return spans
}

type ParseMetricsResult struct {
	Metrics   []storage.Metric
	Exemplars []storage.Exemplar
}

func ParseMetrics(md pmetric.Metrics) []storage.Metric {
	result := ParseMetricsWithExemplars(md)
	return result.Metrics
}

func ParseMetricsWithExemplars(md pmetric.Metrics) ParseMetricsResult {
	var metrics []storage.Metric
	var exemplars []storage.Exemplar

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
						exemplars = append(exemplars, extractNumberExemplars(m.Name(), "gauge", dp.Exemplars())...)
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
						exemplars = append(exemplars, extractNumberExemplars(m.Name(), "sum", dp.Exemplars())...)
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
						exemplars = append(exemplars, extractHistogramExemplars(m.Name(), dp.Exemplars())...)
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
						exemplars = append(exemplars, extractExpHistogramExemplars(m.Name(), dp.Exemplars())...)
					}
				}
			}
		}
	}
	return ParseMetricsResult{Metrics: metrics, Exemplars: exemplars}
}

func extractNumberExemplars(metricName, metricType string, exs pmetric.ExemplarSlice) []storage.Exemplar {
	var result []storage.Exemplar
	for i := 0; i < exs.Len(); i++ {
		ex := exs.At(i)
		tid := traceIDToHexOrEmpty(ex.TraceID())
		sid := spanIDToHexOrEmpty(ex.SpanID())
		if tid == "" {
			continue
		}
		var val float64
		if ex.ValueType() == pmetric.ExemplarValueTypeDouble {
			val = ex.DoubleValue()
		} else {
			val = float64(ex.IntValue())
		}
		result = append(result, storage.Exemplar{
			MetricName: metricName,
			MetricType: metricType,
			Timestamp:  int64(ex.Timestamp()),
			Value:      val,
			TraceID:    tid,
			SpanID:     sid,
			Attributes: pcommonMapToMap(ex.FilteredAttributes()),
		})
	}
	return result
}

func extractHistogramExemplars(metricName string, exs pmetric.ExemplarSlice) []storage.Exemplar {
	return extractNumberExemplars(metricName, "histogram", exs)
}

func extractExpHistogramExemplars(metricName string, exs pmetric.ExemplarSlice) []storage.Exemplar {
	return extractNumberExemplars(metricName, "exponential_histogram", exs)
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

func ToOTLPTraces(spans []storage.Span) ptrace.Traces {
	td := ptrace.NewTraces()
	if len(spans) == 0 {
		return td
	}

	// Group spans by service name
	serviceSpans := make(map[string][]storage.Span)
	for _, s := range spans {
		serviceSpans[s.ServiceName] = append(serviceSpans[s.ServiceName], s)
	}

	for svc, spans := range serviceSpans {
		rs := td.ResourceSpans().AppendEmpty()
		rs.Resource().Attributes().PutStr("service.name", svc)

		// Map back resource attributes if present in first span
		if len(spans) > 0 {
			mapToPCommonMap(spans[0].ResourceAttributes, rs.Resource().Attributes())
		}

		ss := rs.ScopeSpans().AppendEmpty()
		for _, s := range spans {
			sp := ss.Spans().AppendEmpty()
			sp.SetTraceID(hexToTraceID(s.TraceID))
			sp.SetSpanID(hexToSpanID(s.SpanID))
			sp.SetParentSpanID(hexToSpanID(s.ParentSpanID))
			sp.SetName(s.SpanName)
			sp.SetKind(ptrace.SpanKind(s.SpanKind))
			sp.SetStartTimestamp(pcommon.Timestamp(s.StartTime))
			sp.SetEndTimestamp(pcommon.Timestamp(s.EndTime))
			sp.Status().SetCode(ptrace.StatusCode(s.StatusCode))
			sp.Status().SetMessage(s.StatusMessage)
			sp.TraceState().FromRaw(s.TraceState)
			sp.SetFlags(uint32(s.Flags))

			attrs := sp.Attributes()
			mapToPCommonMap(s.Attributes, attrs)

			// Restore semantic conventions
			if s.HTTPMethod != "" {
				attrs.PutStr("http.method", s.HTTPMethod)
			}
			if s.HTTPRoute != "" {
				attrs.PutStr("http.route", s.HTTPRoute)
			}
			if s.HTTPStatusCode != nil {
				attrs.PutInt("http.status_code", *s.HTTPStatusCode)
			}
			if s.DBSystem != "" {
				attrs.PutStr("db.system", s.DBSystem)
			}
			if s.DBOperation != "" {
				attrs.PutStr("db.operation", s.DBOperation)
			}
			if s.RPCSystem != "" {
				attrs.PutStr("rpc.system", s.RPCSystem)
			}
			if s.MessagingSystem != "" {
				attrs.PutStr("messaging.system", s.MessagingSystem)
			}

			for _, e := range s.Events {
				ev := sp.Events().AppendEmpty()
				ev.SetName(e.Name)
				ev.SetTimestamp(pcommon.Timestamp(e.Timestamp))
				mapToPCommonMap(e.Attributes, ev.Attributes())
			}

			for _, l := range s.Links {
				link := sp.Links().AppendEmpty()
				link.SetTraceID(hexToTraceID(l.TraceID))
				link.SetSpanID(hexToSpanID(l.SpanID))
				link.TraceState().FromRaw(l.TraceState)
				link.SetFlags(uint32(l.Flags))
				mapToPCommonMap(l.Attributes, link.Attributes())
			}
		}
	}
	return td
}

func ToOTLPMetrics(metrics []storage.Metric) pmetric.Metrics {
	md := pmetric.NewMetrics()
	if len(metrics) == 0 {
		return md
	}

	serviceMetrics := make(map[string][]storage.Metric)
	for _, m := range metrics {
		serviceMetrics[m.ServiceName] = append(serviceMetrics[m.ServiceName], m)
	}

	for svc, ms := range serviceMetrics {
		rm := md.ResourceMetrics().AppendEmpty()
		rm.Resource().Attributes().PutStr("service.name", svc)
		if len(ms) > 0 {
			mapToPCommonMap(ms[0].ResourceAttributes, rm.Resource().Attributes())
		}

		sm := rm.ScopeMetrics().AppendEmpty()
		for _, m := range ms {
			met := sm.Metrics().AppendEmpty()
			met.SetName(m.MetricName)

			switch m.MetricType {
			case int32(pmetric.MetricTypeGauge):
				met.SetEmptyGauge()
				dp := met.Gauge().DataPoints().AppendEmpty()
				dp.SetDoubleValue(m.Value)
				dp.SetTimestamp(pcommon.Timestamp(m.Timestamp))
				dp.SetStartTimestamp(pcommon.Timestamp(m.StartTimestamp))
				mapToPCommonMap(m.Attributes, dp.Attributes())
			case int32(pmetric.MetricTypeSum):
				met.SetEmptySum()
				met.Sum().SetIsMonotonic(m.IsMonotonic)
				met.Sum().SetAggregationTemporality(pmetric.AggregationTemporality(m.AggregationTemporality))
				dp := met.Sum().DataPoints().AppendEmpty()
				dp.SetDoubleValue(m.Value)
				dp.SetTimestamp(pcommon.Timestamp(m.Timestamp))
				dp.SetStartTimestamp(pcommon.Timestamp(m.StartTimestamp))
				mapToPCommonMap(m.Attributes, dp.Attributes())
			case int32(pmetric.MetricTypeHistogram):
				met.SetEmptyHistogram()
				met.Histogram().SetAggregationTemporality(pmetric.AggregationTemporality(m.AggregationTemporality))
				dp := met.Histogram().DataPoints().AppendEmpty()
				dp.SetCount(uint64(m.HistogramCount))
				dp.SetSum(m.HistogramSum)
				dp.SetTimestamp(pcommon.Timestamp(m.Timestamp))
				dp.SetStartTimestamp(pcommon.Timestamp(m.StartTimestamp))
				mapToPCommonMap(m.Attributes, dp.Attributes())

				var bounds []float64
				var counts []uint64
				for _, b := range m.HistogramBuckets {
					if b.UpperBound < 1e99 {
						bounds = append(bounds, b.UpperBound)
					}
					counts = append(counts, b.Count)
				}
				dp.ExplicitBounds().FromRaw(bounds)
				dp.BucketCounts().FromRaw(counts)
			}
		}
	}
	return md
}

func ToOTLPLogs(logs []storage.LogRecord) plog.Logs {
	ld := plog.NewLogs()
	if len(logs) == 0 {
		return ld
	}

	serviceLogs := make(map[string][]storage.LogRecord)
	for _, l := range logs {
		serviceLogs[l.ServiceName] = append(serviceLogs[l.ServiceName], l)
	}

	for svc, ls := range serviceLogs {
		rl := ld.ResourceLogs().AppendEmpty()
		rl.Resource().Attributes().PutStr("service.name", svc)
		if len(ls) > 0 {
			mapToPCommonMap(ls[0].ResourceAttributes, rl.Resource().Attributes())
		}

		sl := rl.ScopeLogs().AppendEmpty()
		for _, l := range ls {
			lr := sl.LogRecords().AppendEmpty()
			lr.SetTimestamp(pcommon.Timestamp(l.Timestamp))
			lr.SetObservedTimestamp(pcommon.Timestamp(l.ObservedTimestamp))
			lr.SetSeverityNumber(plog.SeverityNumber(l.SeverityNumber))
			lr.SetSeverityText(l.SeverityText)
			lr.Body().SetStr(l.Body)
			lr.SetTraceID(hexToTraceID(l.TraceID))
			lr.SetSpanID(hexToSpanID(l.SpanID))
			mapToPCommonMap(l.Attributes, lr.Attributes())
		}
	}
	return ld
}

func mapToPCommonMap(src map[string]any, dst pcommon.Map) {
	for k, v := range src {
		switch val := v.(type) {
		case string:
			dst.PutStr(k, val)
		case int64:
			dst.PutInt(k, val)
		case float64:
			dst.PutDouble(k, val)
		case bool:
			dst.PutBool(k, val)
		case []any:
			s := dst.PutEmptySlice(k)
			for _, item := range val {
				pcommonValueFromAny(item, s.AppendEmpty())
			}
		case map[string]any:
			m := dst.PutEmptyMap(k)
			mapToPCommonMap(val, m)
		}
	}
}

func pcommonValueFromAny(src any, dst pcommon.Value) {
	switch val := src.(type) {
	case string:
		dst.SetStr(val)
	case int64:
		dst.SetInt(val)
	case float64:
		dst.SetDouble(val)
	case bool:
		dst.SetBool(val)
	}
}

func hexToTraceID(s string) pcommon.TraceID {
	if s == "" {
		return pcommon.TraceID([16]byte{})
	}
	b, _ := hex.DecodeString(s)
	var tid [16]byte
	copy(tid[:], b)
	return pcommon.TraceID(tid)
}

func hexToSpanID(s string) pcommon.SpanID {
	if s == "" {
		return pcommon.SpanID([8]byte{})
	}
	b, _ := hex.DecodeString(s)
	var sid [8]byte
	copy(sid[:], b)
	return pcommon.SpanID(sid)
}
