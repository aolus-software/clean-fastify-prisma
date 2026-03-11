# AGENTS.md

Shared project context for all AI coding agents (Claude, GitHub Copilot, Gemini).

## Stack

- **Runtime**: Bun
- **Framework**: Fastify 5 with TypeScript (strict)
- **ORM**: Prisma with `@prisma/adapter-pg` (PostgreSQL)
- **Cache / Queue broker**: Redis via ioredis + BullMQ
- **DI**: tsyringe (decorator-based)
- **Validation**: Zod
- **Auth**: JWT (access + refresh) via `@fastify/jwt`

## Commands

```bash
# Development
bun run dev          # server + worker concurrently with hot reload
bun run dev:server   # server only
bun run dev:worker   # BullMQ worker only

# Build & production
bun run build        # tsc + bun bundle → dist/
bun run start        # run production bundle

# Code quality
bun run lint         # ESLint
bun run format       # Prettier
bun run typecheck    # tsc --noEmit

# Database
bun run db:generate  # generate Prisma client (prisma/generated/)
bun run db:migrate   # run pending migrations
bun run db:push      # push schema without migration file
bun run db:seed      # seed roles, permissions, users

# Makefile shortcuts
make dev             # dev:server + dev:worker
make fresh           # db:push + db:seed (clean slate)
make reset           # db:migrate + db:seed
```

Docker services (PostgreSQL 18 on :5432, Redis 8 on :6379):

```bash
docker compose up -d
```

## Architecture

```
src/
├── serve.ts          # entry point — starts Fastify + graceful shutdown
├── app.ts            # registers all plugins & module routes
├── bull/             # BullMQ queues and workers (email queue)
├── libs/             # infrastructure / shared
│   ├── config/       # envalid env validation, one file per concern
│   ├── database/
│   │   ├── postgres/ # Prisma client + repository classes
│   │   └── redis/    # ioredis client wrapper
│   ├── cache/        # Redis cache helpers + key constants
│   ├── fastify/
│   │   ├── plugins/  # Fastify plugins (auth, authorization, DI, error, swagger…)
│   │   ├── di/       # tsyringe container setup
│   │   ├── error/    # typed HTTP error classes (BadRequest, NotFound, …)
│   │   └── default/  # shared constants (password rules, pagination, token TTL)
│   ├── mail/         # Nodemailer service + template engine
│   ├── types/        # shared TypeScript types (datatable, repository interfaces)
│   └── utils/        # pure helpers (hash, encrypt, date, response, datatable)
└── modules/          # feature modules (co-located routes + schema + service)
    ├── auth/
    ├── profile/
    ├── settings/
    │   ├── users/
    │   ├── roles/
    │   ├── permissions/
    │   └── select/
    └── health/
```

### Module convention

Every feature module contains:

| File         | Responsibility                                 |
| ------------ | ---------------------------------------------- |
| `index.ts`   | Fastify route definitions, plugin registration |
| `schema.ts`  | Zod request/response schemas                   |
| `service.ts` | Business logic, injected via tsyringe          |

### Repository pattern

All DB access goes through repository classes in `src/libs/database/postgres/repositories/`. Services never call `prismaClient` directly. Repositories accept an optional `TransactionClient` for atomic operations.

### Dependency injection

Services are decorated with `@injectable()`. Resolve with `fastify.di.resolve(ServiceClass)` inside route handlers (wired in `di.plugin.ts`). Container is in `src/libs/fastify/di/container.ts`.

### Authentication & authorisation

- `auth.plugin.ts` — verifies JWT, loads user from cache or DB, attaches to `request.user`
- `authorization.plugin.ts` — adds `request.checkPermission(permission)` and `request.checkRole(role)` decorators
- Superuser role bypasses all permission checks (`superuser.plugin.ts`)
- User info cached in Redis for 24 h (key constant in `src/libs/cache/const.ts`)

### Error handling

Throw typed errors from `src/libs/fastify/error/`:

```ts
import { NotFoundError, BadRequestError } from "@fastify/error";
```

`error.plugin.ts` catches them globally and formats a consistent JSON response.

### Response helpers

Use `src/libs/utils/fastify/response.ts` for all route responses:

```ts
return successResponse(reply, data);
return errorResponse(reply, message, statusCode);
```

### Background jobs

Email sending is queued in BullMQ (`src/bull/queue/send-email.queue.ts`) and processed by the worker process (`src/bull/worker/send-email.worker.ts`). The worker runs as a separate Bun process.

## Path aliases (tsconfig)

| Alias               | Resolves to               |
| ------------------- | ------------------------- |
| `@/*`               | `src/`                    |
| `@libs/*`           | `src/libs/`               |
| `@modules/*`        | `src/modules/`            |
| `@cache/*`          | `src/libs/cache/`         |
| `@config/*`         | `src/libs/config/`        |
| `@database/*`       | `src/libs/database/`      |
| `@prisma-generated` | `prisma/generated/client` |

## Data models (Prisma)

`User` → `UserRole` (many-to-many) → `Role` → `RolePermission` → `Permission`

- All PKs are UUID
- Soft delete via `deleted_at`; active records filter by `deleted_at: null`
- `EmailVerification` and `PasswordResetToken` have expiry timestamps

## Environment variables

Copy `.env.example` to `.env`. Key groups:

- `APP_*` — server, JWT secrets, timezone
- `DATABASE_URL`, `DB_POOL_*` — Prisma / pg pool
- `REDIS_*` — Redis connection
- `MAIL_*` — Nodemailer SMTP
- `CORS_*` — allowed origins/methods
