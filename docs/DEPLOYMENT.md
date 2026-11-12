# Deployment

The service runs as **two processes** from the same code: the API (`src/serve.ts`, bundled to
`dist/serve.js`) and the BullMQ worker (`src/bull/index.ts`, bundled to `dist/worker.js`), which sends
mail. Both need PostgreSQL and Redis; ClickHouse is optional. Either can run in cluster mode.

## Build output

`bun run build` type-checks, then bundles with `bun build --target bun`:

| File              | From                       | Run with                          |
| ----------------- | -------------------------- | --------------------------------- |
| `dist/serve.js`   | `src/serve.ts`             | `bun ./dist/serve.js` (`start:server`) |
| `dist/worker.js`  | `src/bull/index.ts`        | `bun ./dist/worker.js` (`start:worker`) |
| `dist/templates/` | `src/libs/mail/templates/` | read by the bundled worker        |

Routes and plugins are registered explicitly in `src/app.ts`, so the bundle carries everything it
serves. The generated Prisma client (`prisma/generated/`) must exist before building: run
`bun run db:generate` first.

## Dockerfile

`Dockerfile` is multi-stage on `oven/bun:1.3-alpine` (Bun >= 1.2 is needed for the native
`RedisClient`). The release image runs the bundle, not the sources.

| Stage         | Contents                                                                                                       | Used by                                   |
| ------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `base`        | Bun image, `WORKDIR /app`                                                                                      | every stage                               |
| `install`     | dev and production `node_modules`, cached on `bun.lock`, installed with `--ignore-scripts` (no Husky)          | the stages below                          |
| `development` | dev deps and the whole tree, `prisma generate`, `CMD bun run dev` (API + worker, hot reload)                   | local container development               |
| `build`       | dev deps, `prisma generate`, `bun run build`                                                                   | `release`                                 |
| `migrator`    | dev deps, `prisma/`, `src/`, `prisma.config.ts`; default command `prisma migrate deploy`                       | `make docker-migrate`, `make docker-seed` |
| `release`     | production deps, `dist/` and `prisma/generated/`, non-root `bun` user, `storage/logs` writable; `bun dist/serve.js` | the `app` and `worker` compose services |

The worker uses the `release` image with the command `dist/worker.js`.

## Compose stack

`docker-compose.yml` defines:

| Service    | Image / build                                    | Notes                                                                                 |
| ---------- | ------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `postgres` | `postgres:18-alpine`                             | database from `POSTGRES_DB` (default `clean_fastify_prisma`), port 5432, logs statements slower than `POSTGRES_SLOW_QUERY_MS` (default 100 ms) |
| `redis`    | `redis:8-alpine`                                 | AOF on, `--requirepass ${REDIS_PASSWORD:-password123}`, port 6379                     |
| `app`      | build target `release`                           | `env_file: .env`, publishes `${APP_PORT:-3000}`, waits for healthy postgres and redis |
| `worker`   | build target `release`, command `dist/worker.js` | `env_file: .env`, waits for healthy redis                                             |

All services share the `app_network` bridge network. Inside it, the app reaches the databases by
service name, so for a compose deployment set in `.env`:

```env
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/clean_fastify_prisma
REDIS_HOST=redis
```

ClickHouse is not part of the compose stack; point `CLICKHOUSE_HOST` at your own instance if you use it.

## Make targets

| Target                | Does                                                                               |
| --------------------- | ---------------------------------------------------------------------------------- |
| `make docker-build`   | `docker compose build` plus the `migrator` image (`clean-fastify-prisma:migrator`) |
| `make docker-up`      | `docker compose up -d --build`                                                     |
| `make docker-down`    | `docker compose down`                                                              |
| `make docker-restart` | restart `app` and `worker`                                                         |
| `make docker-logs`    | follow `app` and `worker` logs                                                     |
| `make docker-ps`      | stack status                                                                       |
| `make docker-migrate` | build the `migrator` image and run `prisma migrate deploy` on the compose network  |
| `make docker-seed`    | build the `migrator` image and run `bun run db:seed` on the compose network        |
| `make docker-deploy`  | `git pull`, `docker compose up -d --build`, then `make docker-migrate`             |

`docker-migrate` and `docker-seed` join `$(DOCKER_NETWORK)`, which defaults to
`<lowercased directory name>_app_network`. If you renamed the checkout directory, pass it:
`make docker-migrate DOCKER_NETWORK=myproject_app_network`.

## First deploy

```bash
cp .env.example .env    # set JWT_SECRET, JWT_REFRESH_SECRET, mail, ENABLE_API_DOCS=false, service hostnames
make docker-up
make docker-migrate
make docker-seed        # optional: creates superuser@example.com and admin@example.com
```

Subsequent deploys: `make docker-deploy`.

## Without Docker

```bash
bun install
bun run db:generate
bun run db:migrate      # prisma migrate deploy
bun run build           # typecheck + dist/serve.js + dist/worker.js + dist/templates/
bun run start           # runs both with concurrently
```

Or run `bun run start:server` and `bun run start:worker` under your own process manager.
`bun run build:binary` and `build:binary:worker` produce standalone `./server` and `./worker`
executables; the worker binary still needs the mail templates next to it.

## Cluster mode

`APP_CLUSTER_MODE=true` makes each entry a `node:cluster` primary that forks `APP_CLUSTER_WORKERS`
children (`0` = one per CPU). Children share the API port. A child that crashes is replaced; a child
that dies in its first 5 seconds stops the whole primary with exit 1, so the container restarts
instead of fork-looping. Size `DB_POOL_MAX` per child. Prefer one process per container plus
horizontal scaling when your orchestrator already does it; cluster mode is for single-host deploys.

## Production checklist

- `NODE_ENV=production`; `ENABLE_API_DOCS` unset or `false`.
- `JWT_SECRET` and `JWT_REFRESH_SECRET` set to two different random values of at least 32
  characters; the `.env.example` placeholders are rejected at startup.
- `ALLOWED_HOST` set to the real front-end origins.
- `REDIS_PASSWORD` set; Redis and PostgreSQL not reachable from the internet.
- TLS terminated in front of the app. If that proxy forwards client addresses, enable Fastify's
  `trustProxy` for it so the rate limiter sees the client IP.
- Seeded accounts removed or their passwords changed.
- Migrations applied (`make docker-migrate`) before the new image serves traffic.
- `make fresh` and `bun run db:drop` run `prisma migrate reset --force`, which drops every table;
  they refuse to run with `NODE_ENV=production`, but never point them at a real database.
- Logs are written by pino to stdout (so `docker compose logs` shows them) and to
  `storage/logs/app.log` inside the container; ship either.
