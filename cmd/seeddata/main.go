package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"math"
	mrand "math/rand"
	"os"
	"time"

	"github.com/migmig/go_apm_server/internal/storage"
)

func randomHex(n int) string {
	b := make([]byte, n)
	rand.Read(b)
	return hex.EncodeToString(b)
}

var services = []struct {
	name     string
	ops      []string
	errRate  float64
	baseMs   float64
	jitterMs float64
}{
	{
		name:     "api-gateway",
		ops:      []string{"GET /api/users", "POST /api/orders", "GET /api/products", "PUT /api/users/{id}", "DELETE /api/sessions"},
		errRate:  0.03,
		baseMs:   15,
		jitterMs: 40,
	},
	{
		name:     "user-service",
		ops:      []string{"FindUserByID", "CreateUser", "UpdateProfile", "ValidateToken", "ListUsers"},
		errRate:  0.02,
		baseMs:   8,
		jitterMs: 20,
	},
	{
		name:     "order-service",
		ops:      []string{"CreateOrder", "GetOrderHistory", "CancelOrder", "ProcessPayment", "UpdateOrderStatus"},
		errRate:  0.05,
		baseMs:   25,
		jitterMs: 80,
	},
	{
		name:     "product-service",
		ops:      []string{"SearchProducts", "GetProductDetail", "UpdateInventory", "GetCategories"},
		errRate:  0.01,
		baseMs:   12,
		jitterMs: 30,
	},
	{
		name:     "notification-service",
		ops:      []string{"SendEmail", "SendPush", "SendSMS", "QueueNotification"},
		errRate:  0.08,
		baseMs:   50,
		jitterMs: 200,
	},
	{
		name:     "payment-gateway",
		ops:      []string{"ChargeCard", "RefundPayment", "VerifyPayment", "GetPaymentStatus"},
		errRate:  0.04,
		baseMs:   100,
		jitterMs: 300,
	},
}

var logMessages = map[string][]struct {
	severity int32
	sevText  string
	body     string
}{
	"api-gateway": {
		{9, "INFO", "Incoming request received"},
		{9, "INFO", "Request routed to upstream service"},
		{9, "INFO", "Response returned to client"},
		{13, "WARN", "Rate limit threshold approaching"},
		{17, "ERROR", "Upstream service timeout after 5000ms"},
		{17, "ERROR", "Circuit breaker triggered for order-service"},
	},
	"user-service": {
		{9, "INFO", "User authentication successful"},
		{9, "INFO", "Token refreshed for user session"},
		{9, "INFO", "User profile updated"},
		{13, "WARN", "Password retry attempt #3"},
		{17, "ERROR", "Database connection pool exhausted"},
	},
	"order-service": {
		{9, "INFO", "New order created successfully"},
		{9, "INFO", "Order status changed to PROCESSING"},
		{9, "INFO", "Inventory reserved for order"},
		{13, "WARN", "Payment processing delayed"},
		{13, "WARN", "Order retry due to optimistic lock conflict"},
		{17, "ERROR", "Failed to process payment: card declined"},
		{21, "FATAL", "Dead letter queue threshold exceeded"},
	},
	"product-service": {
		{9, "INFO", "Product search completed"},
		{9, "INFO", "Inventory cache refreshed"},
		{9, "INFO", "Category tree rebuilt"},
		{13, "WARN", "Search index lag detected: 2.3s behind"},
	},
	"notification-service": {
		{9, "INFO", "Email notification sent"},
		{9, "INFO", "Push notification delivered"},
		{13, "WARN", "SMS provider rate limited, queuing"},
		{13, "WARN", "Email bounce detected for user@example.com"},
		{17, "ERROR", "Push notification delivery failed: invalid token"},
		{17, "ERROR", "SMS gateway connection timeout"},
	},
	"payment-gateway": {
		{9, "INFO", "Payment authorization successful"},
		{9, "INFO", "Refund processed"},
		{13, "WARN", "Payment verification retry #2"},
		{17, "ERROR", "Payment declined: insufficient funds"},
		{17, "ERROR", "Payment gateway 503: service unavailable"},
	},
}

