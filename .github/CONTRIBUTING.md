# Contributing

Thanks for considering a contribution. This repository is a **starter template**, so changes are
judged by whether most projects built on it would benefit — not by whether they are useful in one
specific application.

## Before you start

Read these first; they are the source of truth for how code is written here:

- **`CLAUDE.md`** — the explicit `app.ts` registration order, layering, the module layout, and the non-obvious
  behaviours worth knowing (per-route guards, access vs refresh tokens, cache invalidation).
- **`.claude/rules/`** — area-scoped standards, indexed in `.claude/rules/README.md`. Read the matching
  one before you touch that area.
- **`docs/`** — `CONFIGURATION.md` (env vars), `PLUGINS.md`, `ERROR_HANDLING.md`, `SECURITY.md`,
  `API_DOCUMENTATION.md`, `DEPLOYMENT.md`.
- `.github/copilot-instructions.md` has extended code examples that mirror the rules above.

For anything larger than a bug fix, open an issue first so the design can be agreed before you spend
time on it.

## Local setup

The runtime is **Bun**, not Node. Always use `bun run` / `bunx` — never `npm`, `pnpm`, or `yarn`.

```bash
git clone https://github.com/aolus-software/clean-fastify-prisma.git
cd clean-fastify-prisma
bun install
cp .env.example .env                  # then set JWT_SECRET and JWT_REFRESH_SECRET
docker compose up -d postgres redis
make db-generate                      # generate the Prisma client
make db-migrate                       # apply migrations (prisma migrate deploy)
make db-seed                          # superuser@example.com / S3crEtP4ssw0rd!
make dev                              # API + worker
```

The API listens on `APP_PORT` (default 3000). The Scalar API reference is at `/docs` (spec at
`/docs/openapi.json`) only when `ENABLE_API_DOCS=true`, which `.env.example` sets for local work.

Useful commands — every `make` target wraps the matching `bun run` script:

```bash
make help             # every available target
make dev              # API + worker with hot reload
make dev-server       # API only
make dev-worker       # worker only
bun run lint          # eslint . --ext .ts,.js
bun run lint:fix
bun run format        # prettier --write .
bun run format:check  # prettier --check . (what CI runs)
bun run typecheck     # tsc --noEmit
bun run build         # typecheck + dist/serve.js + dist/worker.js + dist/templates/
make db-generate      # prisma generate
make db-migrate       # prisma migrate deploy
make db-migrate-dev   # prisma migrate dev (create + apply a migration)
make db-push          # prisma db push (dev only)
make db-studio        # prisma studio
make db-seed          # idempotent
make fresh            # prisma migrate reset --force + push + seed (dev only, destroys data)
make reset            # db-generate + db-migrate + db-seed
```

There is **no test runner configured**. Don't add `bun test` commands to docs or CI unless you are
also adding the tests in the same PR.

### Running the whole stack in Docker

```bash
make docker-up        # docker compose up -d --build (postgres, redis, app, worker)
make docker-migrate   # build the migrator target and run migrations on the compose network
make docker-seed
make docker-logs      # tail app and worker logs
make docker-ps
make docker-down
make docker-deploy    # git pull + build + up + migrate (server deploy)
```

`docker-migrate` derives the network name from the directory name (`<dir>_app_network`); if you
renamed the directory, pass `DOCKER_NETWORK=...`. Keep `.env` values **unquoted** —
`docker run --env-file` passes quotes literally. Inside compose, use service hostnames (`postgres`,
`redis`), not `localhost`.

## Coding standards

The full set is in `.claude/rules/`. The parts that come up most:

- **Style** — tabs, double quotes, semicolons, trailing commas (Prettier). Imports are sorted by
  `eslint-plugin-simple-import-sort`; let `bun run lint:fix` order them.
- **Types** — TypeScript `strict`, plus `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`.
  `no-explicit-any` is an **error**. Prefix intentionally-unused parameters with `_`.
- **Promises** — `no-floating-promises` is an error. Always `await` or `void`.
- **Logging** — no `console.*` in application code; use the structured `logger` (pino) from `@utils`.
  Entry points and standalone scripts carry `eslint-disable-next-line no-console` where they print.
- **Path aliases** — `@config`, `@database`, `@fastify-libs`, `@cache`, `@i18n`, `@types`, `@utils`,
  `@libs`, `@modules`, `@bull`, `@prisma-generated`. Import from the bucket root, never with a
  relative path that climbs out of a module folder.
