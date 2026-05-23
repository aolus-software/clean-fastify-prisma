# Rule: Repositories (`src/libs/database/postgres/repositories/*.repository.ts`)

Repositories are the **only** layer that talks to Prisma directly. Services consume them via the factory; route handlers never `import { db }` for queries.

## Shape — factory function over Prisma

A repository in this repo is a **factory function** that returns an object of query methods, closing over a Prisma client (or a transaction). It is **not** a class and **not** `@injectable()`:

```ts
import type { Prisma } from "@prisma-generated";

import { db } from "../client";

type TransactionClient = Prisma.TransactionClient;

export function UserRepository(tx?: TransactionClient) {
	const dbClient = tx ?? db;

	return {
		async findByEmail(email: string): Promise<UserForAuth | null> {
			const user = await dbClient.user.findFirst({
				where: { email, deleted_at: null },
				select: { /* ... */ },
			});
			if (!user) return null;
			return user;
		},

		async create(data: UserCreate): Promise<string> {
			const created = await dbClient.user.create({ data, select: { id: true } });
			return created.id;
		},
	};
}
```

Call sites always invoke the factory:

```ts
// non-transactional
await UserRepository().findByEmail(email);

// inside a transaction — pass tx into the factory
await db.$transaction(async (tx: TransactionClient) => {
	const userId = await UserRepository(tx).create({ ... });
	await EmailVerificationRepository(tx).create(userId, token, lifetime);
});
```

The factory pattern is deliberate: `tx ?? db` lives in **one** place per repository, and every method automatically picks up the right client without the caller threading `tx` through individual method arguments.

## Transaction support

Multi-step mutations open a transaction in the service:

```ts
await db.$transaction(async (tx: TransactionClient) => {
	await UserRepository(tx).create(...);
	await RoleRepository(tx).attach(...);
});
```

`TransactionClient` is re-exported from `@database` (`export { db, type TransactionClient } from "./client"`). Always type the `tx` parameter as `TransactionClient` — Prisma's interactive transaction client has a slightly narrower surface than the top-level `db`, and TypeScript will flag stray top-level methods (e.g. `$transaction` nesting) at compile time.

A read inside a transaction must also use `Repository(tx)`, not `Repository()` — otherwise Prisma may not see uncommitted writes from earlier in the same transaction.

## Queries

- Use Prisma's typed query API (`dbClient.user.findFirst`, `findMany`, `count`, `create`, `update`, `delete`). Use `select` to project only the columns the caller needs — don't return whole rows when a DTO suffices.
- **Soft delete**: every table that has a `deleted_at` column gets `deleted_at: null` added to the `where` of every read. Don't forget this — leaking soft-deleted rows is a real defect, not a stylistic one. Check `prisma/schema.prisma` to confirm which tables are soft-delete.
- **Datatable reads**: accept `{ page, limit, sort_by, sort_order, search }` (and any feature-specific filters) as a typed `params` object. Run the paged `findMany` and the `count` inside `Promise.all([...])` so the round-trip is one server hop. Return `{ data: <DTO>[], total: number }` and let the service wrap that into the pagination response envelope.
- **Whitelist sortable columns**: if `sort_by` is user-supplied, validate it against an allow-list inside the repository (or accept a typed union). Never feed raw `queryParam.sort_by` into Prisma's `orderBy` — that's a sort-injection vector.
- **DTO shapes** (`UserForAuth`, `UserInformation`, `UserList`, `UserDetail`, etc.) live alongside the entity-specific types in `src/libs/types/repositories/<entity>.ts` and are re-exported via `@types`. Define a new DTO there if a new shape is needed — don't return Prisma's generated row type to consumers (it's wider than you need and leaks schema details).

## What repositories should NOT do

- No business-rule branching that throws `UnprocessableEntityError`, `BadRequestError`, `ConflictError`, or `ForbiddenError`. Repositories may throw `NotFoundError` when a row is genuinely missing and the caller has nothing useful to do about it; everything else (duplicate email, weak password, status conflicts, permission denials) belongs in the service.
- No cache reads/writes. Caching is the service's job (or `auth.plugin.ts` for the user-information cache).
- No password hashing, JWT signing, mail sending, or queue dispatch. Repositories only own SQL.
- No cross-table orchestration that requires a transaction the caller didn't supply — if you need a transaction, accept `tx` via the factory and let the caller open it with `db.$transaction(...)`.
- No interaction with BullMQ queues, Redis, or external HTTP. Those belong in services.
- No `@injectable()` decorator. Repositories are factory functions; they don't go through tsyringe. See [`di.md`](./di.md).

## File layout

- One repository per file: `<entity>.repository.ts` under `src/libs/database/postgres/repositories/`.
- Re-export from `src/libs/database/postgres/repositories/index.ts`. The postgres barrel (`src/libs/database/postgres/index.ts`) re-exports both `db` / `TransactionClient` and the repositories. The top-level `@database` barrel re-exports the postgres bundle plus the ClickHouse and Redis clients.
- Consumers import via `import { UserRepository, db, type TransactionClient } from "@database"`. Never reach into `@database/postgres/repositories/...` with a deep import.
- One repository per **aggregate**, not per query. New filters/joins extend an existing repo; you don't add a `user-active-roles.repository.ts` next to `user.repository.ts`.

## Bridging into auth and other plugins

`auth.plugin.ts` calls `UserRepository().findUserInformation(userJwt.id)` directly during JWT verification, before DI resolution can happen on a request. That's fine here because the factory is just a function — no container roundtrip needed. If you add another plugin that runs before app plugins, follow the same pattern: import the repository factory and call it.
