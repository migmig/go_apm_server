# Go APM Server

A lightweight Application Performance Monitoring (APM) server written in Go. It receives trace, metric, and log data from OpenTelemetry (OTel) agents and SDKs, stores the data locally using SQLite, and provides a built-in web UI for visualization.

## Key Features

- **OTLP Endpoints:** Supports OpenTelemetry Protocol (OTLP) via gRPC (`:4317`) and HTTP (`:4318`).
- **High Performance Storage:** Uses CGO-free SQLite with WAL mode, JSON1 extensions, and async batch processing (`Memory Buffer & Batcher`) for high throughput.
- **Time-partitioned Database:** Implements a daily SQLite DB file partitioning strategy for zero-overhead TTL cleanup and anti-fragmentation.
- **Built-in Web UI:** Embedded Vite-based Single Page Application (SPA) dashboard for visualizing traces (waterfall charts), metrics (time-series charts), and logs (searchable streams).
- **Single Binary:** Compiles into a single binary with zero external dependencies, including the embedded frontend.
- **Self-Observability:** Exposes Prometheus metrics via `GET /metrics` for internal monitoring.
- **Lightweight:** Designed to use under 100MB of memory for standard workloads.

## Architecture & Tech Stack

```text
[OTel Agent/SDK] --OTLP gRPC/HTTP--> [Receiver] --> [Processor (Memory Buffer & Batcher)] --> [Storage (Time-partitioned SQLite)]
                                                                                                          |
                                                                         [Web UI] <-- [API Server / Metrics]
```

- **Language:** Go 1.22+
- **OTLP Parsing:** Leverages OpenTelemetry Collector's `go.opentelemetry.io/collector/pdata` for robust and efficient payload parsing.
- **Storage:** SQLite (`modernc.org/sqlite` - CGO-free, WAL mode, daily partitioning)
- **Web UI:** React + Vite SPA, compiled to static assets and bundled via Go `embed`.
- **Routing:** Go 1.22 enhanced HTTP routing

## Project Documents

- [Technical spec](./spec.md)
- [Product requirements](./prd.md)
- [Implementation task history](./tasks.md)
- [UI fix plan](./ui-fix-setting-plan.md)
- [UI fix tasks](./ui-fix-setting-tasks.md)

## Getting Started

### Prerequisites
- Go 1.22 or higher (for building from source)
- Docker (optional, for running via container)

### Build and Run

1. **Build the binary (includes frontend build):**
   ```bash
   make build-server
   ```
   This will generate a binary named `go-apm-server`.

2. **Run the server:**
   ```bash
   make run
   ```
   Or run the binary directly:
   ```bash
   ./go-apm-server --config configs/config.yaml
   ```

3. **Generate sample OTLP data (optional):**
   ```bash
   make sample-data
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

processor:
  batch_size: 1000
  flush_interval: "2s"
  queue_size: 10000
  drop_on_full: true

storage:
  path: "./data/apm.db"
  retention_days: 7
```

> `storage.path` can be either a `.db` file path or a directory path. Internally, this project stores data in daily partition files like `apm-YYYY-MM-DD.db` under the base directory.

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
- `GET /metrics` - Exposes Prometheus-formatted internal server and pipeline metrics

### Main query parameters

- `/api/traces`: `service`, `status`, `start`, `end`, `min_duration`, `limit`, `offset`
- `/api/metrics`: `service`, `name`, `start`, `end`, `limit`
- `/api/logs`: `service`, `trace_id`, `search`, `severity_min`, `start`, `end`, `limit`, `offset`
- `/api/stats`: `since`

## Accessing the Web UI

Once the server is running, access the web UI by navigating to `http://localhost:8080` in your browser.

## UI Improvement Roadmap

The current Web UI has a documented fix plan and execution task list for the next refinement pass.

- `ui-fix-setting-plan.md`: priority, scope, execution phases, and success criteria
- `ui-fix-setting-tasks.md`: implementation checklist grouped by phase

Current UI priorities are:

1. Align navigation and routes, including the `settings` entry. (Completed)
2. Add explicit loading, empty, error, retry, and stale-data states. (Completed)
3. Rebuild the app shell and screen layouts for mobile and narrow widths. (Completed)
4. Improve information hierarchy in traces, logs, and trace detail pages. (Completed)
5. Clean up typography, contrast, status colors, and animation usage. (Completed)

> Note: All Phase 1~4 UI fixes have been completed, including styling cleanup (typography scaling, contrast ratio adjustments, and consistent component states).
