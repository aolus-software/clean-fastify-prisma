# Rule: Shared code lives in `src/libs/`

If a piece of code is used by **more than one feature module** — or could plausibly be reused — it
does not live inside `src/modules/`. `src/modules/<feature>/` holds that feature's `index.ts`,
`schema.ts` and `service.ts` only ([modules.md](./modules.md)). Repositories sit one layer up because
modules, the worker and the seed reuse them.

## The buckets

| Bucket | Alias | Belongs here |
| --- | --- | --- |
| `libs/cache/` | `@cache` | `Cache` (`get`/`set`/`delete`/`deleteMany`), `Session` (`getUserInformation`, `forgetUsers`, `revokeSessions`), key builders `UserInformationCacheKey`, `RefreshTokenCacheKey`, `UserInformationCacheTtl` |
| `libs/config/` | `@config` | `env.config.ts` (the only `process.env` reader) and `AppConfig`, `JwtConfig`, `DatabaseConfig`, `RedisConfig`, `MailConfig`, `corsConfig`, `clickhouseConfig` |
| `libs/database/` | `@database` | `db` (Prisma client with the `pg` adapter), `TransactionClient`, `Prisma`, `UserStatus`, repository factories and their exported allow-lists, `RedisClient`, ClickHouse client |
| `libs/fastify/default/` | `@fastify-libs` | `StrongPassword`, `paginationLength`, `defaultSort`, token-lifetime functions, upload limits |
| `libs/fastify/error/` | `@fastify-libs` | `HttpError`, `BadRequestError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `UnprocessableEntityError`, `InternalServerError` |
| `libs/fastify/guards/` | `@fastify-libs` | `PermissionGuard`, `RoleGuard` (route-level `onRequest` hooks) |
| `libs/fastify/di/` | `@fastify-libs` | tsyringe re-exports: `container`, `injectable`, `inject`, `singleton`, `scoped` |
| `libs/fastify/plugins/` | *(none — imported by `src/app.ts` only)* | `externals/` (helmet, cors, i18n, rate-limit, swagger) and `app/` (auth, di, error); see [middleware.md](./middleware.md) |
| `libs/i18n/` | `@i18n` | `t`, `translate`, locale store, catalogues, generated key union |
| `libs/mail/` | `@libs/mail/...` | `EmailService`, transport, templates, `AuthMailService` (`auth-mail.service.ts`) |
| `libs/types/` | `@types` | DTOs (`UserInformation`, `UserList`, ...), token payload types, `DatatableType`, `FilterField`, `PaginationResponse` |
| `libs/utils/` | `@utils` | `ResponseToolkit`, response/query schema builders, `UserInformationSchema`, `DatatableToolkit`, `Hash`, `EncryptionToolkit`, `StrToolkit`, `DateToolkit`, `NumberToolkit`, `logger`, `runWithCluster` |
| `modules/` | `@modules` | feature folders ([modules.md](./modules.md)) |
| `bull/` | `@bull` | queues, workers, the worker entry |

`libs/fastify/` is re-exported through the single `@fastify-libs` barrel — except the plugins, which
only `src/app.ts` imports.

## Hard rules

1. **No relative imports across modules.** Something two modules need goes to a `libs/` bucket (as
   `Session` and `AuthMailService` did).
2. **Files in `src/modules/<feature>/` are imported only by siblings** and by `src/app.ts` (the
   default-exported route function).
3. **Import through aliases**, never `../../libs/...`.
4. **Every bucket has an `index.ts` barrel**; a new file is added to it or the alias won't resolve it.

## Decision flow

1. One module only, ever? → that module's folder.
2. Business logic reused across modules, the worker, or a script? → a `libs/` bucket (cache, mail,
   utils), not another module's service.
3. Data access? → a repository factory under `libs/database/postgres/repositories/`, exported from
   the barrel.
4. Cross-cutting (auth, errors, cache, mail, response shaping)? → the matching `libs/` bucket.
5. Nothing fits? Prefer `@utils` or `@fastify-libs/default` over a new bucket; a new bucket means a new
   `tsconfig.json` path, barrel, and rule update.

## Accepted deep imports

`@config/<file>.config` in `src/app.ts`, `@bull/queue/<job>.queue`, `@libs/mail/mail.service`,
`@libs/mail/auth-mail.service`, `@database/redis/redis-client` and
`@database/postgres/repositories` inside `libs/cache/` (avoids a barrel cycle),
`@utils/fastify/datatable` inside repositories (same reason).

## Don't

- Don't deep-import (`@utils/fastify/response`) when the barrel re-exports the symbol and no cycle
  forces it.
- Don't duplicate a helper across modules "for now".
- Don't add a new top-level `src/` folder, and don't recreate the sister repo's `src/routes/` or
  `src/services/`.
