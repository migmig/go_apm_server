package storage

import (
	"context"
	"log"
	"time"
)

func StartRetentionWorker(ctx context.Context, store Storage, retentionDays int) {
	if retentionDays <= 0 {
		return
	}

	ticker := time.NewTicker(1 * time.Hour)
	go func() {
		defer ticker.Stop()

		// Run once at startup
		runRetention(ctx, store, retentionDays)

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				runRetention(ctx, store, retentionDays)
			}
		}
	}()
}

func runRetention(ctx context.Context, store Storage, retentionDays int) {
	deleted, err := store.DeleteOldPartitions(ctx, retentionDays)
	if err != nil {
		log.Printf("retention cleanup error: %v", err)
		return
	}
	if deleted > 0 {
		log.Printf("retention cleanup: deleted %d records older than %d days", deleted, retentionDays)
	}
}

func StartExemplarRetentionWorker(ctx context.Context, store Storage, retentionDays int) {
	if retentionDays <= 0 {
		return
	}

	ticker := time.NewTicker(1 * time.Hour)
	go func() {
		defer ticker.Stop()

		runExemplarRetention(ctx, store, retentionDays)

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				runExemplarRetention(ctx, store, retentionDays)
			}
		}
	}()
}

func runExemplarRetention(ctx context.Context, store Storage, retentionDays int) {
	deleted, err := store.CleanupExemplars(ctx, retentionDays)
	if err != nil {
		log.Printf("exemplar retention cleanup error: %v", err)
		return
	}
	if deleted > 0 {
		log.Printf("exemplar retention cleanup: deleted %d records older than %d days", deleted, retentionDays)
	}
}
