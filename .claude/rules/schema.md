# Rule: Prisma schema (`prisma/schema.prisma`)

The schema is the source of truth. `prisma.config.ts` points Prisma at `prisma/schema.prisma` and
`prisma/migrations/`; the client is generated to `prisma/generated/` (git-ignored) and imported as
`@prisma-generated`. `UserStatus` and `Prisma` are re-exported from `@database`.

## Naming — Prisma defaults, no mapping

- **No `@@map` / `@map`.** Physical table names are the model names (`"User"`, `"Role"`,
  `"Permission"`, `"RolePermission"`, `"UserRole"`, `"UserEmailVerification"`, `"PasswordReset"`)
  and columns are the camelCase field names (`emailVerifiedAt`, `deletedAt`, `createdAt`,
  `userId`, `expiresAt`, `usedAt`). This is the owner decision for Prisma repos; do not add a
  mapping to snake_case as a drive-by.
- Response DTOs use the same camelCase names, so nothing is translated between column and wire.

## Enum

```prisma
enum UserStatus {
  ACTIVE
  INACTIVE
  SUSPENDED
  BLOCKED
}
```

Values are UPPERCASE in the database **and on the wire**. Zod uses the generated object
(`z.enum(UserStatus)`); services compare with `UserStatus.ACTIVE`. Adding a value needs a migration.

## Standard fields

- PK `id String @id @default(uuid()) @db.Uuid`.
- `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`.
- `User.status` defaults to `ACTIVE`. `User.remark` is nullable.
- Soft delete: `User.deletedAt` (nullable). Roles and permissions are hard-deleted.

## Join tables

`RolePermission (roleId, permissionId)` and `UserRole (userId, roleId)` use a composite `@@id`, carry
`createdAt`/`updatedAt`, and reference both parents with `onDelete: Cascade`, so deleting a role or a
permission removes its grants and assignments.

## Indexes and uniqueness

- `@@index([email, deletedAt, status])` on `User`.
- `Role.name` and `Permission.name` are `@unique`.
- `@@index([roleId])` on `UserRole` and `@@index([permissionId])` on `RolePermission`: the composite
  primary keys lead with `userId` / `roleId`, so lookups by the second column ("who holds this role",
  "which roles grant this permission", and the `ON DELETE CASCADE` from `Role` / `Permission`) need
  their own index.
- `User_email_live_key` — a **partial unique index** on `email WHERE "deletedAt" IS NULL`, so live
  emails are unique in the database while a soft-deleted user's email stays reusable. Prisma 7 cannot
  declare a partial index, so it exists only in the hand-written tail of
  `20261112023359_db_optimization/migration.sql`, with a comment naming it in `schema.prisma`.
  `prisma migrate diff` / `migrate dev` ignore it (no drop is generated). The service's
  `findLiveByEmail` check still runs first, so callers get a 422; the index only catches a race.

## Token tables need expiry and single use

`UserEmailVerification` and `PasswordReset` both carry `userId` (FK `onDelete: Cascade`),
`token String @unique @db.VarChar(255)`, `expiresAt DateTime`, `usedAt DateTime?`, and
`@@index([userId, usedAt])`.

- `expiresAt` is set from `verificationTokenLifetime()` / `resetPasswordLifetime()` — **functions**
  called at issue time, never module-scope constants.
- **Single use is a stamp, not a delete.** Consumption sets `usedAt` on every unused token of that
  user (`markAllUsed`) in the same transaction as the write it authorises; issuing a new token stamps
  the old ones first. The consuming service rejects a row that is missing, expired, or used.

## Migrations

- Normal change: `bun run db:migrate:dev` (`prisma migrate dev`) against a local database, review
  the SQL, commit the new folder under `prisma/migrations/`.
- Without a database, generate offline:
  `bunx --bun prisma migrate diff --from-schema <old.prisma> --to-schema prisma/schema.prisma --script`
  into a new `prisma/migrations/<timestamp>_<name>/migration.sql`.
- **Hand-write** the SQL only where Prisma would drop and recreate data, or cannot express the change
  (renames, partial indexes, data fixes). `20261031000000_sync_with_base` is hand-written: it renames
  the old snake_case tables and columns in place, uppercases the enum, and deletes outstanding
  tokens (reset tokens had no expiry to backfill). `20261112023359_db_optimization` is generated
  plus one hand-written statement (the partial unique index above).
- Never edit a migration that has been applied. Apply with `bun run db:migrate`
  (`prisma migrate deploy`).
- `make reset` = generate + migrate + seed. `make fresh` = `db:drop`
  (`src/libs/database/postgres/scripts/drop.ts`, which refuses `NODE_ENV=production` and then runs
  `prisma migrate reset --force`, destructive) + push + seed. `db:push` is development-only.

## Seeds (`prisma/seed/`)

Order: `rbac.seed.ts` (15 `<group> <action>` permissions over `user`, `role`, `permission` ×
`list`, `create`, `detail`, `edit`, `delete`; roles `superuser` and `admin`; both granted the
catalogue, the grant read scoped to catalogue names so an operator-added permission is never
auto-granted) → `user.seed.ts` (`superuser@example.com`, `admin@example.com`, password
`S3crEtP4ssw0rd!`, `ACTIVE`, pre-verified, holding the role of the same name). Every insert uses
`createMany({ skipDuplicates: true })` or a live lookup, so a rerun is a no-op; `index.ts` exits 1
on failure. Guard strings must match the catalogue ([rbac.md](./rbac.md)).

## Don't

- Don't put `@@map` / `@map` back, or rename a model without a migration that renames the table.
- Don't add a token table without `expiresAt`, `usedAt`, a unique `token` and the `(userId, usedAt)`
  index.
- Don't enforce single use by deleting the row, or read a token without checking `usedAt`.
