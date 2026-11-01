# Rule: Repositories (`src/libs/database/postgres/repositories/*.repository.ts`)

Repositories are the **only** layer that queries Prisma for application data. Services call them;
route handlers never import `db` (the health probe is the exception).

## Shape — factory function over Prisma

```ts
type TransactionClient = Prisma.TransactionClient;

export function RoleRepository(tx?: TransactionClient) {
	const dbClient = tx || db;

	return {
		async findById(id: string): Promise<RoleList | null> {
			return dbClient.role.findUnique({ where: { id }, select: roleSelect });
		},
	};
}
```

- A factory, not a class and not `@injectable()`. `tx || db` lives in one place, and every method
  picks up the right client: `RoleRepository()` outside a transaction, `RoleRepository(tx)` inside.
- A read inside a transaction uses `Repository(tx)` too, or it will not see the transaction's writes.
- Export from `repositories/index.ts`; consumers import from `@database`.
- Use `select` and return a DTO from `@types`, never a full Prisma row (a password hash must not leave
  through an over-wide select).

## Reads return `null`, they do not throw

A miss resolves to `null`; the service decides whether that is a 404. A repository never throws
`NotFoundError` or `UnprocessableEntityError`, never checks uniqueness before a write, and never
imports `@i18n` for a business rule. Lookups the services rely on:

| Method | For |
| --- | --- |
| `findById(id)` | existence before update/delete |
| `findByName(name, excludeId?)` | role / permission uniqueness |
| `findLiveByEmail(email, excludeId?)` | user uniqueness among live users |
| `findExistingByNames(names)` | permission batch create |
| `countByIds(ids)` | verifying `roleIds` / `permissionIds` |
| `getDetail(id)` | the detail DTO, `null` when absent |
| `findIdsByRoleIds(roleIds)`, `RoleRepository().findIdsByPermissionId(id)` | cache invalidation of holders |

## Soft delete

Every `User` read filters `deletedAt: null`; `softDelete` stamps `deletedAt`.
`findUserInformation(id)` additionally requires `status: UserStatus.ACTIVE` — any other user resolves
to `null`, which the auth plugin answers with 401.

## Datatable reads

Each list repository declares and **exports** at module scope:

```ts
export const roleSortableFields = ["id", "name", "createdAt", "updatedAt"] as const;
export const roleSearchColumns = ["name"] as const;
export const roleFilterableFields: FilterField[] = ["name", { field: "createdAt", kind: "date" }, { field: "updatedAt", kind: "date" }];
export const roleFilterExample: Record<string, string> = { name: "admin", createdAt: "2024-01-01,2024-12-31", updatedAt: "2024-01-01,2024-12-31" };
```

`findAll` calls `DatatableToolkit.assertSort(sort, <entity>SortableFields)` (unknown key → 400; the
query schema already 422s it) and `DatatableToolkit.assertFilter(filter, <entity>FilterableFields)`
(unknown key or out-of-range enum value → 400) **before** building `orderBy`, so a raw client string
never reaches Prisma. The route's query schema is built from the same exports, so docs and enforcement
cannot drift ([validation.md](./validation.md)).

- **Sort keys are the camelCase field names**, in the vocabulary of `defaultSort = "createdAt"`.
- **Every filter clause is pushed onto one `conditions` array and combined with `AND`.**
- **Comma semantics per kind:** enum → `in` the split values; `kind: "id"` →
  `DatatableToolkit.filterIds` (UUIDs, `in`); `kind: "date"` → `DatatableToolkit.filterDateRange`
  giving inclusive `gte`/`lte` (a single date = that whole day in `APP_TIMEZONE`, `start,end` = range,
  anything unparseable = 400); plain text → `contains`, `mode: "insensitive"`, comma literal.
- **Search** is `contains` / `insensitive` over the exported search columns; the `status` enum is
  matched by the UPPERCASE values that contain the term.
- **Counts**: `count({ where })` in `Promise.all` with the page query.
- **Output** is `{ data, meta: { page, limit: perPage, totalCount } }`.

## Don't

- No business rules, existence checks, uniqueness checks, cache, hashing, JWT, mail, or queues.
- Don't open a transaction; accept `tx` through the factory.
- Don't pass `orderBy: { [sort]: ... }` without `assertSort` first.
