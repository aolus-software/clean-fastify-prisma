# Configuration

Every environment variable is validated once, at startup, by envalid in
`src/libs/config/env.config.ts`. Nothing else reads `process.env`; the rest of the code reads the
derived config objects exported from `@config` (`AppConfig`, `JwtConfig`, `DatabaseConfig`,
`RedisConfig`, `MailConfig`, `corsConfig`, `clickhouseConfig`). A missing required variable or an
invalid value stops the process with an envalid report.

Bun loads `.env` automatically. Start from `.env.example`:

```bash
cp .env.example .env
```

## Rules for `.env`

- Keep values **unquoted**: `docker run --env-file` passes quotes literally.
- Don't write `VAR=` for a variable whose validator rejects an empty string (`host`, `url`, `port`,
  required `str`). envalid treats `VAR=` as provided-but-empty, which defeats the default and fails
  validation. Delete the line instead. `ALLOWED_HOST=` and `REDIS_PASSWORD=` are the only variables
  where an empty value is meaningful.
- Never commit `.env`.

## Reference

### Application

| Variable          | Validator                                  | Default                 | Required | Purpose                                                                                                                                |
| ----------------- | ------------------------------------------ | ----------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`        | `development` \| `staging` \| `production` | `development`           | no       | Exposed as `AppConfig.APP_ENV`. Outside `production`, mail subjects are prefixed `[<ENV>]` and `make fresh` is allowed                 |
| `APP_NAME`        | str                                        | `Fastify Prisma App`    | no       | Shown by `GET /` and the OpenAPI title                                                                                                 |
| `APP_PORT`        | port                                       | `3000`                  | no       | Listen port; the server binds `0.0.0.0`                                                                                                |
| `APP_URL`         | url                                        | `http://localhost:3000` | no       | Public base URL of the API                                                                                                             |
| `APP_TIMEZONE`    | str                                        | `UTC`                   | no       | Timezone for `DateToolkit`, the date filters and log timestamps                                                                        |
| `APP_KEY`         | str                                        | `your-app-key`          | no       | Key for `EncryptionToolkit` (AES). Set a real value if you use it                                                                      |
| `LOG_LEVEL`       | `info` \| `warn` \| `debug`                | `info`                  | no       | Level of the API server logger (`app.ts`), which writes to stdout and `storage/logs/app.log`                                           |
| `ENABLE_API_DOCS` | bool                                       | `false`                 | no       | Serves `/docs` and `/docs/openapi.json`. The only docs switch, independent of `NODE_ENV`. `true` in `.env.example` for local work only |
| `CLIENT_URL`      | url                                        | `http://localhost:3000` | no       | Front-end base URL for mail links (`/auth/verify-email?token=`, `/auth/reset-password?token=`)                                         |

### JWT

| Variable             | Validator | Default | Required | Purpose                                    |
| -------------------- | --------- | ------- | -------- | ------------------------------------------ |
| `JWT_SECRET`         | str       | none    | **yes**  | Signs and verifies access tokens (1 day)   |
| `JWT_REFRESH_SECRET` | str       | none    | **yes**  | Signs and verifies refresh tokens (7 days) |

Use two different random values (`openssl rand -base64 48`). Startup fails when either secret is
missing, shorter than 32 characters, one of the known placeholders (including the two shipped in
`.env.example`), or when both are the same value (the `jwtSecret` validator in
`src/libs/config/env.config.ts`). `.env.example` keeps its placeholders on purpose, so a copied file
cannot boot with a secret that is published in this repository. The lifetimes are fixed in `src/libs/config/jwt.config.ts`; there is no expiry variable.

### Database (PostgreSQL)

| Variable                | Validator | Default                                                            | Purpose                                                                    |
| ----------------------- | --------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `DATABASE_URL`          | str       | `postgresql://postgres:postgres@localhost:5432/clean_fastify_prisma` | Connection string for the app, the seeder, and the Prisma CLI (`prisma.config.ts`) |
| `DB_POOL_MAX`           | num       | `10`                                                               | `pg` pool maximum behind the Prisma adapter, **per process**               |
| `DB_IDLE_TIMEOUT`       | num       | `30000`                                                            | Idle client timeout, ms                                                    |
| `DB_CONNECTION_TIMEOUT` | num       | `5000`                                                             | Connection timeout, ms                                                     |

