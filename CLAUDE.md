# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A clean-architecture REST starter on **Fastify 5** (Zod type provider) with **Prisma 7** (`@prisma/adapter-pg`)
on **PostgreSQL**, **Redis** for cache, sessions and the rate limiter (Bun's native `RedisClient`, plus
ioredis for the rate-limiter store and BullMQ), **BullMQ** for queued mail, optional **ClickHouse**, and **tsyringe**
for service DI, running on **Bun**, optionally clustered with `node:cluster`. Auth is JWT: an access
token (1 day, `JWT_SECRET`) plus a refresh token (7 days, `JWT_REFRESH_SECRET`, rotated by
`/auth/refresh`). The shipped domain is auth (register, verify, login, refresh, forgot/reset
password), the caller's profile (including password change), and settings for users, roles and
permissions under RBAC.

## Commands

Runtime and package manager are **Bun**; use `bun run` / `bunx`, never npm/pnpm/yarn. The `Makefile`
wraps the scripts and is the entry point.

```bash
# Development
make dev                  # API + worker with hot reload (bun run dev)
make dev-server           # API only
make dev-worker           # BullMQ worker only

# Quality
make lint                 # eslint
make lint-fix
make format               # prettier --write .
bun run format:check
make typecheck            # tsc --noEmit
make build                # typecheck + dist/serve.js + dist/worker.js + dist/templates/
make start                # run the bundled API and worker (start-server / start-worker for one)

# Tests
# No test runner is configured. Do not invent `bun test` commands.

# Database (Prisma)
make db-generate          # prisma generate (client into prisma/generated/, git-ignored)
make db-migrate           # prisma migrate deploy
make db-migrate-dev       # prisma migrate dev (create + apply a migration locally)
make db-seed              # permissions + roles (+grants) -> users; idempotent, exits 1 on failure
make fresh                # DESTRUCTIVE: prisma migrate reset --force + db push + seed (refuses NODE_ENV=production)
make reset                # generate + migrate + seed
make db-clickhouse-migrate

# Deployment
make docker-build | docker-up | docker-down | docker-migrate | docker-seed | docker-deploy
```

Seeding creates the 15 `<group> <action>` permissions, the `superuser` and `admin` roles (both granted
the whole catalogue), and `superuser@example.com` / `admin@example.com` with password
`S3crEtP4ssw0rd!`. A second run changes nothing.

The pre-commit hook (`.husky/pre-commit`) runs `bun install`, `format`, `lint:fix`, `prisma validate`,
`prisma format`, `prisma migrate dev`, `prisma generate`, `tsc --noEmit`, `build`. It needs a
reachable `DATABASE_URL`.

## Architecture

| Alias               | Path                      | Purpose                                                                                                                                |
| ------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `@config`           | `src/libs/config`         | `env.config.ts` (envalid, the only `process.env` reader) and derived config objects                                                    |
| `@database`         | `src/libs/database`       | `db` (Prisma + pg pool), `TransactionClient`, `UserStatus`, repository factories and their allow-lists, `RedisClient`                  |
| `@fastify-libs`     | `src/libs/fastify`        | defaults (`StrongPassword`, `defaultSort`, token lifetimes), error classes, guards, DI re-exports                                      |
| `@cache`            | `src/libs/cache`          | `Cache`, `Session` (cached `UserInformation`, invalidation), `forgetSelectOptions`, key builders                                       |
| `@i18n`             | `src/libs/i18n`           | `t()`, catalogues, generated key union                                                                                                 |
| `@types`            | `src/libs/types`          | DTOs, token payloads, `DatatableType`, `FilterField`                                                                                   |
| `@utils`            | `src/libs/utils`          | `ResponseToolkit`, response/query schema builders, `DatatableToolkit`, `Hash`, `StrToolkit`, `DateToolkit`, `logger`, `runWithCluster` |
| `@libs`             | `src/libs`                | deep imports such as `@libs/mail/auth-mail.service`                                                                                    |
| `@modules`          | `src/modules`             | feature modules                                                                                                                        |
| `@bull`             | `src/bull`                | queues, workers, worker entry                                                                                                          |
| `@prisma-generated` | `prisma/generated/client` | the generated Prisma client                                                                                                            |

