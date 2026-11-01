.PHONY: help install dev dev-server dev-worker build start start-server start-worker lint lint-fix format typecheck db-generate db-migrate db-migrate-dev db-push db-pull db-studio db-drop db-seed db-clickhouse-migrate db-clickhouse-status fresh reset docker-build docker-up docker-down docker-restart docker-logs docker-ps docker-migrate docker-seed docker-deploy

# Docker compose derives its project name from the directory name (lowercased);
# the app network is "<project>_app_network". Override if you renamed the dir:
#   make docker-migrate DOCKER_NETWORK=myproject_app_network
DOCKER_NETWORK ?= $(shell basename "$(CURDIR)" | tr '[:upper:]' '[:lower:]')_app_network
MIGRATOR_IMAGE ?= clean-fastify-prisma:migrator

# Default target
help:
	@echo "Available commands:"
	@echo ""
	@echo "  Setup:"
	@echo "    install               - Install dependencies"
	@echo ""
	@echo "  Development:"
	@echo "    dev                   - Run API and worker with hot reload"
	@echo "    dev-server            - Run the API only with hot reload"
	@echo "    dev-worker            - Run the queue worker only with hot reload"
	@echo ""
	@echo "  Build:"
	@echo "    build                 - Typecheck and bundle to dist/ (serve.js, worker.js, templates/)"
	@echo ""
	@echo "  Production:"
	@echo "    start                 - Start the bundled API and worker"
	@echo "    start-server          - Start the bundled API only (dist/serve.js)"
	@echo "    start-worker          - Start the bundled worker only (dist/worker.js)"
	@echo ""
	@echo "  Code Quality:"
	@echo "    lint                  - Run ESLint"
	@echo "    lint-fix              - Fix ESLint issues"
	@echo "    format                - Format code with Prettier"
	@echo "    typecheck             - Run TypeScript type checking"
	@echo ""
	@echo "  Database (PostgreSQL/Prisma):"
	@echo "    db-generate           - Generate the Prisma client"
	@echo "    db-migrate            - Apply pending migrations (prisma migrate deploy)"
	@echo "    db-migrate-dev        - Create and apply a migration (prisma migrate dev)"
	@echo "    db-push               - Push schema to database (dev only)"
	@echo "    db-pull               - Introspect database into the schema"
	@echo "    db-studio             - Open Prisma Studio"
	@echo "    db-drop               - Reset the database (dangerous; refuses NODE_ENV=production)"
	@echo "    db-seed               - Seed database with initial data (idempotent)"
	@echo ""
	@echo "  Database (ClickHouse):"
	@echo "    db-clickhouse-migrate - Run ClickHouse migrations"
	@echo "    db-clickhouse-status  - Check ClickHouse migration status"
	@echo ""
	@echo "  Docker:"
	@echo "    docker-build          - Build all compose images (app + migrator)"
	@echo "    docker-up             - Start the full stack (build if needed)"
	@echo "    docker-down           - Stop the stack"
	@echo "    docker-restart        - Restart the app and worker containers"
	@echo "    docker-logs           - Tail app and worker logs"
	@echo "    docker-ps             - Show stack status"
	@echo "    docker-migrate        - Run DB migrations against the compose network"
	@echo "    docker-seed           - Seed the database inside the compose network"
	@echo "    docker-deploy         - git pull + build + up + migrate (server deploy)"
	@echo ""
	@echo "  Workflows:"
	@echo "    fresh                 - Drop, push schema, and seed (destructive; refuses NODE_ENV=production)"
	@echo "    reset                 - Generate, migrate, and seed"

install:
	bun install

dev:
	bun run dev

dev-server:
	bun run dev:server

dev-worker:
	bun run dev:worker

build:
	bun run build

start:
	bun run start

start-server:
	bun run start:server

start-worker:
	bun run start:worker

# Code quality
lint:
	bun run lint

lint-fix:
	bun run lint:fix

format:
	bun run format

typecheck:
	bun run typecheck

# Database (PostgreSQL/Prisma)
db-generate:
	bunx --bun prisma generate

db-migrate:
	bunx --bun prisma migrate deploy

db-migrate-dev:
	bunx --bun prisma migrate dev
	bunx --bun prisma generate

db-push:
	bunx --bun prisma db push

db-pull:
	bunx --bun prisma db pull

db-studio:
	bunx --bun prisma studio

db-drop:
	bun run db:drop
	@echo "Database reset! Use 'make db-push' or 'make db-migrate' to recreate the schema."

db-seed:
	bun run db:seed

# Database (ClickHouse)
db-clickhouse-migrate:
	bun run db:clickhouse:migrate

db-clickhouse-status:
	bun run db:clickhouse:status

# Docker
docker-build:
	docker compose build
	docker build --target migrator -t $(MIGRATOR_IMAGE) .

docker-up:
	docker compose up -d --build

docker-down:
	docker compose down

docker-restart:
	docker compose restart app worker

docker-logs:
	docker compose logs -f app worker

docker-ps:
	docker compose ps

docker-migrate:
	docker build --target migrator -t $(MIGRATOR_IMAGE) .
	docker run --rm --network $(DOCKER_NETWORK) --env-file .env $(MIGRATOR_IMAGE)

docker-seed:
	docker build --target migrator -t $(MIGRATOR_IMAGE) .
	docker run --rm --network $(DOCKER_NETWORK) --env-file .env $(MIGRATOR_IMAGE) bun run db:seed

# Full server deploy: pull latest, rebuild, roll the stack, migrate
docker-deploy:
	git pull
	docker compose up -d --build
	$(MAKE) docker-migrate
	@echo "Deployed!"

# Combined workflows
fresh: db-drop db-push db-seed
	@echo "Database refreshed and seeded!"

reset: db-generate db-migrate db-seed
	@echo "Database migrated and seeded!"
