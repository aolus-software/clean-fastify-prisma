# Rule: Imports and naming

## Path aliases (`tsconfig.json` `paths`, resolved by Bun)

| Alias | Maps to |
| --- | --- |
| `@libs`, `@libs/*` | `src/libs/` |
| `@cache` | `src/libs/cache/` |
| `@config` | `src/libs/config/` |
| `@database` | `src/libs/database/` |
| `@fastify-libs` | `src/libs/fastify/` |
| `@i18n` | `src/libs/i18n/` |
| `@utils` | `src/libs/utils/` |
| `@types` | `src/libs/types/` |
| `@bull` | `src/bull/` |
| `@modules` | `src/modules/` |
| `@/*` | `src/*` |
| `@prisma-generated` | `prisma/generated/client` (the generated Prisma client) |

Each alias also has a `/*` form. Rules:

- **Use the alias for anything outside the current folder**, and import from the bucket root
  (`@utils`, not `@utils/fastify/response`). The accepted deep imports are listed in
  [shared-code.md](./shared-code.md).
- **Relative imports only inside one folder**: `./schema` and `./service` in a module, `../client`
  inside repositories, `./cache` / `./const` inside `libs/cache`, `../error` inside
  `libs/fastify/guards` and `../../error` in the auth plugin (avoids a barrel cycle). `src/app.ts`
  imports plugins and modules by relative path.

## Import order — don't hand-sort

`simple-import-sort/imports` and `/exports` are errors, plus `import/first` and `import/no-duplicates`.
Run `bun run lint:fix`.

## File naming

kebab-case with a role suffix:

| Kind | Pattern | Example |
| --- | --- | --- |
| Repository | `<entity>.repository.ts` | `email-verification.repository.ts` |
| Module service | `service.ts` in the module folder | `src/modules/auth/service.ts` |
| Shared service object | `<name>.service.ts` | `libs/mail/auth-mail.service.ts` |
| Plugin | `<concern>.plugin.ts` | `rate-limiting.plugin.ts` |
| Guard | `<name>.guard.ts` | `permission.guard.ts` |
| Config | `<area>.config.ts` | `env.config.ts` |
| Error class | `<name>.error.ts` | `bad-request.error.ts` |
| Queue / worker | `<job>.queue.ts` / `<job>.worker.ts` | `send-email.queue.ts` |
| Module folder | `index.ts` + `schema.ts` + `service.ts`, plural kebab folder | `settings/select-options/` |
| Seed | `prisma/seed/<area>.seed.ts` | `rbac.seed.ts` |
| Migration | `prisma/migrations/<YYYYMMDDHHMMSS>_<snake_name>/migration.sql` | `20261031000000_sync_with_base` |

## Symbol naming

- Prisma models: singular PascalCase (`User`, `UserRole`, `PasswordReset`), camelCase fields; enum
  `UserStatus` with UPPERCASE members, typed as `UserStatusEnum` in `@types` ([schema.md](./schema.md)).
- Repositories: `PascalCaseRepository(tx?)` factory functions. Services: `PascalCaseService` classes.
  Shared objects: `Session`, `AuthMailService`, `EmailService`. Utilities: `PascalCaseToolkit`.
  Errors: `PascalCaseError`.
- Guards: `PermissionGuard`, `RoleGuard` — factories returning `onRequest` hooks.
- Zod schemas: PascalCase ending `Schema` ([validation.md](./validation.md)).
- Repository allow-lists: `<entity>SortableFields`, `<entity>FilterableFields`,
  `<entity>FilterExample`, `<entity>SearchColumns`.
- Cache keys: `<Concept>CacheKey` functions in `@cache`.
- Private service helpers are plain `private async` methods (`findLive`, `assertEmailAvailable`).
