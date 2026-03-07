FROM golang:1.22-alpine AS builder

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /apm-server ./cmd/server/

FROM alpine:3.19
RUN apk add --no-cache ca-certificates
COPY --from=builder /apm-server /usr/local/bin/apm-server
COPY configs/config.yaml /etc/apm-server/config.yaml

EXPOSE 4317 4318 8080
VOLUME ["/data"]

ENTRYPOINT ["apm-server"]
CMD ["--config", "/etc/apm-server/config.yaml"]
