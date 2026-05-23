# Rule: OpenAPI / Swagger documentation

The API spec is generated at runtime from Fastify route metadata by `swagger.plugin.ts` (`src/libs/fastify/plugins/externals/swagger.plugin.ts`), which combines:

- `@fastify/swagger` — collects schemas
- `fastify-type-provider-zod` (`jsonSchemaTransform`) — converts Zod → JSON Schema
- A renderer (Scalar or the built-in Swagger UI) mounted by the plugin

You **do not** write OpenAPI YAML by hand — every field in the spec comes from how routes are declared.

## Mandatory per-route metadata

Every `fastify.get / .post / .patch / .put / .delete` MUST declare a `schema` object containing:

1. **Validation schemas** — `body`, `query`, `params` as applicable. These are Zod schemas from the module's `./schema.ts` and feed both runtime validation **and** the spec.
2. **`response`** — a map keyed by status code, each pointing at a Zod schema. Include every code the route can legitimately return:
   - `200` for successful GET/PATCH, `201` for POST that creates
   - `400` for `BadRequestError` (malformed input the service catches)
   - `401` if the route uses `request.authenticate` in `preHandler`
   - `403` if `requireRoles` / `requirePermissions` runs
   - `404` if any path param resolves to a row that may not exist (`NotFoundError`)
   - `409` if the service throws `ConflictError`
   - `422` for business-rule violations (`UnprocessableEntityError`) and Zod validation failures
   - `500` so consumers know the shape on unexpected failure
3. **`tags`** — single-element array. Top-level resources → single word (`"Auth"`, `"Profile"`, `"Health"`). Nested resources → `"Group/Subresource"` (`"Settings/Users"`, `"Settings/Roles"`). Reuse the exact same casing across routes so Swagger groups related endpoints.
4. **`description`** — explains the auth/permission requirement and the side effects. `summary` is also accepted (see `modules/health/index.ts`).

Example (from `modules/auth/index.ts`):

```ts
fastify.post(
	"/login",
	{
		schema: {
			tags: ["Auth"],
			description: "User login endpoint.",
			body: LoginBodySchema,
			response: {
				200: LoginResponseSchema,
				401: UnauthorizedResponseSchema,
				422: ValidationErrorResponseSchema,
				500: ServerErrorResponseSchema,
			},
		},
	},
	async (request, reply) => {
		/* ... */
	},
);
```

## Zod schemas — what the spec needs

- Every field in a request/response schema gets `.describe(...)`. The Swagger/Scalar UI renders descriptions next to each property.
- Use Zod's semantic refinements where possible: `z.string().email()`, `z.string().uuid()`, `z.string().datetime()` — they all transform into the right `format` in the resulting JSON Schema.
- Reuse domain constants from `@fastify-libs`: `StrongPassword` (regex), `paginationLength`, `defaultSort`, `verificationTokenLifetime`, etc. Don't redeclare regexes or magic numbers per-module.
- **Wrap response data** with `createSuccessResponseSchema(<DataSchema>)` or `createSuccessPaginationResponseSchema(<DataSchema>)` from `@utils`. `ResponseToolkit.success(...)` always serialises as `{ status, success, message, data }`, so the response schema must wrap accordingly — using the raw `DataSchema` directly will fail Zod serialisation at runtime.
- Use the **pre-built** error schemas from `@utils`: `UnauthorizedResponseSchema`, `ValidationErrorResponseSchema`, `ServerErrorResponseSchema`, and any others exposed by the response-schema module. Never inline error shapes per-route. The pattern is to re-export those from the module's `schema.ts` so `index.ts` imports schemas from a single file:
  ```ts
  // modules/auth/schema.ts
  export { ServerErrorResponseSchema, UnauthorizedResponseSchema, ValidationErrorResponseSchema };
  ```

## Auth and security

`swagger.plugin.ts` registers a `BearerAuth` security scheme (HTTP `bearer`, JWT). To mark a route as requiring auth in the spec, add `security` inside `schema`:

```ts
schema: {
  tags: ["Settings/Users"],
  description: "List users. Requires 'user list' permission.",
  security: [{ BearerAuth: [] }],
  // ...
}
```

Public routes (`/auth/login`, `/auth/register`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/refresh`, `/auth/verify-email`, `/auth/resend-verification`, `/health`) omit `security` entirely. Don't set it globally — keep it explicit per protected route so the spec matches actual `preHandler` wiring.

## Runtime behaviour

- The plugin runs as part of the **externals** autoload bucket (`src/libs/fastify/plugins/externals/`). Don't move it — the load order in `src/app.ts` is externals (helmet, cors, rate-limit, swagger) → app plugins (auth, authorization, di, error, superuser) → modules. Reordering breaks request shaping.
- Swagger is enabled for every environment by default. If you add an "off in production" toggle, do it inside `swagger.plugin.ts` (gate `app.register` on `AppConfig.NODE_ENV !== "production"`), not by deleting the plugin file.
- The spec is in-memory — no `openapi.json` is checked in. Don't add one.

## Don't

- Don't hand-edit any `openapi.json` — none exists; the spec is regenerated on every boot.
- Don't add `tags` per-route as an arbitrary string. Reuse the same casing across routes so Swagger groups related endpoints (e.g. always `"Settings/Users"`, never `"settings/users"` in one place and `"Settings/Users"` in another).
- Don't omit response codes that the route can actually return — the spec lies to consumers if you do.
- Don't pass a non-Zod schema (Ajv JSON Schema object, TypeBox, etc.) to a route's `schema.*`. The validator and serializer compilers are wired exclusively to Zod via `fastify-type-provider-zod` in `src/app.ts`.
- Don't return `ResponseToolkit.success(data)` while declaring `response: { 200: RawDataSchema }`. Always wrap with `createSuccessResponseSchema(RawDataSchema)`. Mismatched response shape will trip Zod serialisation and surface as a 500.
- Don't bypass `ResponseToolkit` and `reply.send({ ...adhoc })` to "match" a one-off schema. Reshape the schema, not the envelope.
