package main

import (
	"context"
	"flag"
	"log"
	"net/http"
	"os"
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
	cfgPath := flag.String("config", "", "path to config file")
	flag.Parse()

	cfg, err := config.Load(*cfgPath)
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	store, err := storage.NewSQLite(ctx, cfg.Storage.Path)
	if err != nil {
		log.Fatalf("failed to init storage: %v", err)
	}
	defer store.Close()

	proc := processor.New(store)

	grpcReceiver := receiver.NewGRPC(cfg.Receiver.GRPCPort, proc)
	go func() {
		if err := grpcReceiver.Start(); err != nil {
			log.Printf("grpc receiver error: %v", err)
		}
	}()

	httpReceiver := receiver.NewHTTP(cfg.Receiver.HTTPPort, proc)
	go func() {
		if err := httpReceiver.Start(); err != nil {
			log.Printf("http receiver error: %v", err)
		}
	}()

	apiServer := api.NewServer(cfg.Server.APIPort, store)
	go func() {
		log.Printf("API server listening on :%d", cfg.Server.APIPort)
		if err := apiServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("api server error: %v", err)
		}
	}()

	storage.StartRetentionWorker(ctx, store, cfg.Storage.RetentionDays)

	<-ctx.Done()
	log.Println("shutting down...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	grpcReceiver.Stop()
	if err := httpReceiver.Stop(shutdownCtx); err != nil {
		log.Printf("http receiver shutdown error: %v", err)
	}
	if err := apiServer.Shutdown(shutdownCtx); err != nil {
		log.Printf("api server shutdown error: %v", err)
	}

	log.Println("server stopped")
}
