# Rule: Fastify app structure and layering

The framework-level contract: what each layer may do, how the app is assembled, and what already
exists. Per-file detail is in [modules.md](./modules.md), [handlers.md](./handlers.md),
[services.md](./services.md) and [repositories.md](./repositories.md).

## Layering

```
route handler (src/modules/<feature>/index.ts)
  -> service (src/modules/<feature>/service.ts)
  -> repository factory (src/libs/database/postgres/repositories/) -> Prisma -> PostgreSQL
```

- **Handler**: HTTP only — read the validated `request`, call **one** service method, wrap the result
  in `ResponseToolkit`. Authentication is the module hook; authorization is the route's `onRequest`
  guard ([rbac.md](./rbac.md)).
- **Service**: business rules, existence/uniqueness checks, transactions, cache invalidation, mail
  queueing. The only layer that opens a transaction (`db.$transaction`).
- **Repository**: Prisma queries through `XRepository(tx?)`, returns `null` on a miss, never opens a
  transaction.

**Never skip a layer.** The one deliberate exception is `GET /health`, which runs
``db.$queryRaw`SELECT 1` `` and `RedisClient.getRedisClient().ping()` as probes.

## Bootstrap (`src/app.ts`, entry `src/serve.ts`)

Plugins and routes are registered **explicitly**, not autoloaded, so the same app runs from source,
from the `dist/` bundle and from a compiled binary. `createAppInstance()` registers, in this order:

1. `@fastify/jwt` (secret `JwtConfig.ACCESS_SECRET`) and `@fastify/redis` (ioredis, used only by the
   rate limiter's Redis store; application code uses Bun's native `RedisClient` through `@cache` /
   `@database`).
2. The Zod `validatorCompiler` / `serializerCompiler` from `fastify-type-provider-zod`.
3. External plugins — helmet, cors, i18n, rate-limit, swagger ([middleware.md](./middleware.md)).
4. App plugins — auth (`request.authenticate`), di (`fastify.di`), error (error and not-found
   handlers).
5. Route modules from the `routes` array, each with its URL prefix ([routes.md](./routes.md)).

`src/serve.ts` imports `reflect-metadata` first and listens on `0.0.0.0:APP_PORT`. The worker is a
separate process, `src/bull/index.ts` ([queue.md](./queue.md)).

## Cluster mode (`src/libs/utils/cluster.ts`)

Both entries run through `runWithCluster({ name, enabled: AppConfig.APP_CLUSTER_MODE, workers:
AppConfig.APP_CLUSTER_WORKERS }, run)`. Off by default (one process). When `APP_CLUSTER_MODE=true`
the primary forks `APP_CLUSTER_WORKERS` children (`0` = one per CPU) via `node:cluster`; a child
that crashes after its first 5 seconds is replaced, a child that dies during startup is not — the
primary stops the rest and exits 1, so a bad env or a taken port does not become a fork loop. Every
child holds its own Prisma pool (`DB_POOL_MAX` per process). Keep per-request state out of module
scope, and keep shared state (rate-limit counters, cache, refresh `jti`) in Redis.

## Config

Read configuration only through `@config`. `src/libs/config/env.config.ts` validates every variable
once with envalid; the config objects (`AppConfig`, `JwtConfig`, `DatabaseConfig`, `RedisConfig`,
`MailConfig`, `corsConfig`, `clickhouseConfig`) derive from it. **Never touch `process.env` outside
`src/libs/config/`** (`prisma.config.ts` is the tooling exception). `JWT_SECRET` and
`JWT_REFRESH_SECRET` are required with no default, at least 32 characters, never a known placeholder
(the `jwtSecret` validator in `env.config.ts`), and must differ; token lifetimes (1d / 7d) live in
`JwtConfig`.

`fastify({ loggerInstance, bodyLimit })` comes first: the pino logger from `createLogger` (`@utils`)
writes to stdout and `storage/logs/app.log`, and request bodies are capped at 100 KB (413 above it).

## Reuse before you build

| Alias | Already there |
| --- | --- |
| `@utils` | `ResponseToolkit`, `createSuccessResponseSchema`, `createSuccessPaginationResponseSchema`, `NullSuccessResponseSchema`, `NullCreatedResponseSchema`, `buildDatatableQueryParamsSchema`, the error response schemas, `UserInformationSchema`, `DatatableToolkit`, `Hash`, `StrToolkit`, `DateToolkit`, `logger`, `runWithCluster` |
| `@fastify-libs` | `PermissionGuard`, `RoleGuard`, the error classes, `StrongPassword`, `paginationLength`, `defaultSort`, token-lifetime functions, `injectable`, `container` |
| `@cache` | `Cache`, `Session` (cached `UserInformation`, `forgetUsers`, `revokeSessions`), `UserInformationCacheKey`, `RefreshTokenCacheKey` |
| `@libs/mail/auth-mail.service` | `AuthMailService` (single-use tokens + auth mail) |
| `@database` | `db`, `TransactionClient`, `UserStatus`, `Prisma`, repository factories and their allow-lists, `RedisClient` |
| `@types` | `DatatableType`, `FilterField`, `PaginationResponse`, token payload types, per-entity DTOs |

## Don't

- Don't register a global concern from a module — it belongs in a plugin.
- Don't send a reply from a hook or guard to refuse a request — throw ([middleware.md](./middleware.md)).
- Don't reintroduce `@fastify/autoload`: it reads directories at runtime and finds nothing inside the
  bundled `dist/serve.js`.
- Don't restructure into the sister repo's `src/routes` + `src/services` split; modules co-locate.
