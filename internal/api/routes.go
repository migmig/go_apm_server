package api

import (
	"fmt"
	"io/fs"
	"net/http"
	"time"

	"github.com/migmig/go_apm_server/internal/storage"
	"github.com/migmig/go_apm_server/web"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

func NewServer(port int, store storage.Storage) *http.Server {
	h := NewHandler(store)

	mux := http.NewServeMux()
	mux.Handle("GET /metrics", promhttp.Handler())
	mux.HandleFunc("GET /health", h.HandleHealth)
	mux.HandleFunc("GET /api/services", h.HandleGetServices)
	mux.HandleFunc("GET /api/traces", h.HandleGetTraces)
	mux.HandleFunc("GET /api/traces/{traceId}", h.HandleGetTraceDetail)
	mux.HandleFunc("GET /api/metrics", h.HandleGetMetrics)
	mux.HandleFunc("GET /api/logs", h.HandleGetLogs)
	mux.HandleFunc("GET /api/stats", h.HandleGetStats)

	// Serve embedded static files
	staticFS, _ := fs.Sub(web.StaticFS, "static")
	fileServer := http.FileServer(http.FS(staticFS))
	mux.Handle("GET /static/", http.StripPrefix("/static/", fileServer))

	// SPA fallback: serve index.html for root
	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		data, err := web.StaticFS.ReadFile("static/index.html")
		if err != nil {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write(data)
	})

	return &http.Server{
		Addr:         fmt.Sprintf(":%d", port),
		Handler:      cors(mux),
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
	}
}

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
