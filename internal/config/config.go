package config

import (
	"os"
	"strconv"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Server    ServerConfig    `yaml:"server"    json:"server"`
	Receiver  ReceiverConfig  `yaml:"receiver"  json:"receiver"`
	Processor ProcessorConfig `yaml:"processor" json:"processor"`
	Storage   StorageConfig   `yaml:"storage"   json:"storage"`
	Exemplar  ExemplarConfig  `yaml:"exemplar"  json:"exemplar"`
}

type ServerConfig struct {
	APIPort int `yaml:"api_port" json:"api_port"`
}

type ReceiverConfig struct {
	GRPCPort    int    `yaml:"grpc_port" json:"grpc_port"`
	HTTPPort    int    `yaml:"http_port" json:"http_port"`
	TLSEnabled  bool   `yaml:"tls_enabled" json:"tls_enabled"`
	TLSCertPath string `yaml:"tls_cert_path" json:"tls_cert_path"`
	TLSKeyPath  string `yaml:"tls_key_path" json:"tls_key_path"`
	MaxBodySize int    `yaml:"max_body_size" json:"max_body_size"` // in MB
}

type ProcessorConfig struct {
	BatchSize     int    `yaml:"batch_size"     json:"batch_size"`
	FlushInterval string `yaml:"flush_interval" json:"flush_interval"`
	QueueSize     int    `yaml:"queue_size"     json:"queue_size"`
	DropOnFull    bool   `yaml:"drop_on_full"   json:"drop_on_full"`
}

type StorageConfig struct {
	Path          string `yaml:"path"           json:"path"`
	RetentionDays int    `yaml:"retention_days" json:"retention_days"`
}

type ExemplarConfig struct {
	RetentionDays int `yaml:"retention_days" json:"retention_days"`
	MaxPerMetric  int `yaml:"max_per_metric" json:"max_per_metric"`
}

func defaults() Config {
	return Config{
		Server:   ServerConfig{APIPort: 8080},
		Receiver: ReceiverConfig{GRPCPort: 4317, HTTPPort: 4318, TLSEnabled: false, MaxBodySize: 10},
		Processor: ProcessorConfig{
			BatchSize:     1000,
			FlushInterval: "2s",
			QueueSize:     10000,
			DropOnFull:    true,
		},
		Storage:  StorageConfig{Path: "./data/apm.db", RetentionDays: 7},
		Exemplar: ExemplarConfig{RetentionDays: 7, MaxPerMetric: 100},
	}
}

func Load(path string) (*Config, error) {
	cfg := defaults()

	if path != "" {
		data, err := os.ReadFile(path)
		if err != nil {
			return nil, err
		}
		if err := yaml.Unmarshal(data, &cfg); err != nil {
			return nil, err
		}
	}

	applyEnv(&cfg)
	return &cfg, nil
}

func applyEnv(cfg *Config) {
	if v := os.Getenv("APM_SERVER_API_PORT"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			cfg.Server.APIPort = n
		}
	}
	if v := os.Getenv("APM_RECEIVER_GRPC_PORT"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			cfg.Receiver.GRPCPort = n
		}
	}
	if v := os.Getenv("APM_RECEIVER_HTTP_PORT"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			cfg.Receiver.HTTPPort = n
		}
	}
	if v := os.Getenv("APM_RECEIVER_TLS_ENABLED"); v != "" {
		if b, err := strconv.ParseBool(v); err == nil {
			cfg.Receiver.TLSEnabled = b
		}
	}
	if v := os.Getenv("APM_RECEIVER_TLS_CERT_PATH"); v != "" {
		cfg.Receiver.TLSCertPath = v
	}
	if v := os.Getenv("APM_RECEIVER_TLS_KEY_PATH"); v != "" {
		cfg.Receiver.TLSKeyPath = v
	}
	if v := os.Getenv("APM_RECEIVER_MAX_BODY_SIZE"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			cfg.Receiver.MaxBodySize = n
		}
	}
	if v := os.Getenv("APM_PROCESSOR_BATCH_SIZE"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			cfg.Processor.BatchSize = n
		}
	}
	if v := os.Getenv("APM_PROCESSOR_FLUSH_INTERVAL"); v != "" {
		cfg.Processor.FlushInterval = v
	}
	if v := os.Getenv("APM_PROCESSOR_QUEUE_SIZE"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			cfg.Processor.QueueSize = n
		}
	}
	if v := os.Getenv("APM_PROCESSOR_DROP_ON_FULL"); v != "" {
		if b, err := strconv.ParseBool(v); err == nil {
			cfg.Processor.DropOnFull = b
		}
	}
	if v := os.Getenv("APM_STORAGE_PATH"); v != "" {
		cfg.Storage.Path = v
	}
	if v := os.Getenv("APM_STORAGE_RETENTION_DAYS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			cfg.Storage.RetentionDays = n
		}
	}
}
