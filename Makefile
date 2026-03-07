.PHONY: build run clean docker-build docker-run

BINARY=apm-server
IMAGE=go-apm-server

build:
	go build -ldflags="-s -w" -o $(BINARY) ./cmd/server/

run: build
	./$(BINARY) --config configs/config.yaml

clean:
	rm -f $(BINARY)
	rm -rf data/

docker-build:
	docker build -t $(IMAGE) .

docker-run: docker-build
	docker run --rm -p 4317:4317 -p 4318:4318 -p 8080:8080 -v apm-data:/data $(IMAGE)
