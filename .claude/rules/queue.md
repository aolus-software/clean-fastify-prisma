# Rule: BullMQ queues and workers (`src/bull/`)

Background work runs through BullMQ on Redis. The worker is a **separate process**
(`bun run dev:worker`, `start:worker` = `bun ./dist/worker.js`, the compose `worker` service), not
part of the API. It runs through `runWithCluster` like the API, so `APP_CLUSTER_MODE` forks it too.

```
src/bull/
├── index.ts                   # worker entry: reflect-metadata, runWithCluster, imports the workers
├── queue/<job>.queue.ts       # one Queue per file
└── worker/<job>.worker.ts     # one Worker per file
```

Today there is one pair: `queue/send-email.queue.ts` (`sendEmailQueue`) and
`worker/send-email.worker.ts`, payload `EmailOptions` from `src/libs/mail/mail.service.ts`.

## Queue file

- Export `<job>Queue`; the queue name is a kebab-case string (`"send-email"`) matching its worker.
- Connection is `RedisClient.getQueueRedisClient()` (`@database`), one shared ioredis instance (BullMQ needs ioredis; `ioredis` is a direct dependency) — never a new client.
- Type the payload at the generic when it has one: `new Queue<EmailOptions>("send-email", { connection })`.
- The email queue sets `defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 2000 } }`:
  without `attempts` BullMQ tries a job once and the worker's re-throw retries nothing. A new
  queue sets its own `attempts` the same way.

## Worker file

- Same queue name and payload type. Wrap the processor in try/catch, log success and failure with
  `logger` from `@utils`, and **re-throw** so BullMQ retries. Attach `.on("failed", ...)`.
- Delegate to a service or helper (`EmailService`) rather than calling repositories directly.
- Register it in `src/bull/index.ts` (the entry imports the worker inside its `run` callback and
  closes it on SIGTERM/SIGINT).

## Producing jobs

Services (or `libs/` helpers such as `AuthMailService`) produce, never handlers, and always
`await queue.add(...)`. A job that depends on a database write is enqueued **after** that write's
transaction commits ([mail.md](./mail.md)). Import the queue by path:
`import { sendEmailQueue } from "@bull/queue/send-email.queue"`.

## Don't

- Don't open a new Redis connection in a queue or worker file.
- Don't swallow errors in the processor.
- Don't import a worker anywhere except `src/bull/index.ts`.
- Don't log the recipient address, a token or a token-bearing URL; put identifiers (`jobId`,
  `template`) in the log object.
