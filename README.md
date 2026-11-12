# clean-fastify-prisma

A production-ready Fastify application built with clean architecture principles: Bun runtime,
Prisma 7 on PostgreSQL, Redis caching, BullMQ job queues, and optional `node:cluster` scaling.

## Features

- **Fastify 5** with the Zod type provider (request validation and OpenAPI from one schema)
- **Bun** runtime and bundler
- **Prisma 7** with the `pg` driver adapter on PostgreSQL
- **Redis** for the user cache, refresh-token rotation and the shared rate limiter
- **BullMQ** for queued mail, in a separate worker process
- **JWT auth** with access (1 day) and rotating refresh (7 days) tokens
- **RBAC**: `<group> <action>` permissions enforced per route
- **Cluster mode** with `node:cluster` for the API and the worker
- **i18n** (`en`, `id`) for every response message
- **ClickHouse** client (optional)

## Prerequisites

- [Bun](https://bun.sh) >= 1.2 (the native `RedisClient` is required)
- PostgreSQL >= 14
- Redis >= 7
- ClickHouse (optional)

## Getting Started

### Installation

```bash
bun install
cp .env.example .env
```

`.env.example` is copyable as-is for local development except for the two required secrets: their
placeholder values are rejected at startup, so the API and the worker refuse to boot until you
replace them. Generate each with `openssl rand -base64 48` (at least 32 characters, and the two must
differ).

### Database Setup

```bash
docker compose up -d postgres redis   # or point .env at your own instances
make db-generate                      # generate the Prisma client
make db-migrate                       # prisma migrate deploy
make db-seed                          # superuser@example.com / admin@example.com, password S3crEtP4ssw0rd!
```

The seeder is idempotent: a second run changes nothing.

### Development

```bash
make dev          # API + worker with hot reload
make dev-server   # API only
make dev-worker   # worker only
```

The API listens on `APP_PORT` (default 3000).

## Project Structure

```
prisma/
├── schema.prisma          # models (Prisma default names, UPPERCASE UserStatus)
├── migrations/            # SQL migrations
└── seed/                  # idempotent seeders (rbac, users)
src/
├── app.ts                 # Fastify instance; plugins and route modules registered explicitly
├── serve.ts               # API entry (cluster-aware)
├── bull/                  # worker entry, queues, workers
├── modules/               # feature modules: index.ts (routes), schema.ts (Zod), service.ts
│   ├── auth/  health/  profile/  index.ts
│   └── settings/{users,roles,permissions,select-options}/
└── libs/
    ├── cache/             # Cache, Session (cached UserInformation + invalidation)
    ├── config/            # env.config.ts (envalid) and derived config
    ├── database/          # Prisma client, repository factories, Redis, ClickHouse
    ├── fastify/           # defaults, error classes, guards, DI, plugins
    ├── i18n/              # catalogues and t()
    ├── mail/              # EmailService, AuthMailService, templates
    ├── types/             # DTOs and shared types
    └── utils/             # ResponseToolkit, DatatableToolkit, Hash, logger, runWithCluster
```

## Available Commands

Every `make` target wraps a `bun run` script; `make help` lists them all.

### Development and build

```bash
make dev | dev-server | dev-worker
make build          # typecheck + dist/serve.js + dist/worker.js + dist/templates/
make start          # bundled API + worker (start-server / start-worker for one)
```

### Code quality

```bash
make lint | lint-fix | format | typecheck
bun run format:check
```

### Database (Prisma)

```bash
make db-generate      # prisma generate
make db-migrate       # prisma migrate deploy
make db-migrate-dev   # prisma migrate dev (create + apply a migration)
make db-push          # prisma db push (dev only)
make db-pull | db-studio
make db-seed
make db-drop          # prisma migrate reset --force (destructive; refuses NODE_ENV=production)
```

### Database (ClickHouse)

```bash
make db-clickhouse-migrate | db-clickhouse-status
```

### Workflows

```bash
make reset   # generate + migrate + seed
make fresh   # drop + push + seed (destroys data; refuses NODE_ENV=production)
```

### Docker

```bash
make docker-up        # postgres, redis, app, worker
make docker-migrate   # run migrations with the migrator image on the compose network
make docker-seed
make docker-logs | docker-ps | docker-restart | docker-down
make docker-deploy    # git pull + build + up + migrate
```

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Cluster Mode

Set `APP_CLUSTER_MODE=true` to fork `APP_CLUSTER_WORKERS` processes (`0` = one per CPU) for the API
and, separately, for the worker. A crashed child is replaced; a child that fails during startup stops
the primary with exit code 1. Off by default.

## API Documentation

With `ENABLE_API_DOCS=true` (it defaults to `false`):

- Scalar API reference: `http://localhost:3000/docs`
- OpenAPI JSON: `http://localhost:3000/docs/openapi.json`

The contract (envelope, routes, guards, list query parameters, breaking changes) is in
[docs/API_DOCUMENTATION.md](docs/API_DOCUMENTATION.md).

## Routes

| Area                          | Routes                                                                                                                                                   |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| General                       | `GET /`, `GET /health`, `GET /live`                                                                                                                      |
| Auth                          | `POST /auth/login`, `/register`, `/resend-verification`, `/verify-email`, `/forgot-password`, `/reset-password`, `/refresh`                              |
| Profile (authenticated)       | `GET /profile`, `PATCH /profile`, `PATCH /profile/password`                                                                                              |
| Settings (permission-guarded) | `/settings/users`, `/settings/roles`, `/settings/permissions` (list, create, detail, `PATCH` update, delete) plus user `reset-password` and mail actions |
| Select options (superuser)    | `GET /settings/select-options/permissions`, `GET /settings/select-options/roles`                                                                         |

## Authentication

1. Register: `POST /auth/register`, then verify the email: `POST /auth/verify-email`
2. Login: `POST /auth/login` returns `{ user, accessToken, refreshToken }`
3. Send `Authorization: Bearer <accessToken>` (valid 1 day)
4. Refresh: `POST /auth/refresh` with `{ refreshToken }` returns a new pair (refresh tokens last 7 days
   and rotate on every use)

Settings routes are guarded by `<group> <action>` permissions (`user list`, `role edit`, ...); the
`superuser` role bypasses every guard.

## Environment Variables

The full list lives in [docs/CONFIGURATION.md](docs/CONFIGURATION.md) and `.env.example`. The ones
that matter most:

| Variable             | Description                            | Default           |
| -------------------- | -------------------------------------- | ----------------- |
| `JWT_SECRET`         | Signs access tokens                    | required          |
| `JWT_REFRESH_SECRET` | Signs refresh tokens                   | required          |
| `DATABASE_URL`       | PostgreSQL connection string           | local placeholder |
| `APP_PORT`           | Server port                            | 3000              |
| `NODE_ENV`           | `development`, `staging`, `production` | development       |
| `ENABLE_API_DOCS`    | Serve `/docs`                          | false             |
| `APP_CLUSTER_MODE`   | Fork with `node:cluster`               | false             |
| `DB_POOL_MAX`        | `pg` pool size per process             | 10                |
| `DB_LOG_QUERIES`     | Debug-level SQL log (no parameters)    | false             |

## Testing

No test runner is configured yet.

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`) runs lint and the format check, type checking,
`prisma validate` and `prisma migrate deploy` against a throwaway PostgreSQL, and the build.

## Contributing

See [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md).

## License

See [LICENSE](LICENSE) file for details.
