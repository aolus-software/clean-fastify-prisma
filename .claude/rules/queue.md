# Rule: BullMQ queues and workers (`src/bull/`)

Background work runs through BullMQ on Redis. The worker is a **separate process** (`bun run dev:worker` / `bun run start:worker`), not part of the API process. Layout:

```
src/bull/
├── index.ts                   # entry point: imports each worker for side effects
├── queue/
│   └── <feature>.queue.ts     # one Queue per file
└── worker/
    └── <feature>.worker.ts    # one Worker per file
```

`src/bull/index.ts` imports `./worker/<feature>.worker` **for its side effects** — instantiating the `new Worker(...)` is what registers it with Redis. When you add a new worker, you must add its import to `src/bull/index.ts`, or it won't run.

The worker process imports `"reflect-metadata"` first (so tsyringe metadata is available if a worker resolves a service via the container). Keep that import in `src/bull/index.ts`.

## Queue file

- One queue per file under `src/bull/queue/`. Filename: `<feature>.queue.ts`. Export name: `<feature>Queue` (camelCase).
- Connection comes from `RedisClient.getQueueConnectionOptions()` (`@database`) — **never** `new IORedis(...)` directly. Queues and workers share that helper so they hit the same Redis DB with the same options BullMQ expects.
- Queue name is a kebab-case string (`"send-email"`) and **must match** between the queue and its worker.
- Type the payload at the `Queue` generic level when you have a typed payload: `new Queue<EmailOptions>("send-email", { connection })`. Export the payload type from the producing service module (e.g. `EmailOptions` from `src/libs/mail/mail.service.ts`) or from `@types` when the shape is genuinely cross-cutting.
- Set `defaultJobOptions` when retries matter:
  ```ts
  new Queue<EmailOptions>("send-email", {
  	connection: RedisClient.getQueueConnectionOptions(),
  	defaultJobOptions: {
  		attempts: 3,
  		backoff: { type: "exponential", delay: 2000 },
  	},
  });
  ```

## Worker file

- One worker per queue under `src/bull/worker/`. Filename matches: `<feature>.worker.ts`.
- Same queue name and same payload type as the queue. Pattern (from `send-email.worker.ts`):

  ```ts
  import { RedisClient } from "@database";
  import { EmailOptions, EmailService } from "@libs/mail/mail.service";
  import { logger } from "@utils";
  import { Worker } from "bullmq";

  const worker = new Worker<EmailOptions>(
  	"send-email",
  	async (job) => {
  		try {
  			await EmailService.sendEmail(job.data);
  			logger.info({}, `Email job processed for ${job.data.to}`);
  		} catch (error) {
  			logger.error(error, `Failed to process email job for ${job.data.to}`);
  			throw error;
  		}
  	},
  	{ connection: RedisClient.getQueueConnectionOptions() },
  );

  worker.on("failed", (job, err) => {
  	logger.error(err, `Job ${job ? job.id : "unknown"} failed`);
  });

  export { worker };
  ```

- The processor function **must** wrap its work in try/catch, log both success and failure with structured `logger` from `@utils`, and **re-throw** on failure so BullMQ retries with the queue's backoff policy.
- Attach a `.on("failed", ...)` handler — that's the catch-all when all attempts fail.
- Workers do **not** call repositories directly when the same logic lives in a service or a stateless helper. They delegate to a service (`EmailService.sendEmail` today) so business rules stay in one place. If a worker needs a `@injectable()` service with dependencies, resolve it **once** at module top via `container.resolve(FooService)` (from `@fastify-libs`) and reuse the instance — don't resolve per job. See [`di.md`](./di.md).

## Producing jobs

Services produce, never route handlers:

```ts
import { sendEmailQueue } from "@bull/queue/send-email.queue";

await sendEmailQueue.add("welcome", {
	to: user.email,
	subject: "Welcome",
	html: renderTemplate("welcome", { name: user.name }),
});
```

First arg is the job name (free-form, used for filtering in dashboards); second is the typed payload. Always `await` `.add(...)` — `@typescript-eslint/no-floating-promises` is an error.

## Wiring up a new queue

1. Add `src/bull/queue/<feature>.queue.ts` — instantiate `new Queue<Payload>("kebab-name", { connection: RedisClient.getQueueConnectionOptions() })`.
2. Add `src/bull/worker/<feature>.worker.ts` — `new Worker<Payload>("kebab-name", processor, { connection: RedisClient.getQueueConnectionOptions() })`.
3. Define the payload type once (co-located with the service that owns the shape, or in `@types` if it's cross-cutting) and reuse it on both sides.
4. Add `import "./worker/<feature>.worker"` to `src/bull/index.ts` so the worker registers when the worker process boots.
5. Producer-side: import the queue from `@bull/queue/<feature>.queue` and `.add(...)` from inside a service.

## Don't

- Don't open a new Redis client inside a queue or worker file. Reuse `RedisClient.getQueueConnectionOptions()`.
- Don't swallow errors inside the worker processor — log and re-throw so BullMQ retries with backoff.
- Don't run blocking, multi-minute jobs without setting an explicit `lockDuration` — the default lease will expire and BullMQ will redeliver the job.
- Don't import a worker file from anywhere except `src/bull/index.ts`. Workers are not utilities; they're side effects of the worker process.
- Don't share a single `Worker` instance between two queue names. Each queue gets its own `Worker`.
- Don't enqueue from a route handler. Producers belong in `service.ts` — that keeps business rules and queue dispatch in one place, and makes the worker the only path that runs a given side effect.