func main() {
	ctx := context.Background()
	dataDir := "./data"

	// 1. 기존 DB 파일 삭제
	fmt.Println("기존 데이터 삭제 중...")
	entries, _ := os.ReadDir(dataDir)
	for _, e := range entries {
		if !e.IsDir() {
			os.Remove(fmt.Sprintf("%s/%s", dataDir, e.Name()))
		}
	}
	fmt.Println("기존 데이터 삭제 완료")

	// 2. 스토리지 초기화
	store, err := storage.NewSQLite(ctx, dataDir)
	if err != nil {
		fmt.Fprintf(os.Stderr, "storage init error: %v\n", err)
		os.Exit(1)
	}
	defer store.Close()

	// 3. 3일치 데이터 생성 (3/8, 3/9, 3/10)
	days := []time.Time{
		time.Date(2026, 3, 8, 0, 0, 0, 0, time.Local),
		time.Date(2026, 3, 9, 0, 0, 0, 0, time.Local),
		time.Date(2026, 3, 10, 0, 0, 0, 0, time.Local),
	}

	tracesPerDay := []int{80, 120, 60} // 8일: 적당히, 9일: 많이, 10일: 오늘(적게)
	logsPerDay := []int{200, 350, 150}

	for i, day := range days {
		fmt.Printf("\n=== %s 데이터 생성 중 ===\n", day.Format("2006-01-02"))

		spans := generateSpans(day, tracesPerDay[i])
		fmt.Printf("  트레이스: %d건 (스팬: %d건)\n", tracesPerDay[i], len(spans))
		if err := store.InsertSpans(ctx, spans); err != nil {
			fmt.Fprintf(os.Stderr, "  스팬 삽입 실패: %v\n", err)
			os.Exit(1)
		}

		logs := generateLogs(day, logsPerDay[i], spans)
		fmt.Printf("  로그: %d건\n", len(logs))
		if err := store.InsertLogs(ctx, logs); err != nil {
			fmt.Fprintf(os.Stderr, "  로그 삽입 실패: %v\n", err)
			os.Exit(1)
		}
	}

	fmt.Println("\n샘플 데이터 생성 완료!")

	// 4. 결과 확인
	parts, _ := store.GetPartitions()
	fmt.Println("\n파티션 현황:")
	for _, p := range parts {
		fmt.Printf("  %s  %s  (%.1f KB)\n", p.Date, p.FilePath, float64(p.SizeBytes)/1024)
	}
}

