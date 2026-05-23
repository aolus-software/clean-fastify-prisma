# Rule: Dependency injection (tsyringe)

DI is provided by **tsyringe**. The container, decorators, and helpers are re-exported through `@fastify-libs`:

```ts
import { inject, injectable, container, scoped, singleton } from "@fastify-libs";
```

The `di.plugin.ts` Fastify plugin decorates the app instance with `fastify.di` (the same `tsyringe` `container`) so handlers can resolve services at request time:

```ts
async (request, reply) => {
	const authService = fastify.di.resolve(AuthService);
	// ...
};
```

## What goes through DI here vs not

This repo only uses tsyringe for **services**. Specifically:

- **Services** (`src/modules/<feature>/service.ts`) — `@injectable()` classes, resolved via `fastify.di.resolve(...)` inside route handlers.
- **Repositories** (`src/libs/database/postgres/repositories/*.repository.ts`) — **factory functions**, not injectable classes. Call `UserRepository()` or `UserRepository(tx)` directly. See [`repositories.md`](./repositories.md). Don't decorate them with `@injectable()` and don't take them as constructor parameters.
- **Utilities** (`Hash`, `StrToolkit`, `DateToolkit`, `ResponseToolkit`, `logger`) — stateless static-method classes or plain functions. Direct imports only.
- **Static services** like `EmailService` in `src/libs/mail/mail.service.ts` — use static methods (`EmailService.sendEmail(...)`). Don't migrate them to DI unless they grow real instance state.

The result is a deliberately small DI surface: a handful of `@injectable()` service classes per feature module, nothing else.

## When to use it

Inside Fastify route handlers — **always** resolve via `fastify.di.resolve(Service)` instead of constructing services manually:

```ts
fastify.post("/login", { schema: { ... } }, async (request, reply) => {
	const authService = fastify.di.resolve(AuthService);
	return authService.login(...);
});
```

Outside a Fastify context (e.g. a BullMQ worker processor, a script), import `container` from `@fastify-libs` and call `container.resolve(Service)` directly. In practice today the worker uses static helpers (`EmailService.sendEmail`) and doesn't resolve services through the container — if a worker grows into a `@injectable()` service, resolve once at module top and reuse.

## Registration

Registration is **automatic**. Decorate the class with `@injectable()` and tsyringe figures out the rest using `emitDecoratorMetadata` (already enabled in `tsconfig.json`):

```ts
import { injectable } from "@fastify-libs";

@injectable()
export class FooService {
	async doThing(payload: FooPayload) {
		// call repository factories directly
		const user = await UserRepository().findByEmail(payload.email);
		// ...
	}
}
```

Rules:

- Every service that participates in DI **must** carry `@injectable()`. Without it, tsyringe can't read constructor metadata and will throw at resolve time.
- Service constructors in this repo are usually **empty**. Repositories are factory functions called inside method bodies — they are not constructor-injected.
- If a service genuinely needs another `@injectable()` service injected (rare), constructor parameters must be **concrete classes**. Avoid `@inject("token")` unless you're registering a primitive value.
- `reflect-metadata` must be imported **once at process start**. `src/serve.ts` (transitively, via `src/app.ts` and the DI plugin) and `src/bull/index.ts` both do this — keep them. If a new entry point appears, add the import at the top.
- Services live at `src/modules/<feature>/service.ts`. There is no central `services/` barrel and no `@services` alias — import each service from its module folder: `import { AuthService } from "@modules/auth/service"` (or, where the module exposes its own barrel, `from "@modules/auth"`).

## Resolution

Inside route handlers (DI plugin runs as part of the `plugins/app/` autoload bucket):

```ts
fastify.post(
	"/forgot-password",
	{ schema: { ... } },
	async (request, reply) => {
		const service = fastify.di.resolve(AuthService);
		await service.forgotPassword(request.body.email);
		return ResponseToolkit.success(reply, {}, "Password reset email sent");
	},
);
```

Outside Fastify context (BullMQ worker, scripts):

```ts
import { container } from "@fastify-libs";

const fooService = container.resolve(FooService);
```

Tsyringe returns a typed instance — no generic needed when passing the class as the token.

## Don't

- Don't `new FooService(...)` from a route handler. You're bypassing the container, and any future singleton/scoped registration won't take effect.
- Don't call `fastify.di.resolve(...)` at module top level. Resolution must happen inside the handler — at module load time, the container may not yet have what you need (and `reflect-metadata` registration is order-sensitive).
- Don't decorate repositories with `@injectable()` to "make them DI-friendly". The repository pattern in this repo is a closure-over-`tx` factory function, not a class. Mixing the two breaks the transaction story (see [`repositories.md`](./repositories.md)).
- Don't add a second DI library (inversify, awilix, a hand-rolled container). The project standardises on tsyringe; mixing containers fragments the dependency graph.
- Don't register classes via `container.register("token", { useClass: Foo })` for normal application code — `@injectable()` plus direct resolution is the idiomatic path. Manual registration is only for swapping implementations in tests or for primitive-token injection (`container.register("APP_CONFIG", { useValue: ... })`).
- Don't decorate utility helpers (`Hash`, `StrToolkit`, `DateToolkit`, `ResponseToolkit`, `EmailService`) with `@injectable()`. They're stateless static-method classes — direct imports are simpler.