### Request flow

Route handler (`src/modules/<feature>/index.ts`) -> service (`src/modules/<feature>/service.ts`,
`@injectable()`, resolved with `fastify.di.resolve(...)`) -> repository factory
(`src/libs/database/postgres/repositories/`, `XRepository()` or `XRepository(tx)`). Services open
every transaction (`db.$transaction`) and pass `tx` into the factory; repositories never open one.

`src/app.ts` registers everything **explicitly** (no autoload, so the bundled `dist/` and compiled
binaries work): `@fastify/jwt`, `@fastify/redis`, the Zod compilers, the external plugins (helmet,
cors, i18n, rate limit, swagger), the app plugins (auth, di, error), then each module from the
`routes` array with its prefix.

### The non-obvious bits

- **Repositories are factories**, called per use; `db` is one Prisma client per process.
- **Authorization is per route and default-open.** A protected module adds an `onRequest` hook calling
  `await request.authenticate()`; each route then declares `onRequest: PermissionGuard([...])` or
  `RoleGuard([...])` from `@fastify-libs`. Guards throw, so a refused request never reaches validation
  or the handler. A route with no guard is open to every logged-in user. `superuser` bypasses both.
- **Access vs refresh.** Access tokens carry `type: "access"` and are verified with `JWT_SECRET`;
  refresh tokens carry `type: "refresh"`, are signed with `JWT_REFRESH_SECRET`, and their `jti` is stored
  in Redis per user, so a refresh rotates the pair and a refresh token is never accepted as a bearer.
- **UserInformation is cached** (`user:<id>`, 1 hour) by `Session` (`@cache`), loaded only for live
  `ACTIVE` users. Any write that changes a user's status, roles, permissions, password or deletion
  calls `Session.forgetUsers` / `Session.revokeSessions`; role and permission edits invalidate every
  holder.
- **Repositories return `null`; services throw.** Existence is `NotFoundError` (404), uniqueness is
  `UnprocessableEntityError` (422). Datatable inputs (unknown sort/filter key or value, bad date) are
  `BadRequestError` (400) raised by `DatatableToolkit` inside the repository, before Prisma sees them.
- **Filters are read off the raw URL.** The Zod query schema strips `filter[<key>]`;
  `DatatableToolkit.parseFilter(request)` reads them from `request.url`. Sort and filter allow-lists
  are exported by each repository and reused by the route's query schema.
- **Prisma default names, camelCase everywhere.** Tables are the model names, columns the camelCase
  field names, responses use the same names; `UserStatus` is UPPERCASE in the database and on the wire.
- **Env only through `@config`.** `JWT_SECRET` and `JWT_REFRESH_SECRET` are required with no default,
  at least 32 characters, never a known placeholder, and different; startup rejects anything else.
  `DB_POOL_MAX` / `DB_IDLE_TIMEOUT` / `DB_CONNECTION_TIMEOUT` size the `pg` pool per process;
  `DB_LOG_QUERIES=true` logs each Prisma query (text and duration, never parameters) at `debug`.
- **Select options are cached** (`select_options:permissions` / `select_options:roles`, 1 hour); every
  role or permission create, update or delete calls `forgetSelectOptions()` (`@cache`).
- **Live emails are unique in the database too**: the partial unique index `User_email_live_key`
  (`email WHERE "deletedAt" IS NULL`) lives only in a hand-written migration; the service's
  `findLiveByEmail` check still answers first with a 422.