func generateSpans(day time.Time, traceCount int) []storage.Span {
	var allSpans []storage.Span

	for t := 0; t < traceCount; t++ {
		// 하루 중 랜덤 시간 (업무 시간대 가중)
		hour := weightedHour()
		minute := mrand.Intn(60)
		second := mrand.Intn(60)
		baseTime := time.Date(day.Year(), day.Month(), day.Day(), hour, minute, second, mrand.Intn(1e9), time.Local)

		traceID := randomHex(16)

		// 서비스 체인 결정 (1~4 depth)
		chainLen := 1 + mrand.Intn(4)
		svcIndices := mrand.Perm(len(services))[:chainLen]

		var parentSpanID string
		accumulated := int64(0)

		for depth, svcIdx := range svcIndices {
			svc := services[svcIdx]
			op := svc.ops[mrand.Intn(len(svc.ops))]
			spanID := randomHex(8)

			durationMs := svc.baseMs + mrand.Float64()*svc.jitterMs
			// 가끔 느린 요청
			if mrand.Float64() < 0.05 {
				durationMs *= 3 + mrand.Float64()*5
			}
			durationNs := int64(durationMs * 1e6)

			startNano := baseTime.UnixNano() + accumulated
			endNano := startNano + durationNs
			accumulated += durationNs/2 + int64(mrand.Float64()*float64(durationNs)/2)

			statusCode := int32(1) // OK
			statusMsg := ""
			if mrand.Float64() < svc.errRate {
				statusCode = 2 // ERROR
				statusMsg = "internal error"
			}

			attrs := map[string]any{}
			resAttrs := map[string]any{
				"service.name":    svc.name,
				"service.version": fmt.Sprintf("v1.%d.0", mrand.Intn(10)),
				"host.name":       fmt.Sprintf("%s-pod-%d", svc.name, mrand.Intn(3)+1),
			}

			switch {
			case depth == 0:
				attrs["http.method"] = []string{"GET", "POST", "PUT", "DELETE"}[mrand.Intn(4)]
				attrs["http.url"] = fmt.Sprintf("https://api.example.com%s", op)
				attrs["http.status_code"] = 200
				if statusCode == 2 {
					attrs["http.status_code"] = []int{500, 502, 503, 429}[mrand.Intn(4)]
				}
				attrs["net.peer.ip"] = fmt.Sprintf("10.0.%d.%d", mrand.Intn(255), mrand.Intn(255))
			default:
				attrs["rpc.system"] = "grpc"
				attrs["rpc.method"] = op
				attrs["rpc.service"] = svc.name
			}

			var events []storage.SpanEvent
			if statusCode == 2 {
				events = append(events, storage.SpanEvent{
					Name:      "exception",
					Timestamp: startNano + durationNs/2,
					Attributes: map[string]any{
						"exception.type":    "RuntimeException",
						"exception.message": "Something went wrong",
					},
				})
			}

			kind := int32(2) // SERVER
			if depth > 0 {
				kind = 3 // CLIENT
			}

			allSpans = append(allSpans, storage.Span{
				TraceID:            traceID,
				SpanID:             spanID,
				ParentSpanID:       parentSpanID,
				ServiceName:        svc.name,
				SpanName:           op,
				SpanKind:           kind,
				StartTime:          startNano,
				EndTime:            endNano,
				DurationNs:         durationNs,
				StatusCode:         statusCode,
				StatusMessage:      statusMsg,
				Attributes:         attrs,
				Events:             events,
				ResourceAttributes: resAttrs,
			})

			parentSpanID = spanID
		}
	}

	return allSpans
}

func generateLogs(day time.Time, count int, spans []storage.Span) []storage.LogRecord {
	logs := make([]storage.LogRecord, 0, count)

	for i := 0; i < count; i++ {
		svc := services[mrand.Intn(len(services))]
		msgs := logMessages[svc.name]
		msg := msgs[mrand.Intn(len(msgs))]

		hour := weightedHour()
		minute := mrand.Intn(60)
		second := mrand.Intn(60)
		ts := time.Date(day.Year(), day.Month(), day.Day(), hour, minute, second, mrand.Intn(1e9), time.Local)

		// 일부 로그는 기존 트레이스와 연결
		traceID := ""
		spanID := ""
		if mrand.Float64() < 0.6 && len(spans) > 0 {
			sp := spans[mrand.Intn(len(spans))]
			traceID = sp.TraceID
			spanID = sp.SpanID
		}

		attrs := map[string]any{
			"log.source":     fmt.Sprintf("%s/main.go:%d", svc.name, 50+mrand.Intn(300)),
			"thread.name":    fmt.Sprintf("worker-%d", mrand.Intn(8)),
			"deployment.env": "production",
		}

		if msg.severity >= 17 {
			attrs["error.code"] = fmt.Sprintf("ERR_%04d", mrand.Intn(9999))
		}

		logs = append(logs, storage.LogRecord{
			TraceID:        traceID,
			SpanID:         spanID,
			ServiceName:    svc.name,
			SeverityNumber: msg.severity,
			SeverityText:   msg.sevText,
			Body:           msg.body,
			Attributes:     attrs,
			ResourceAttributes: map[string]any{
				"service.name": svc.name,
				"host.name":    fmt.Sprintf("%s-pod-%d", svc.name, mrand.Intn(3)+1),
			},
			Timestamp: ts.UnixNano(),
		})
	}

	return logs
}

// 업무 시간대(9-18시)에 가중치를 둔 시간 생성
func weightedHour() int {
	r := mrand.Float64()
	if r < 0.7 {
		return 9 + mrand.Intn(9) // 09~17 (70%)
	}
	if r < 0.9 {
		return 18 + mrand.Intn(4) // 18~21 (20%)
	}
	return mrand.Intn(9) // 00~08 (10%)
}

// suppress unused import
var _ = math.Pi