The three pool variables are passed to `PrismaPg` in `src/libs/database/postgres/client.ts`. In
cluster mode every child opens its own pool, so the server can see up to
`DB_POOL_MAX × workers` connections for the API plus the same again for the worker. The Prisma CLI
reads `DATABASE_URL` from the environment through `prisma.config.ts` and fails without it.

`.env.example` also carries `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`. The app does not
read them; `docker-compose.yml` uses them to provision the `postgres` container, so keep them in sync
with `DATABASE_URL` (default database `clean_fastify_prisma`).

### Cluster mode

| Variable              | Validator | Default | Purpose                                                                                      |
| --------------------- | --------- | ------- | -------------------------------------------------------------------------------------------- |
| `APP_CLUSTER_MODE`    | bool      | `false` | Fork the API (and, separately, the worker) with `node:cluster`                              |
| `APP_CLUSTER_WORKERS` | num       | `0`     | Children per process when cluster mode is on; `0` means one per CPU (`availableParallelism`) |

With cluster mode off (the default) each entry runs as one process. A child that crashes after
startup is replaced; a child that dies within its first 5 seconds is treated as a startup failure,
and the primary stops the others and exits 1 instead of forking forever.

### Redis

| Variable         | Validator | Default     | Purpose                                                                                     |
| ---------------- | --------- | ----------- | ------------------------------------------------------------------------------------------- |
| `REDIS_HOST`     | host      | `localhost` | Cache, refresh-token ids, rate limiter, BullMQ                                              |
| `REDIS_PORT`     | port      | `6379`      |                                                                                             |
| `REDIS_PASSWORD` | str       | `""`        | Empty means no auth. `docker-compose.yml` starts Redis with `password123` unless overridden |
| `REDIS_DB`       | num       | `0`         | Database index                                                                              |

### Mail (SMTP)

| Variable      | Validator         | Default                            | Purpose                                     |
| ------------- | ----------------- | ---------------------------------- | ------------------------------------------- |
| `MAIL_HOST`   | host              | `smtp.example.com`                 | SMTP host                                   |
| `MAIL_PORT`   | port              | `587`                              | SMTP port                                   |
| `MAIL_SECURE` | `true` \| `false` | `false`                            | TLS from connect (use `true` with port 465) |
| `MAIL_FROM`   | str               | `Fastify Prisma <noreply@example.com>` | From header                             |
| `MAIL_USER`   | str               | `your_email@example.com`           | SMTP user                                   |
| `MAIL_PASS`   | str               | `your_email_password`              | SMTP password                               |

Only the worker process sends mail; the API enqueues jobs.

### CORS

| Variable       | Validator | Default | Purpose                                                                                                          |
| -------------- | --------- | ------- | ---------------------------------------------------------------------------------------------------------------- |
| `ALLOWED_HOST` | str       | `""`    | Comma-separated allowed origins (`https://app.example.com,https://admin.example.com`). Empty allows every origin |

Methods are fixed to `GET, POST, PATCH, DELETE`; allowed headers to `Content-Type`, `Authorization`,
`Accept-Language`; credentials off; preflight cache 86400 s (`src/libs/config/cors.config.ts`).

### ClickHouse (optional)

| Variable              | Validator | Default                 | Purpose            |
| --------------------- | --------- | ----------------------- | ------------------ |
| `CLICKHOUSE_HOST`     | url       | `http://localhost:8123` | Analytics database |
| `CLICKHOUSE_USER`     | str       | `default`               |                    |
| `CLICKHOUSE_PASSWORD` | str       | `""`                    |                    |
| `CLICKHOUSE_DATABASE` | str       | `default`               |                    |

The API does not need ClickHouse to boot or to pass `/health`.

## Not configurable

- Rate limit: 100 requests per minute per client IP, in `rate-limiting.plugin.ts`. There is no
  rate-limit variable.
- User-information cache TTL: 3600 s (`src/libs/cache/const.ts`).
- Verification and reset token lifetimes: 1 hour (`src/libs/fastify/default/token-lifetime.ts`).
- Request body limit: 100 KB (`bodyLimit` in `src/app.ts`); larger bodies get 413.
