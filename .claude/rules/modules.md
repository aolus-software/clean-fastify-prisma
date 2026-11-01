# Rule: Feature modules (`src/modules/<feature>/`)

This repo **co-locates** a feature's routes, schemas and service in one folder:

```
src/modules/<feature>/
├── index.ts     # default-exported (fastify) => { ... } registering routes
├── schema.ts    # Zod request/response schemas
└── service.ts   # @injectable() class holding the business logic
```

Repositories live one layer up because modules, the worker and the seed reuse them
([repositories.md](./repositories.md)). Logic needed by more than one module goes to a `libs/` bucket
(`Session` in `@cache`, `AuthMailService` in `libs/mail/`), never to another module's service
([shared-code.md](./shared-code.md)).

Current modules: `index.ts` (root `/` and `/live`), `health`, `auth`, `profile`,
`settings/users`, `settings/roles`, `settings/permissions`, `settings/select-options`.

## Registration is explicit

A module is wired by adding it to the `routes` array in `src/app.ts`:

```ts
import roleRoutes from "./modules/settings/roles";

const routes = [
	// ...
	{ plugin: roleRoutes, prefix: "/settings/roles" },
];
```

The prefix is written out, not derived from the folder name. Keep the folder path and the prefix the
same so the tree reads like the URL map. A module missing from `routes` serves nothing.

## `index.ts`

See [handlers.md](./handlers.md) and [handlers-crud.md](./handlers-crud.md): type provider once,
the module-level `authenticate` hook for protected modules, one `onRequest` guard per route, a full
`schema`, one service call, `ResponseToolkit.success`.

## `schema.ts`

See [validation.md](./validation.md). Import the shared envelope and error schemas from `@utils`
directly; list-query schemas are built from the repository's exported allow-lists.

## `service.ts`

```ts
@injectable()
export class RoleService {
	async findAll(query: DatatableType): Promise<PaginationResponse<RoleList>> {
		return await RoleRepository().findAll(query);
	}
}
```

- `@injectable()` class with an **empty constructor**; repositories are called inline through their
  factory, `RoleRepository()` or `RoleRepository(tx)` ([di.md](./di.md)).
- Resolved per request with `fastify.di.resolve(RoleService)`.
- Imported only by its own module's `index.ts`. There is no services barrel and no `@services` alias.

## Adding a module

1. Create `src/modules/<feature>/{index,schema,service}.ts`.
2. Add it to `routes` in `src/app.ts` with its prefix.
3. Seed any new permission ([rbac.md](./rbac.md)), add i18n keys in `en` and `id`.
4. Add the routes to [routes.md](./routes.md) and `docs/API_DOCUMENTATION.md`.
