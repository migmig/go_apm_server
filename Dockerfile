# Stage 1: Build the React frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/web
COPY web/package*.json ./
RUN npm install
COPY web/ ./
RUN npm run build

# Stage 2: Build the Go backend
FROM golang:1.24-alpine AS backend-builder
WORKDIR /app
# Install git for any dependencies if needed
RUN apk add --no-cache git
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# Copy the built frontend from Stage 1 to web/dist
COPY --from=frontend-builder /app/web/dist ./web/dist
# Build the binary with CGO_ENABLED=0 for a static binary
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o apm-server ./cmd/server/main.go

# Stage 3: Final minimal image
FROM alpine:latest
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /root/
COPY --from=backend-builder /app/apm-server .
COPY configs/config.yaml ./configs/config.yaml

# Expose ports
# API: 8080, gRPC: 4317, HTTP OTLP: 4318
EXPOSE 8080 4317 4318

# Run the server
CMD ["./apm-server", "--config", "configs/config.yaml"]
