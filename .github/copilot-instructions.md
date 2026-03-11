# GitHub Copilot Instructions

> **Full project context is in [`AGENTS.md`](../AGENTS.md).** Read that file for architecture, commands, patterns, and conventions before suggesting code.

## Copilot-specific reminders

- Runtime is **Bun** — use `bun` for all CLI commands, not `node` or `npm`.
- All business logic lives in `service.ts` files under `src/modules/`. Route handlers in `index.ts` should stay thin.
- Validate all incoming data with **Zod** schemas defined in `schema.ts` — do not use ad-hoc validation.
- Use typed HTTP error classes from `src/libs/fastify/error/` for all error responses.
- Follow the repository pattern: DB access only through classes in `src/libs/database/postgres/repositories/`.
- Use path aliases (`@libs/`, `@modules/`, `@config/`, etc.) — never relative imports crossing layer boundaries.
