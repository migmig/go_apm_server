package exporter

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/migmig/go_apm_server/internal/config"
)

type DLQManager struct {
	cfg          config.DLQConfig
	endpointName string
	mu           sync.Mutex
}

func NewDLQManager(endpointName string, cfg config.DLQConfig) *DLQManager {
	if cfg.Path == "" {
		cfg.Path = "data/dlq"
	}
	return &DLQManager{
		endpointName: endpointName,
		cfg:          cfg,
	}
}

func (d *DLQManager) Save(signalType string, data []byte) error {
	if !d.cfg.Enabled {
		return nil
	}

	d.mu.Lock()
	defer d.mu.Unlock()

	dir := filepath.Join(d.cfg.Path, d.endpointName, signalType)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("mkdir dlq: %w", err)
	}

	filename := fmt.Sprintf("%d_%d.pb", time.Now().UnixNano(), os.Getpid())
	path := filepath.Join(dir, filename)

	// TODO: MaxSizeMB 체크 로직 (FIFO 정리) 필요 시 추가

	return os.WriteFile(path, data, 0644)
}

func (d *DLQManager) ListFiles(signalType string) ([]string, error) {
	dir := filepath.Join(d.cfg.Path, d.endpointName, signalType)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}

	var files []string
	for _, e := range entries {
		if !e.IsDir() && filepath.Ext(e.Name()) == ".pb" {
			files = append(files, filepath.Join(dir, e.Name()))
		}
	}
	return files, nil
}

func (d *DLQManager) Delete(path string) error {
	return os.Remove(path)
}
