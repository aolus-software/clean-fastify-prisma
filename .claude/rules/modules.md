# Rule: Feature modules (`src/modules/<feature>/`)

Unlike split-layer patterns (clean-fastify with separate `src/routes/` and `src/services/`), this repo **co-locates** a feature's routes, schemas, and service in one folder:

```
src/modules/<feature>/
├── index.ts     # default-exported (fastify) => { ... } registering routes
├── schema.ts    # Zod request/response schemas
└── service.ts   # @injectable() class containing business logic
```

Repositories live one layer up because they are reused across modules and across the worker process:

```
src/libs/database/postgres/repositories/
└── <entity>.repository.ts     # factory function — see repositories.md
```

Routes are picked up automatically by `@fastify/autoload` (configured in `src/app.ts`); the **folder name is the URL prefix**. You do not `.register(...)` modules anywhere — just create the folder.

Current modules: `auth`, `health`, `profile`, `settings` — mirror their layout when adding a new one.

---

## `modules/<feature>/index.ts` — the routes layer

- Export a `default function (fastify: FastifyInstance) { ... }`. `@fastify/autoload` invokes it and binds the folder name as the prefix.
- Apply the Zod type provider at the top of the function when the module uses Zod schemas (`fastify.withTypeProvider<ZodTypeProvider>()`), mirroring `health/index.ts`.
- Resolve services via the DI container: `const authService = fastify.di.resolve(AuthService)`. Never `new AuthService(...)` — see [`di.md`](./di.md).
- Wrap **every** successful response through `ResponseToolkit.success(reply, data, message, statusCode)` from `@utils`. Don't hand-craft `{ status, success, data }` payloads or call `reply.send(...)` with a raw object.
- Throw `BadRequestError` / `UnprocessableEntityError` / `NotFoundError` / `UnauthorizedError` / `ForbiddenError` / `ConflictError` / `InternalServerError` from `@fastify-libs`. The `error.plugin.ts` handler translates them into the standard error envelope — never `reply.status(4xx).send(...)` directly for known failure cases.
- Protect routes by adding a `preHandler`:
  ```ts
  fastify.get(
    "/",
    {
      schema: { ... },
      preHandler: async (request, reply) => {
        await request.authenticate(reply);
        request.requirePermissions(["user list"], reply);
      },
    },
    async (request, reply) => { ... },
  );
  ```
  `request.authenticate` must run first — it verifies the JWT and hydrates `request.userInformation` from Redis or DB. `requireRoles([...])` and `requirePermissions([...])` come from the authorization plugin and short-circuit with 401/403 when the user fails the check. Users with role `superuser` bypass all role/permission checks.
- Every route **must** declare `schema.body` / `schema.query` / `schema.params` where applicable and a `schema.response` map keyed by status code. Include every code the route can legitimately return (`200`/`201`, `401` when authenticated, `403` when guarded, `404` for `:id` routes, `422` for business-rule failures, `500`). Reference shared schemas (`ValidationErrorResponseSchema`, `UnauthorizedResponseSchema`, `ServerErrorResponseSchema`) from `@utils` via the module's `schema.ts` re-export — never inline error shapes.
- Every route needs `schema.tags` (single string array — `["Auth"]`, `["Settings/Users"]`) and `schema.description`. These flow into the OpenAPI spec rendered by `swagger.plugin.ts`.
- Group routes inside the file with comment banners matching the existing style in `auth/index.ts`:
  ```ts
  // POST: /auth/login
  ```
  No per-handler JSDoc — Swagger reads `schema.description`.
- Nested groups (e.g. `settings/user/`, `settings/role/`) follow the same layout under `src/modules/settings/<sub>/`. The parent `src/modules/settings/index.ts` only registers the group prefix — no inline routes.

## `modules/<feature>/schema.ts` — Zod schemas

- Pure Zod. The app's type provider is `fastify-type-provider-zod`; schemas are validated at runtime **and** transformed into OpenAPI by `jsonSchemaTransform`.
- Every field gets `.describe(...)`. Where the field has a finite domain, add `.default(...)` (and `.examples(...)` for Swagger).
- Reuse cross-feature constants from `@fastify-libs`: password regex (`StrongPassword`), pagination defaults (`paginationLength`, `defaultSort`), token lifetimes (`verificationTokenLifetime`), upload limits (`maxUploadFile`, `allowedFileUploads`).
- For response bodies, wrap data with `createSuccessResponseSchema(<DataSchema>)` or `createSuccessPaginationResponseSchema(<DataSchema>)` from `@utils`. `ResponseToolkit.success(...)` always serialises as `{ status, success, message, data }`, so the response schema must wrap accordingly — using a raw `DataSchema` directly will fail Zod serialisation.
- Re-export common error schemas (`UnauthorizedResponseSchema`, `ValidationErrorResponseSchema`, `ServerErrorResponseSchema`) at the bottom of `schema.ts` so `index.ts` imports both request schemas and error schemas from one place — see `modules/auth/schema.ts` for the pattern.
- Naming: `<Entity>BodySchema`, `<Entity>QuerySchema`, `<Entity>ParamsSchema`, `<Action>ResponseSchema`.

## `modules/<feature>/service.ts` — business logic

- Export an `@injectable()` **class** (not a plain object) — DI requires the class:

  ```ts
  import { injectable, UnprocessableEntityError } from "@fastify-libs";
  import { UserRepository, db, type TransactionClient } from "@database";

  @injectable()
  export class FooService {
  	async doThing(payload: FooPayload) {
  		const user = await UserRepository().findByEmail(payload.email);
  		if (!user) {
  			throw new UnprocessableEntityError("Validation error", [
  				{ field: "email", message: "User not found" },
  			]);
  		}
  		// ...
  	}
  }
  ```

- Constructors are usually **empty**. Call repository factories inline (`UserRepository()`, `RoleRepository()`) rather than injecting them via the constructor. See [`repositories.md`](./repositories.md) for why.
- Services own orchestration: state-dependent validation, transactions, cache invalidation, queue dispatch. They call repository methods through the factory: `UserRepository().findByEmail(...)`, `UserRepository(tx).create(...)`.
- Wrap multi-step mutations in `db.$transaction(async (tx: TransactionClient) => { ... })` and pass `tx` down by calling `UserRepository(tx).create(...)`. Anything that writes to ≥2 tables needs a transaction.
- Throw `UnprocessableEntityError` (with the `field/message` validation list) for business-rule failures. `NotFoundError` for missing entities. `BadRequestError` for malformed-but-not-validation-layer input. `ConflictError` for unique-key collisions surfaced as user-visible conflicts.
- Cache invalidation: when mutating user data, drop `UserInformationCacheKey(userId)` from Redis (or refresh it) so the auth plugin sees the new value on the next request. Cache keys come from `@cache`.
- Log with structured `logger` from `@utils` — `logger.info({ userId }, "User logged in")`. Never `console.*` (ESLint warns).
- Dispatch background jobs by importing the queue from `@bull/queue/...` and calling `await queue.add("job-name", payload)`. Producers live in services, never in route handlers directly. See [`queue.md`](./queue.md).
- There is **no central services barrel** — each module's `service.ts` is imported directly from its module path. Do not add a `src/services/index.ts` or an `@services` alias; that's the sister-repo's convention, not this one.
