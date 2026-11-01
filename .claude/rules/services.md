# Rule: Services (`src/modules/<feature>/service.ts`)

Services hold the business rules. Repositories hold data access. Route handlers are the glue. A
service is the only layer allowed to open a transaction.

## Shape — `@injectable()` class, empty constructor

```ts
@injectable()
export class RoleService {
	async findAll(query: DatatableType): Promise<PaginationResponse<RoleList>> {
		return await RoleRepository().findAll(query);
	}
}
```

- Resolved per request with `fastify.di.resolve(RoleService)` ([di.md](./di.md)). Never `new` it.
- Repositories are called inline through their factory, never constructor-injected.
- Every method has explicit parameter and return types.
- A service belongs to its module and is imported only by that module's `index.ts`. Logic two modules
  need lives in a `libs/` bucket: `Session` (`@cache`), `AuthMailService`
  (`@libs/mail/auth-mail.service`).

## No HTTP inside a service

Services take primitives and DTOs and return DTOs. No `request`, no `reply`. The one Fastify object a
service receives is the `JWT` instance passed into `AuthService.issueTokens` / `refresh`.

## Transactions

Services open `db.$transaction(async (tx: TransactionClient) => { ... })` and call
`XRepository(tx)` for every write that must commit together (`User` + `UserRole`, `Role` +
`RolePermission`, a user write + its token). Side effects that must not happen on rollback — queueing
mail, dropping cache — run **after** the transaction returns ([mail.md](./mail.md)).

## Errors

Throw; never return an error object.

| Situation | Error |
| --- | --- |
| Row missing | `NotFoundError` (404) |
| Uniqueness conflict, unknown related ids, business rule after validation, wrong current password | `UnprocessableEntityError` (422) with `[{ field, message }]` |
| Login failure, invalid/expired/used token | `BadRequestError` (400) with `[{ field, message }]` |
| Authentication state lost, bad refresh token | `UnauthorizedError` (401) |
| Caller not permitted | leave it to the route guard — never throw `ForbiddenError` from a service |

Messages are `t("...")` keys ([i18n.md](./i18n.md)).

## Cache invalidation goes through `Session` (`@cache`)

The auth plugin authorizes from a cached `UserInformation` (`user:<id>`, 1 hour). Any write that
changes what it contains must invalidate it, or the caller keeps old roles for up to an hour:

| Write | Call |
| --- | --- |
| user update to `ACTIVE`, profile update | `Session.forgetUsers([id])` |
| user update to any other status (suspend, block, deactivate) | `Session.revokeSessions(id)` |
| user delete, admin password reset, password reset, own password change | `Session.revokeSessions(id)` (also drops the refresh `jti`) |
| role update / delete | `Session.forgetUsers(await UserRepository().findIdsByRoleIds([id]))` |
| permission update / delete | holders via `RoleRepository().findIdsByPermissionId(id)` then `findIdsByRoleIds` |

Never build a cache key inline; never write `Cache` for user state outside `Session` and the refresh
`jti` in `AuthService`.

## Enumeration-leaky paths stay silent

`resendVerification` and `forgotPassword` return early for an unknown (or already verified) email.
`login` checks the password first, against a dummy hash for an unknown email, and answers unknown
email and wrong password with the same message.

## Logging

`logger` from `@utils`, object first: `logger.info({ userId }, "Password reset")`. Never a token,
password, or hash.

## Don't

- Don't put query logic in a service, or business rules in a repository.
- Don't catch an error only to re-throw it unchanged.
- Don't enqueue mail or touch the cache inside a transaction.
- Don't import another module's service.