- **Layering** — a module's `index.ts` handles HTTP only and resolves one service with
  `fastify.di.resolve(...)`; the module's `@injectable()` `service.ts` owns business logic,
  existence/uniqueness checks, transactions, cache invalidation and queue dispatch; repository
  factories (`XRepository(tx?)`) own Prisma queries, return `null` on a miss, and never open a
  transaction.
- **Responses** — `ResponseToolkit.success(reply, data, message, status)` for successes; throw error
  classes from `@fastify-libs` for failures. Never `reply.status(4xx).send(...)`.
- **Authorization** — protected modules add an `onRequest` hook that calls
  `await request.authenticate()`, and each route declares `onRequest: PermissionGuard([...])` or
  `RoleGuard([...])`. Permission strings match the seeded `<group> <action>` catalogue.
- **OpenAPI** — every route declares its Zod schemas plus `tags`, `summary`, `description`, and a
  `response` map listing every status code it can really return.
- **Env** — never read `process.env` outside `src/libs/config/`. Add the variable to
  `src/libs/config/env.config.ts`, expose it through a `@config` object, and document it in
  `.env.example` and `docs/CONFIGURATION.md`.
- **i18n** — no hardcoded user-facing strings. Add the key to **both**
  `src/libs/i18n/locales/en.json` and `id.json`, run `bun run i18n:keys`, and commit the result.

## Adding a feature module

1. Add the model to `prisma/schema.prisma` (Prisma default names, no `@@map`) and create a migration
   (`make db-migrate-dev`).
2. Add `src/libs/database/postgres/repositories/<entity>.repository.ts` (factory `XRepository(tx?)`,
   reads return `null`, exported sort/filter/search allow-lists) and export it from the barrel.
3. Add `src/modules/<feature>/index.ts`, `schema.ts` and `service.ts` (`@injectable()`).
4. Register the module in the `routes` array of `src/app.ts` with its URL prefix.
5. Add the routes to `.claude/rules/routes.md` and `docs/API_DOCUMENTATION.md`, and any new
   permission to `prisma/seed/rbac.seed.ts`.

## Database changes

Edit `prisma/schema.prisma`, then:

```bash
make db-migrate-dev   # prisma migrate dev: writes prisma/migrations/<timestamp>_<name>/ and applies it
# or, without a database:
bunx --bun prisma migrate diff --from-schema <old.prisma> --to-schema prisma/schema.prisma --script
```

Commit the new migration folder. CI validates the schema and applies every migration with
`prisma migrate deploy` against a real Postgres service. Hand-write the SQL only where Prisma would
drop data or cannot express the change (renames, partial indexes).

Never hand-edit a migration that has already been applied. Review every migration for destructive
operations before committing. Users are soft-deleted — new read paths on `User` must filter
`deletedAt: null`.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/), lowercase after the colon, imperative
mood, under 72 characters, no trailing period:

```
feat(users): add bulk status update endpoint
fix(auth): reject a refresh token presented as a bearer token
docs: document the docker deploy targets
chore: bump fastify to 5.8.5
```

Types used here: `feat`, `fix`, `refactor`, `style`, `docs`, `chore`, `db`.

> **Warning — the pre-commit hook touches your database.** The Husky `pre-commit` hook runs, in
> order:
>
> ```sh
> bun install
> bun run format
> bun run lint:fix
> bunx --bun prisma validate
> bunx --bun prisma format
> bunx --bun prisma migrate dev
> bunx --bun prisma generate
> bun run tsc --noEmit
> bun run build
> ```
>
> `prisma migrate dev` **can write a migration and applies pending ones against the
> `DATABASE_URL` in your `.env`**. Know what that URL points at before you commit; never let it point
> at a shared or production database.
>
> If you have already run format, lint, typecheck, and build yourself and your change touches no
> schema, `git commit --no-verify` is reasonable.

## Pull requests

1. Branch off `main`.
2. Keep the PR focused — one concern per PR.
3. Fill in the pull request template, including the checklist.
4. Make sure `bun run lint`, `bun run format:check`, `bun run typecheck`, and `bun run build` pass.
   CI (`.github/workflows/ci.yml`) runs lint, the prettier check, typecheck, `prisma validate`
   plus `prisma migrate deploy` against a real Postgres service, and the build.
5. Update the docs your change affects **in the same PR** — `README.md`, `CLAUDE.md`, the matching
   `.claude/rules/` file, `docs/`, and the i18n catalogues for new strings.

## Reporting bugs and requesting features

Use the issue templates. Usage questions belong in
[Discussions](https://github.com/aolus-software/clean-fastify-prisma/discussions), not issues. Security
vulnerabilities go through [SECURITY.md](SECURITY.md) — never a public issue.

## License

By contributing, you agree that your contributions are licensed under the MIT License that covers
this repository.
