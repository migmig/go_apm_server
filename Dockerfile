# Stage 1: Build the React frontend
# Security: Pin to specific Alpine version for reproducible builds
FROM node:20-alpine3.21 AS frontend-builder
WORKDIR /app/web
COPY web/package*.json ./
# Security: Use 'npm ci' instead of 'npm install' for reproducible, locked installs
RUN npm ci
COPY web/ ./
RUN npm run build

# Stage 2: Build the Go backend
# Security: Pin to specific Alpine version for reproducible builds
FROM golang:1.24-alpine3.21 AS backend-builder
WORKDIR /app
# Install git for any dependencies if needed
RUN apk add --no-cache git
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# Copy the built frontend from Stage 1 to web/dist
COPY --from=frontend-builder /app/web/dist ./web/dist
# Security: -trimpath removes local build paths from binary (prevents path disclosure)
#           -s -w strips debug symbols to reduce attack surface and binary size
RUN CGO_ENABLED=0 GOOS=linux go build \
    -trimpath \
    -ldflags="-s -w" \
    -a -installsuffix cgo \
    -o apm-server ./cmd/server/main.go

# Stage 3: Final minimal image
# Security: Pin to specific Alpine version instead of 'latest'
FROM alpine:3.21
# Security: Add wget for HEALTHCHECK
RUN apk add --no-cache ca-certificates tzdata wget

# Security: Create a dedicated non-root user and group (UID/GID 10001)
#           Running as non-root limits damage if the container is compromised
RUN addgroup -g 10001 -S apmserver && \
    adduser -u 10001 -S apmserver -G apmserver

# Security: Use /app instead of /root/ (avoid using root's home directory)
WORKDIR /app

# Security: Copy binary with apmserver ownership; restrict to execute-only for owner/group
COPY --from=backend-builder --chown=apmserver:apmserver /app/apm-server ./apm-server
RUN chmod 550 ./apm-server

# Security: Copy config with read-only permissions
COPY --chown=apmserver:apmserver configs/config.yaml ./configs/config.yaml
RUN chmod 440 ./configs/config.yaml

# Security: Pre-create data directory with correct ownership for SQLite DB
RUN mkdir -p ./data && chown apmserver:apmserver ./data

# Security: Drop to non-root user for all subsequent commands including CMD
USER apmserver

# Health check using the application's /health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q --spider http://localhost:8080/health || exit 1

# Expose ports
# API: 8080, gRPC: 4317, HTTP OTLP: 4318
EXPOSE 8080 4317 4318

# Run the server
CMD ["./apm-server", "--config", "configs/config.yaml"]
