# MizzouDataTool Makefile
# Injects cloud credentials from .env.build via -ldflags at build time.

PKG := MizzouDataTool/backend

# Load .env.build if it exists
ifneq (,$(wildcard .env.build))
  include .env.build
  export
endif

LDFLAGS := -X '$(PKG).defaultAccessKeyID=$(AWS_ACCESS_KEY_ID)' \
           -X '$(PKG).defaultSecretAccessKey=$(AWS_SECRET_ACCESS_KEY)' \
           -X '$(PKG).defaultBucketName=$(or $(AWS_BUCKET_NAME),mizzou-racing-telemetry)' \
           -X '$(PKG).defaultRegion=$(or $(AWS_REGION),us-east-2)'

.PHONY: dev build generate check test clean

dev:
	@if [ -z "$(AWS_ACCESS_KEY_ID)" ] || [ -z "$(AWS_SECRET_ACCESS_KEY)" ]; then \
		echo "ERROR: AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set."; \
		echo "       Create .env.build from .env.build.example, or export them."; \
		exit 1; \
	fi
	wails dev -ldflags "$(LDFLAGS)"

build:
	@if [ -z "$(AWS_ACCESS_KEY_ID)" ] || [ -z "$(AWS_SECRET_ACCESS_KEY)" ]; then \
		echo "ERROR: AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set."; \
		echo "       Create .env.build from .env.build.example, or export them."; \
		exit 1; \
	fi
	wails build -ldflags "$(LDFLAGS)"

generate:
	wails generate module

check:
	go build ./...
	cd frontend && npx tsc --noEmit

test:
	go test ./test/...

clean:
	rm -rf build/bin frontend/dist