- **Cluster mode** (`APP_CLUSTER_MODE=true`) forks `APP_CLUSTER_WORKERS` processes (0 = per CPU) for
  the API and, separately, the worker. A crashed child is replaced; a child that fails at startup stops
  the primary with exit 1 instead of looping.
- **Docs are gated** by `ENABLE_API_DOCS` (default `false`): `/docs` and `/docs/openapi.json`.
- **Mail is queued** after the transaction that minted its token commits (`AuthMailService` in
  `libs/mail`); the worker is a separate process (`src/bull/index.ts`). Templates are copied to
  `dist/templates/` by the build.
- **Soft delete** on `User` (`deletedAt`); every user read filters it. Roles and permissions are hard
  deleted and their join rows cascade.
- **Login is enumeration-safe**: password checked first (against a dummy hash for unknown emails),
  one message for unknown email and wrong password; resend-verification and forgot-password always 200.
- **Logs go to stdout and `storage/logs/app.log`** (pino multistream); mail logs never carry the
  recipient address.
- **Request bodies are capped at 100 KB** (`bodyLimit` in `src/app.ts`, 413 above it).

## Conventions

- Prettier: tabs, double quotes, semicolons, trailing commas, width 100. `simple-import-sort` owns
  import order. No `any`, no floating promises, no `console.*` outside entry points and scripts.
- Comments only where the why is non-obvious: one block above the block, no line narration.
- Permission strings are space-separated `<group> <action>` (`"user list"`, `"role edit"`); a guard
  string the seeder does not produce fails closed.
- `PATCH`, never `PUT`; collections are plural kebab-case; no global prefix.
- 422 for uniqueness conflicts; 400 for login and token failures and bad datatable input.
- Every user-facing string is an i18n key in both `en.json` and `id.json`; run `bun run i18n:keys`.
- Rate limit: global, 100/min per `request.ip`, counted in Redis, never keyed on client headers.
- Always in scope: `.claude/rules/contradiction-halt.md` and `.claude/rules/documentation.md`.

## Adding a new feature module

1. Add the model to `prisma/schema.prisma` (Prisma default names, no `@@map`); create a migration
   (`make db-migrate-dev`, or offline with `prisma migrate diff`) and review the SQL.
2. Add `src/libs/database/postgres/repositories/<entity>.repository.ts` (factory `XRepository(tx?)`,
   reads return `null`, exported sort/filter/search allow-lists) and export it from the barrel.
3. Add `src/modules/<feature>/{index,schema,service}.ts`: authenticate hook, a guard on every route,
   Zod schemas, a `response` map listing every status the route can return, an `@injectable()`
   service owning checks and transactions.
4. Register the module in the `routes` array of `src/app.ts` with its prefix.
5. If it needs new permissions, extend `prisma/seed/rbac.seed.ts` in the same change.
6. Add i18n keys to both catalogues, update `.claude/rules/routes.md` and `docs/API_DOCUMENTATION.md`.

## Deeper documentation

- `docs/README.md` - index
- `docs/API_DOCUMENTATION.md` - envelope, auth, route map, list query
- `docs/CONFIGURATION.md` - every env var
- `docs/DEPLOYMENT.md` - build, Docker images, compose, migrations, cluster mode
- `docs/ERROR_HANDLING.md` - error classes and status mapping
- `docs/SECURITY.md` - auth, RBAC, rate limiting, headers
- `docs/PLUGINS.md` - the Fastify plugin stack

## Skills, rules, and commands

- **Skills**: `.claude/skills` is a symlink to `.agents/skills/` (vendored, indexed in
  `.agents/skills/README.md`; `skills-lock.json` is gitignored). `fastify-best-practices` covers
  Fastify, `prisma-client-api` covers Prisma Client.
- **Rules**: `.claude/rules/` (27 files, start at `.claude/rules/README.md`). A rule is more specific
  than this file and wins on conflict.
- **Commands**: `/commit`, `/audit-flow` (read-only sweep writing `docs/audit-findings.md`).
