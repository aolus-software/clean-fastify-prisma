.PHONY: help install dev dev-server dev-worker build start start-server start-worker lint lint-fix format typecheck db-generate db-migrate db-push db-pull db-studio db-reset db-seed fresh reset

help:
	@echo "Available commands:"
	@echo ""
	@echo "  Setup:"
	@echo "    install             - Install dependencies"
	@echo ""
	@echo "  Development:"
	@echo "    dev                 - Start server and worker with hot reload"
	@echo "    dev-server          - Start API server only with hot reload"
	@echo "    dev-worker          - Start worker only with hot reload"
	@echo ""
	@echo "  Build:"
	@echo "    build               - Build the application"
	@echo ""
	@echo "  Production:"
	@echo "    start               - Start server and worker"
	@echo "    start-server        - Start API server only"
	@echo "    start-worker        - Start worker only"
	@echo ""
	@echo "  Code Quality:"
	@echo "    lint                - Run ESLint"
	@echo "    lint-fix            - Fix ESLint issues"
	@echo "    format              - Format code with Prettier"
	@echo "    typecheck           - Run TypeScript type checking"
	@echo ""
	@echo "  Database (Prisma):"
	@echo "    db-generate         - Generate Prisma client"
	@echo "    db-migrate          - Run pending migrations"
	@echo "    db-push             - Push schema to database (dev only)"
	@echo "    db-pull             - Pull schema from database"
	@echo "    db-studio           - Open Prisma Studio"
	@echo "    db-reset            - Reset database"
	@echo "    db-seed             - Seed database with initial data"
	@echo ""
	@echo "  Workflows:"
	@echo "    fresh               - Reset, push schema, and seed (dev only)"
	@echo "    reset               - Generate, migrate, and seed"

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

lint:
	bun run lint

lint-fix:
	bun run lint:fix

format:
	bun run format

typecheck:
	bun run typecheck

db-generate:
	bun run db:generate

db-migrate:
	bun run db:migrate

db-push:
	bun run db:push

db-pull:
	bun run db:pull

db-studio:
	bun run db:studio

db-reset:
	bun run db:reset

db-seed:
	bun run db:seed

fresh: db-reset db-push db-seed
	@echo "Database refreshed and seeded!"

reset: db-generate db-migrate db-seed
	@echo "Database migrated and seeded!"
