# Rule: Dependency injection (tsyringe)

DI is **tsyringe**, and only services go through it. The container and decorators are re-exported
through `@fastify-libs` (`container`, `injectable`, `inject`, `singleton`, `scoped`). `di.plugin.ts`
decorates the app with `fastify.di` (the same `container`).

## What goes through DI

| Thing | How it is used |
| --- | --- |
| Module services (`src/modules/<feature>/service.ts`) | `@injectable()` classes with empty constructors, resolved with `fastify.di.resolve(Service)` |
| Repositories | factory functions — `UserRepository()`, `UserRepository(tx)`; never `@injectable()`, never injected ([repositories.md](./repositories.md)) |
| `Session`, `AuthMailService`, `EmailService` | plain objects with methods, imported directly |
| Utilities (`Hash`, `StrToolkit`, `DateToolkit`, `ResponseToolkit`, `DatatableToolkit`, `logger`) | static classes / functions, imported directly |

## Resolution

| Where | How |
| --- | --- |
| Route handler | `fastify.di.resolve(RoleService)` inside the handler |
| Worker, script | `container.resolve(Service)` inside the function |

Resolve inside the function body, never at module top level. The auth plugin does not resolve
anything: it calls `Session.getUserInformation` directly.

## Registration is automatic

```ts
@injectable()
export class ProfileService {
	async updatePassword(userId: string, data: PasswordChange): Promise<void> {
		const hash = await UserRepository().findPasswordHash(userId);
		// ...
	}
}
```

- Every service carries `@injectable()`. Keep `emitDecoratorMetadata` and `experimentalDecorators`
  on in `tsconfig.json`.
- `reflect-metadata` is imported once at each entry point: `src/serve.ts` and `src/bull/index.ts`
  (the DI container module imports it too). A new entry point adds it first.

## Don't

- Don't `new` a service from a route handler.
- Don't decorate repositories or utilities with `@injectable()`, or inject a repository through a
  constructor — the factory is what threads `tx`.
- Don't register with string tokens for application code; manual `container.register` is for
  swapping implementations in tests.
- Don't add a second DI library.
