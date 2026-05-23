# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Runtime

This project runs on **Bun**, not Node. Use `bun`/`bunx` for everything (CLI scripts, package installs, running TypeScript directly). The build step still emits a CJS Node bundle for production, but development and tooling go through Bun.

## Common commands

Both `bun run <script>` and the `Makefile` targets work; the Makefile just shells out to bun.

```bash
bun install                  # install deps
bun run dev                  # API + BullMQ worker concurrently (hot reload)
bun run dev:server           # API only
bun run dev:worker           # worker only
bun run build                # tsc + bun build → ./dist (CJS, Node target)
bun run start                # run built API + worker

bun run lint                 # eslint .ts/.js
bun run lint:fix
bun run format               # prettier --write .
bun run typecheck            # tsc --noEmit

bun run db:generate          # prisma generate
bun run db:migrate           # prisma migrate dev
bun run db:migrate:deploy    # prisma migrate deploy (used in pre-commit + CI)
bun run db:push              # prisma db push (dev only)
bun run db:studio
bun run db:reset
bun run db:seed              # runs prisma/seed/index.ts
bun run db:clickhouse:migrate
bun run db:clickhouse:status
```

There is **no test runner configured** — do not invent one. `bun run typecheck` and `bun run lint` are the only correctness checks.

The Husky `pre-commit` hook runs `bun run format && bun run lint:fix && bun run build && bunx --bun prisma migrate deploy`. A pre-commit failure may be a real migration or build problem, not a flaky hook.

## High-level architecture

### Process model

Two processes run side-by-side in both dev and prod:

- **API** — `src/serve.ts` → `createAppInstance()` in `src/app.ts`
- **Worker** — `src/bull/index.ts` — BullMQ consumer for queues defined under `src/bull/queue/`, processed by `src/bull/worker/`

They share the same codebase, DI container, Prisma client, and Redis connection, but are deployed/started independently.

### Plugin load order (matters)

`createAppInstance()` registers plugins in a specific order; the autoloader respects it:

1. **Infrastructure** inline — `fastifyJwt`, `fastifyRedis`, Zod validator/serializer compiler (`fastify-type-provider-zod`).
2. **Externals** — autoloaded from `src/libs/fastify/plugins/externals/` (Helmet, CORS, rate limiting, Swagger).
3. **App plugins** — autoloaded from `src/libs/fastify/plugins/app/` (`auth`, `authorization`, `di`, `error`, `superuser`).
4. **Routes** — autoloaded from `src/modules/`. Each module's `index.ts` registers its routes; the directory name becomes the URL prefix.

When adding cross-cutting behavior, decide whether it belongs in `plugins/externals/` (third-party middleware) or `plugins/app/` (project-specific behavior) — don't put it in a module.

### Module convention (`src/modules/<feature>/`)

A module is a triple:

- `index.ts` — Fastify route handlers. Keep handlers thin: parse, call service, return via `ResponseToolkit`. Each route declares its `body`/`response` Zod schemas inline in the route options.
- `schema.ts` — Zod schemas for request bodies and response shapes.
- `service.ts` — All business logic. Decorated with `@injectable()` from tsyringe and resolved per-request via `fastify.di.resolve(ServiceClass)`.

Existing modules: `auth`, `health`, `profile`, `settings`. Mirror their structure when adding new ones.

### Dependency injection

The DI container is **tsyringe**, re-exported through `src/libs/fastify/di/`. Services are `@injectable()` classes; access them inside route handlers with `fastify.di.resolve(Service)` (the `di` decorator is added by `plugins/app/di.plugin.ts`). `reflect-metadata` is imported in the container module — TS config has `emitDecoratorMetadata` and `experimentalDecorators` enabled.

### Data layer

- **Postgres** via Prisma (`prisma/schema.prisma`, generated client at `prisma/generated/client`, imported as `@prisma-generated`). Access goes through repository factories in `src/libs/database/postgres/repositories/` (e.g. `UserRepository()`, `UserRepository(tx)` for a transaction). The shared client is exported as `db` from `@database`; multi-statement work uses `db.$transaction(async (tx: TransactionClient) => ...)` and the repository factory accepts the `tx`.
- **ClickHouse** via `@clickhouse/client` — separate client, services, and a custom migration runner under `src/libs/database/clickhouse/`.
- **Redis** via `@fastify/redis` (request-scoped) and `ioredis` (libs/cache, BullMQ).

### Errors

Throw typed errors from `src/libs/fastify/error/` (`UnprocessableEntityError`, `UnauthorizedError`, `BadRequestError`, `ConflictError`, `ForbiddenError`, `NotFoundError`, `InternalServerError`, base `HttpError`). The global error plugin (`plugins/app/error.plugin.ts`) maps them to the response envelope. Do not return raw error responses or use `reply.code(...).send({ message })` for known failure cases — throw an error class instead.

### Success responses

Use `ResponseToolkit.success(reply, data, message, status?)` from `@utils` for consistent envelopes. Route `response` schemas should reference the shared `SuccessResponseSchema`, `ValidationErrorResponseSchema`, `UnauthorizedResponseSchema`, `ServerErrorResponseSchema` from the module's `schema.ts` / shared schemas.

### Path aliases (defined in `tsconfig.json`)

Use these instead of deep relative imports. Crossing layer boundaries with `../../..` is a code smell here.

```
@/*               → src/*
@libs/*           → src/libs/*
@cache/*          → src/libs/cache/*
@config/*         → src/libs/config/*
@database/*       → src/libs/database/*
@fastify-libs/*   → src/libs/fastify/*
@utils/*          → src/libs/utils/*
@types/*          → src/libs/types/*
@bull/*           → src/bull/*
@modules/*        → src/modules/*
@prisma-generated → prisma/generated/client
```

Many aliases also resolve barrel-style (e.g. `@database`, `@utils`, `@config`) — prefer the barrel import when pulling several siblings.

## Conventions to follow

- All business logic in `service.ts`; route handlers in `index.ts` stay thin (parse body → call service → respond).
- Validate **every** incoming body/params/query with a Zod schema declared in `schema.ts`. No ad-hoc `if (!body.x)` validation.
- DB access only through repository functions in `src/libs/database/postgres/repositories/`. Services should not import the Prisma client directly except via `db` for `$transaction`.
- Use the path aliases above; do not introduce relative imports that cross layers (module ↔ libs, plugin ↔ module).
- Background work goes through BullMQ — `import { sendEmailQueue } from "@bull/queue/..."` and `queue.add(...)` rather than awaiting long work in the request lifecycle.
- Config is centralized under `@config` (typed via `envalid`). Add new env vars to `.env.example` and the appropriate config file rather than reading `process.env` ad hoc.
