package main

import (
	"context"
	"flag"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"github.com/migmig/go_apm_server/internal/api"
	"github.com/migmig/go_apm_server/internal/config"
	"github.com/migmig/go_apm_server/internal/processor"
	"github.com/migmig/go_apm_server/internal/receiver"
	"github.com/migmig/go_apm_server/internal/storage"
)

func main() {
	configPath := flag.String("config", "", "path to config file")
	flag.Parse()

	cfg, err := config.Load(*configPath)
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	store, err := storage.NewSQLite(ctx, cfg.Storage.Path)
	if err != nil {
		log.Fatalf("failed to init storage: %v", err)
	}
	defer store.Close()

	proc := processor.New(store)

	// Start OTLP gRPC receiver
	grpcRecv := receiver.NewGRPC(cfg.Receiver.GRPCPort, proc)
	go func() {
		if err := grpcRecv.Start(); err != nil {
			log.Fatalf("gRPC receiver error: %v", err)
		}
	}()

	// Start OTLP HTTP receiver
	httpRecv := receiver.NewHTTP(cfg.Receiver.HTTPPort, proc)
	go func() {
		if err := httpRecv.Start(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("HTTP receiver error: %v", err)
		}
	}()

	log.Printf("APM Server started (API: :%d, gRPC: :%d, HTTP: :%d)",
		cfg.Server.APIPort, cfg.Receiver.GRPCPort, cfg.Receiver.HTTPPort)

	// Start retention worker
	storage.StartRetentionWorker(ctx, store, cfg.Storage.RetentionDays)

	// Start API server
	apiServer := api.NewServer(cfg.Server.APIPort, store)
	go func() {
		log.Printf("API server listening on :%d", cfg.Server.APIPort)
		if err := apiServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("API server error: %v", err)
		}
	}()

	<-ctx.Done()
	log.Println("shutting down...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	grpcRecv.Stop()
	if err := apiServer.Shutdown(shutdownCtx); err != nil {
		log.Printf("API server shutdown error: %v", err)
	}
	if err := httpRecv.Stop(shutdownCtx); err != nil {
		log.Printf("HTTP receiver shutdown error: %v", err)
	}
}
