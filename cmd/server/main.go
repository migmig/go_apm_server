package main

import (
	"context"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/migmig/go_apm_server/internal/api"
	"github.com/migmig/go_apm_server/internal/config"
	"github.com/migmig/go_apm_server/internal/processor"
	"github.com/migmig/go_apm_server/internal/receiver"
	"github.com/migmig/go_apm_server/internal/storage"
)

func main() {
	configPath := flag.String("config", "configs/config.yaml", "Path to configuration file")
	flag.Parse()

	cfg, err := config.Load(*configPath)
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	store, err := storage.NewSQLite(ctx, cfg.Storage.Path)
	if err != nil {
		log.Fatalf("failed to init storage: %v", err)
	}

	proc := processor.New(cfg.Processor, store)
	proc.Start(ctx)

	// Start Retention Workers
	storage.StartRetentionWorker(ctx, store, cfg.Storage.RetentionDays)
	storage.StartExemplarRetentionWorker(ctx, store, cfg.Exemplar.RetentionDays)

	grpcReceiver := receiver.NewGRPCReceiver(cfg.Receiver, proc)
	if err := grpcReceiver.Start(ctx, cfg.Receiver.GRPCPort); err != nil {
		log.Fatalf("failed to start grpc receiver: %v", err)
	}
	log.Printf("gRPC Receiver started on :%d\n", cfg.Receiver.GRPCPort)

	httpReceiver := receiver.NewHTTPReceiver(cfg.Receiver, proc)
	if err := httpReceiver.Start(ctx, cfg.Receiver.HTTPPort); err != nil {
		log.Fatalf("failed to start http receiver: %v", err)
	}
	log.Printf("HTTP Receiver started on :%d\n", cfg.Receiver.HTTPPort)

	hub := api.NewHub(store)
	go hub.Run(ctx)

	proc.SetOnFlush(func(event processor.FlushEvent) {
		hub.BroadcastFlush(ctx, event.Spans, event.Logs)
	})

	apiServer := api.NewServer(cfg.Server.APIPort, store, cfg, hub)
	go func() {
		if err := apiServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("api server error: %v", err)
		}
	}()
	log.Printf("API Server started on :%d\n", cfg.Server.APIPort)

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, os.Interrupt, syscall.SIGTERM)
	<-sigCh

	log.Println("Shutting down gracefully...")

	// 1. API 및 OTLP Receiver(HTTP/gRPC) 리스너 닫기
	apiServer.Shutdown(context.Background())
	httpReceiver.Stop(context.Background())
	grpcReceiver.Stop()

	// 2. Processor에 쌓여 있는 남은 메모리 버퍼 데이터를 DB로 Flush
	proc.Stop()

	// 3. Storage(SQLite) 커넥션 안전하게 닫기
	store.Close()

	log.Println("Server stopped.")
}
