# Rule: Shared code lives in `src/libs/`

If a piece of code is used by **more than one feature module** — or could plausibly be reused — it does **not** live inside `src/modules/`. It lives in `src/libs/<bucket>/`, behind one of the dedicated path aliases.

`src/modules/<feature>/` is for code that is **specific to that one feature**: the route handler (`index.ts`), its Zod schemas (`schema.ts`), and its `@injectable()` service (`service.ts`). The moment a helper, plugin, error class, type, or repository is referenced from a second place, move it under `libs/`.

> Note: services are **co-located** in this repo. There is no `src/services/` directory and no `@services` alias. A service belongs to exactly one module — if its logic is genuinely cross-module, extract the shared pieces into a `libs/` bucket (a utility, a repository, a cache helper) rather than promoting the service.

## The buckets (and what belongs in each)

| Bucket                           | Alias               | Belongs here                                                                                                                                                |
| -------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `libs/cache/`                    | `@cache`            | Cache wrapper helpers and cache-key builders (`UserInformationCacheKey`, …)                                                                                 |
| `libs/config/`                   | `@config`           | Env-derived config objects (`AppConfig`, `DatabaseConfig`, `RedisConfig`, `MailConfig`, `CorsConfig`, `ClickHouseConfig`) — typed via `envalid`              |
| `libs/database/`                 | `@database`         | `db` (Prisma client), `TransactionClient`, repository factories, `RedisClient`, ClickHouse client                                                           |
| `libs/fastify/default/`          | `@fastify-libs`     | Stable cross-feature constants (`StrongPassword`, `paginationLength`, `defaultSort`, `verificationTokenLifetime`, `maxUploadFile`, `allowedFileUploads`)    |
| `libs/fastify/error/`            | `@fastify-libs`     | Custom HTTP error classes (`HttpError`, `BadRequestError`, `UnprocessableEntityError`, `NotFoundError`, `UnauthorizedError`, `ForbiddenError`, `ConflictError`, `InternalServerError`) |
| `libs/fastify/di/`               | `@fastify-libs`     | tsyringe re-exports: `container`, `injectable`, `inject`, `singleton`, `scoped`                                                                             |
| `libs/fastify/plugins/`          | `@fastify-libs`     | Reusable Fastify plugins (`app/`: auth, authorization, di, error, superuser; `externals/`: helmet, cors, rate-limit, swagger)                               |
| `libs/mail/`                     | `@libs/mail/...`    | Mail transport, templates, and `EmailService` (currently imported via deep path `@libs/mail/mail.service`)                                                  |
| `libs/types/`                    | `@types`            | Shared TypeScript types (DTOs, query-param types, enums-as-types, queue payload shapes, `UserInformation`)                                                  |
| `libs/utils/`                    | `@utils`            | Pure helpers (`Hash`, `Encrypt`, `logger`, `ResponseToolkit`, `DatatableToolkit`, `DateToolkit`, `StrToolkit`, `NumToolkit`, response-schema builders)        |
| `modules/`                       | `@modules`          | Feature folders — co-located `index.ts`, `schema.ts`, `service.ts`                                                                                          |
| `bull/`                          | `@bull`             | BullMQ queues, workers, and the worker entry                                                                                                                |

Everything in `libs/fastify/` is re-exported through the single `@fastify-libs` barrel — don't deep-import from `@fastify-libs/error/...` when `@fastify-libs` already re-exports the symbol.

The full alias list is in `tsconfig.json`. Authoritative additions/changes go there.

## Hard rules

1. **No relative imports across feature modules.** A file in `src/modules/auth/` may not `import "../profile/..."`. If two modules need the same thing, lift it (to `@database`, `@utils`, `@cache`, or `@fastify-libs`).
2. **No module-internal helpers leaking out.** Files in `src/modules/<feature>/` may only be imported by sibling files in the same folder. The exception is the default-exported route function — `@fastify/autoload` consumes that automatically.
3. **Always import through aliases**, never via relative path: `import { UserRepository } from "@database"`, not `import { UserRepository } from "../../libs/database/postgres/repositories/user.repository"`. Aliases are defined in `tsconfig.json` `paths`.
4. **Every `libs/<bucket>/` folder has an `index.ts` barrel** that re-exports its public surface. New files **must** be added to the barrel — otherwise the alias won't resolve them and consumers will fall back to deep imports.

