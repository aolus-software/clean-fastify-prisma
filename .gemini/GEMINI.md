# GEMINI.md

> **Full project context is in [`AGENTS.md`](../AGENTS.md).** Read that file for architecture, commands, patterns, and conventions before working on any task.

## Gemini-specific reminders

- Runtime is **Bun** — use `bun` (not `node`/`npm`) for scripts and package management.
- Two processes run in development: the Fastify **server** and the BullMQ **worker** (`bun run dev` starts both).
- Prisma client is generated into `prisma/generated/` — always run `bun run db:generate` after schema changes, never edit generated files.
- New feature modules go under `src/modules/` following the `index.ts` + `schema.ts` + `service.ts` convention.
- Use path aliases defined in `tsconfig.json` (e.g. `@libs/`, `@modules/`) for all cross-directory imports.
