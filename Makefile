# Makefile for Go APM Server

BINARY_NAME=go-apm-server
DOCKER_IMAGE=go-apm-server:latest

.PHONY: all build-web build-server run clean docker-build help

# Default target
all: build-server

# Stage 1: Build the frontend (React + Vite)
build-web:
	@echo "Building frontend..."
	cd web && npm install && npm run build

# Stage 2: Build the Go server (embeds frontend)
# This depends on build-web to ensure web/dist exists for go:embed
build-server: build-web
	@echo "Building Go server..."
	CGO_ENABLED=0 go build -o $(BINARY_NAME) ./cmd/server/main.go

# Run the server locally
run: build-server
	@echo "Running server..."
	./$(BINARY_NAME) --config configs/config.yaml

# Clean up build artifacts
clean:
	@echo "Cleaning up..."
	rm -f $(BINARY_NAME)
	rm -rf web/dist

# Build the Docker image (Multi-stage)
docker-build:
	@echo "Building Docker image..."
	docker build -t $(DOCKER_IMAGE) .

# Run the Docker container
docker-run:
	@echo "Running Docker container..."
	docker run -p 8080:8080 -p 4317:4317 -p 4318:4318 $(DOCKER_IMAGE)

help:
	@echo "Usage:"
	@echo "  make build-web     - Build only the frontend"
	@echo "  make build-server  - Build both frontend and Go server"
	@echo "  make run           - Build and run the server locally"
	@echo "  make docker-build  - Build the multi-stage Docker image"
	@echo "  make clean         - Remove build artifacts"