## Decision flow when adding a new file

1. Will exactly **one** module use it, ever? → put it in that module's folder (`src/modules/<name>/`).
2. Is it business logic for one feature, possibly invoked from the worker too? → it's that module's service. `src/modules/<feature>/service.ts`, `@injectable()`, resolved via `fastify.di.resolve(...)` in routes or `container.resolve(...)` in the worker.
3. Is it data access? → repository factory under `src/libs/database/postgres/repositories/`, re-exported from `@database`. See [`repositories.md`](./repositories.md).
4. Is it a cross-cutting concern (auth, logging, errors, cache, mail, response shaping, validation primitives)? → put it in the appropriate `libs/<bucket>/` and re-export from that bucket's `index.ts`.
5. Doesn't fit any existing bucket but is genuinely shared? → think twice before adding a new bucket. A new bucket means a new `tsconfig.json` path entry, a new barrel, and a new mental category. Prefer fitting it into `@utils` or `@fastify-libs/default` unless it's a clear new infrastructure client (a second message broker, an object store, etc.).

## Within `@utils`

`@utils` is the catch-all for **pure** helpers. Anything stateful or I/O-bound belongs elsewhere:

- Cache → `@cache`
- Database / Redis client → `@database`
- Plugin / middleware → `@fastify-libs/plugins`
- Mail → `@libs/mail/mail.service`

Current sub-structure (all re-exported from `src/libs/utils/index.ts` — import via `@utils`, never deep):

```
libs/utils/
├── date.ts                       # DateToolkit
├── number.ts                     # NumToolkit
├── string.ts                     # StrToolkit
├── security/
│   ├── hash.ts                   # Hash (bcrypt wrapper)
│   └── encrypt.ts                # Encrypt/Decrypt (crypto-js wrapper)
└── fastify/
    ├── datatable.ts              # DatatableToolkit
    ├── logger.ts                 # pino `logger` + createLoggerConfig
    ├── response.ts               # ResponseToolkit
    └── response-schema.ts        # createSuccessResponseSchema, *Pagination*, error schemas
```

When adding a new util, find the closest existing file (`date.ts`, `string.ts`, …) before creating a new one. If you create a new file, add it to `libs/utils/index.ts`.

## Examples — where to put it

- A regex for validating Indonesian phone numbers, used by user + profile schemas → `libs/fastify/default/phone.ts`, re-exported from `@fastify-libs`.
- A function that turns a UUID into a short slug, used in 3 modules → extend `libs/utils/string.ts` (or new file, then add to `utils/index.ts`).
- A Fastify plugin that adds an `X-Request-ID` header → `libs/fastify/plugins/app/request-id.plugin.ts` (autoload picks it up).
- A "users with active subscription" Prisma query → extend `user.repository.ts` (don't create a new repo per query — see [`repositories.md`](./repositories.md)).
- A queue payload type used by the worker + a service → co-locate with the producing service (e.g. `EmailOptions` lives in `libs/mail/mail.service.ts`) or promote to `libs/types/` and re-export from `@types`.
- A constant for "max allowed login attempts" used by the auth plugin and the auth service → `libs/fastify/default/login-attempts.ts`.

## Don't

- Don't `import` from another module via relative path. If you're typing `../<other-module>/...`, stop — the thing belongs in a `libs/` bucket or in that module's own service.
- Don't duplicate a helper across modules "for now". Lift it on the first reuse, not the third.
- Don't import directly from a bucket's nested file (`@utils/fastify/response`) when the barrel re-exports it — always import from the bucket root (`@utils`). The only deep imports currently in use are intentional (e.g. `@libs/mail/mail.service`, `@bull/queue/<name>.queue`) because those barrels deliberately don't re-export the symbol.
- Don't add a new top-level `src/` folder for shared code. The choices are `src/libs/<bucket>/`, `src/modules/<feature>/`, or `src/bull/` — that's it. In particular, don't recreate `src/services/` or `src/routes/` — those are the sister-repo's pattern, not this one.
