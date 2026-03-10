package api

import (
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"strings"
	"time"

	"github.com/migmig/go_apm_server/internal/config"
	"github.com/migmig/go_apm_server/internal/storage"
	"github.com/migmig/go_apm_server/web"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

func NewServer(port int, store storage.Storage, cfg *config.Config) *http.Server {
	h := NewHandler(store, cfg)

	mux := http.NewServeMux()
	mux.Handle("GET /metrics", promhttp.Handler())
	mux.HandleFunc("GET /health", h.HandleHealth)
	mux.HandleFunc("GET /api/config", h.HandleGetConfig)
	mux.HandleFunc("GET /api/system", h.HandleGetSystem)
	mux.HandleFunc("GET /api/partitions", h.HandleGetPartitions)
	mux.HandleFunc("GET /api/services", h.HandleGetServices)
	mux.HandleFunc("GET /api/services/{serviceName}", h.HandleGetServiceDetail)
	mux.HandleFunc("GET /api/traces", h.HandleGetTraces)
	mux.HandleFunc("GET /api/traces/{traceId}", h.HandleGetTraceDetail)
	mux.HandleFunc("GET /api/metrics", h.HandleGetMetrics)
	mux.HandleFunc("GET /api/logs", h.HandleGetLogs)
	mux.HandleFunc("GET /api/stats", h.HandleGetStats)

	// Serve embedded static files from "dist"
	staticFS, err := fs.Sub(web.StaticFS, "dist")
	if err != nil {
		fmt.Printf("warning: embedded static files not found: %v\n", err)
	}
	fileServer := http.FileServer(http.FS(staticFS))

	// Catch-all handler for SPA
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// If the file exists in staticFS, serve it
		path := strings.TrimPrefix(r.URL.Path, "/")
		if path == "" {
			path = "index.html"
		}

		f, err := staticFS.Open(path)
		if err == nil {
			f.Close()
			fileServer.ServeHTTP(w, r)
			return
		}

		// Otherwise serve index.html (SPA routing)
		index, err := staticFS.Open("index.html")
		if err != nil {
			http.Error(w, "frontend not built", http.StatusNotFound)
			return
		}
		defer index.Close()

		stat, err := index.Stat()
		if err != nil {
			http.Error(w, "index info error", http.StatusInternalServerError)
			return
		}

		http.ServeContent(w, r, "index.html", stat.ModTime(), index.(io.ReadSeeker))
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
