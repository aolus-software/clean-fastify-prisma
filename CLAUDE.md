# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Full project context is in [`AGENTS.md`](./AGENTS.md).** Read that file first before working on any task. This file contains Claude-specific notes only.

## Claude-specific notes

- Use `bun` (not `npm` or `npx`) for all package and script commands.
- Prisma client is **generated** into `prisma/generated/` — never edit files there. Run `bun run db:generate` after schema changes.
- When adding a new module, follow the existing pattern: `index.ts` (routes) + `schema.ts` (Zod) + `service.ts` (`@injectable()`), then register in `src/modules/index.ts`.
- When adding a new repository method, mirror the pattern in existing repositories: accept an optional `TransactionClient` parameter.
- Throw typed errors from `src/libs/fastify/error/` — never throw plain `Error` in route or service code.
- Use path aliases (`@libs/`, `@modules/`, etc.) — never use relative `../` imports that cross layer boundaries.
- Do not edit `prisma/generated/` or `dist/` — both are auto-generated.
