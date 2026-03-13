package processor

import (
	"encoding/hex"
	"testing"
	"time"

	"go.opentelemetry.io/collector/pdata/pcommon"
	"go.opentelemetry.io/collector/pdata/pmetric"
)

func TestParseMetricsWithExemplars(t *testing.T) {
	md := pmetric.NewMetrics()
	rm := md.ResourceMetrics().AppendEmpty()
	rm.Resource().Attributes().PutStr("service.name", "test-service")
	sm := rm.ScopeMetrics().AppendEmpty()

	now := pcommon.NewTimestampFromTime(time.Now())
	traceID := pcommon.TraceID([16]byte{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16})
	spanID := pcommon.SpanID([8]byte{1, 2, 3, 4, 5, 6, 7, 8})

	// 1. Gauge with Exemplar
	mGauge := sm.Metrics().AppendEmpty()
	mGauge.SetName("test_gauge")
	mGauge.SetEmptyGauge()
	dpGauge := mGauge.Gauge().DataPoints().AppendEmpty()
	dpGauge.SetDoubleValue(100.5)
	dpGauge.SetTimestamp(now)
	exGauge := dpGauge.Exemplars().AppendEmpty()
	exGauge.SetDoubleValue(100.5)
	exGauge.SetTimestamp(now)
	exGauge.SetTraceID(traceID)
	exGauge.SetSpanID(spanID)
	exGauge.FilteredAttributes().PutStr("key", "val")

	// 2. Sum with Exemplar
	mSum := sm.Metrics().AppendEmpty()
	mSum.SetName("test_sum")
	mSum.SetEmptySum()
	dpSum := mSum.Sum().DataPoints().AppendEmpty()
	dpSum.SetDoubleValue(50)
	dpSum.SetTimestamp(now)
	exSum := dpSum.Exemplars().AppendEmpty()
	exSum.SetDoubleValue(50)
	exSum.SetTimestamp(now)
	exSum.SetTraceID(traceID)
	exSum.SetSpanID(spanID)

	// 3. Histogram with Exemplar
	mHist := sm.Metrics().AppendEmpty()
	mHist.SetName("test_hist")
	mHist.SetEmptyHistogram()
	dpHist := mHist.Histogram().DataPoints().AppendEmpty()
	dpHist.SetCount(1)
	dpHist.SetSum(10.5)
	dpHist.ExplicitBounds().FromRaw([]float64{5, 10, 20})
	dpHist.BucketCounts().FromRaw([]uint64{0, 0, 1, 0})
	dpHist.SetTimestamp(now)
	exHist := dpHist.Exemplars().AppendEmpty()
	exHist.SetDoubleValue(10.5)
	exHist.SetTimestamp(now)
	exHist.SetTraceID(traceID)
	exHist.SetSpanID(spanID)

	// 4. Exponential Histogram with Exemplar
	mExpHist := sm.Metrics().AppendEmpty()
	mExpHist.SetName("test_exp_hist")
	mExpHist.SetEmptyExponentialHistogram()
	dpExpHist := mExpHist.ExponentialHistogram().DataPoints().AppendEmpty()
	dpExpHist.SetCount(1)
	dpExpHist.SetSum(15.2)
	dpExpHist.SetTimestamp(now)
	exExpHist := dpExpHist.Exemplars().AppendEmpty()
	exExpHist.SetDoubleValue(15.2)
	exExpHist.SetTimestamp(now)
	exExpHist.SetTraceID(traceID)
	exExpHist.SetSpanID(spanID)

	// Run Parser
	result := ParseMetricsWithExemplars(md)

	if len(result.Metrics) != 4 {
		t.Errorf("expected 4 metrics, got %d", len(result.Metrics))
	}

	if len(result.Exemplars) != 4 {
		t.Errorf("expected 4 exemplars, got %d", len(result.Exemplars))
	}

	expectedTraceID := hex.EncodeToString(traceID[:])
	expectedSpanID := hex.EncodeToString(spanID[:])

	type caseData struct {
		name  string
		mType string
		val   float64
	}
	cases := []caseData{
		{"test_gauge", "gauge", 100.5},
		{"test_sum", "sum", 50},
		{"test_hist", "histogram", 10.5},
		{"test_exp_hist", "exponential_histogram", 15.2},
	}

	for i, c := range cases {
		found := false
		for _, ex := range result.Exemplars {
			if ex.MetricName == c.name {
				found = true
				if ex.MetricType != c.mType {
					t.Errorf("case %d (%s): expected type %s, got %s", i, c.name, c.mType, ex.MetricType)
				}
				if ex.Value != c.val {
					t.Errorf("case %d (%s): expected value %f, got %f", i, c.name, c.val, ex.Value)
				}
				if ex.TraceID != expectedTraceID {
					t.Errorf("case %d (%s): expected trace_id %s, got %s", i, c.name, expectedTraceID, ex.TraceID)
				}
				if ex.SpanID != expectedSpanID {
					t.Errorf("case %d (%s): expected span_id %s, got %s", i, c.name, expectedSpanID, ex.SpanID)
				}
				if c.name == "test_gauge" {
					if ex.Attributes["key"] != "val" {
						t.Errorf("expected attribute key=val, got %v", ex.Attributes["key"])
					}
				}
				break
			}
		}
		if !found {
			t.Errorf("exemplar for %s not found", c.name)
		}
	}
}

func TestTraceIDToHexOrEmpty(t *testing.T) {
	tid := pcommon.TraceID([16]byte{0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15})
	hexTid := traceIDToHexOrEmpty(tid)
	if hexTid != "000102030405060708090a0b0c0d0e0f" {
		t.Errorf("unexpected trace id hex: %s", hexTid)
	}

	emptyTid := pcommon.TraceID([16]byte{})
	if traceIDToHexOrEmpty(emptyTid) != "" {
		t.Errorf("expected empty string for empty trace id")
	}
}
