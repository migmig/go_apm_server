# Go APM Server

A lightweight Application Performance Monitoring (APM) server written in Go. It receives trace, metric, and log data from OpenTelemetry (OTel) agents and SDKs, stores the data locally using SQLite, and provides a built-in web UI for visualization.

## Key Features

- **OTLP Endpoints:** Supports OpenTelemetry Protocol (OTLP) via gRPC (`:4317`) and HTTP (`:4318`).
- **Local Storage:** Uses CGO-free SQLite for lightweight, reliable local data storage for traces, metrics, and logs.
- **Built-in Web UI:** Embedded Single Page Application (SPA) dashboard for visualizing traces (waterfall charts), metrics (time-series charts), and logs (searchable streams).
- **Single Binary:** Compiles into a single binary with zero external dependencies, including the embedded frontend.
- **Lightweight:** Designed to use under 100MB of memory for standard workloads.
- **Data Retention:** Configurable TTL for automatic data cleanup.

## Architecture & Tech Stack

```text
[OTel Agent/SDK] --OTLP gRPC/HTTP--> [Receiver] --> [Processor] --> [Storage]
                                                                        |
                                                        [Web UI] <-- [API Server]
```

- **Language:** Go 1.22+
- **OTLP Receiver:** OTLP protobuf and JSON support over gRPC (`google.golang.org/grpc`) and HTTP.
- **Storage:** SQLite (`modernc.org/sqlite` - CGO-free)
- **Web UI:** HTML/CSS/Vanilla JS (Go `embed` to include in binary)
- **Routing:** Go 1.22 enhanced HTTP routing

## Getting Started

### Prerequisites
- Go 1.22 or higher (for building from source)
- Docker (optional, for running via container)

### Build and Run

1. **Build the binary:**
   ```bash
   make build
   ```
   This will generate a binary named `apm-server`.

2. **Run the server:**
   ```bash
   make run
   ```
   Or run the binary directly:
   ```bash
   ./apm-server --config configs/config.yaml
   ```

### Using Docker

1. **Build the Docker image:**
   ```bash
   make docker-build
   ```

2. **Run the container:**
   ```bash
   make docker-run
   ```
   This runs the container, exposing ports `4317` (gRPC), `4318` (HTTP), and `8080` (Web UI/API), and mounts a local volume for persistent storage.

## Configuration

The server can be configured via `configs/config.yaml`, environment variables, or CLI flags.

Example `config.yaml`:
```yaml
server:
  api_port: 8080

receiver:
  grpc_port: 4317
  http_port: 4318

storage:
  path: "./data/apm.db"
  retention_days: 7
```

Environment variables can also override these settings, e.g., `APM_SERVER_API_PORT`, `APM_RECEIVER_GRPC_PORT`.

## API Endpoints

The server exposes a REST API on port `8080`:

- `GET /api/services` - List of services
- `GET /api/traces` - Search traces (filters: service, time range, status)
- `GET /api/traces/:traceId` - Trace details (span tree)
- `GET /api/metrics` - Query metrics by name and time range
- `GET /api/logs` - Search logs (filters: service, severity, search term)
- `GET /api/stats` - Summary statistics for the dashboard
- `GET /health` - Health check

## Accessing the Web UI

Once the server is running, access the web UI by navigating to `http://localhost:8080` in your browser.
