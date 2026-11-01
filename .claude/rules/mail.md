# Rule: Mail (`src/libs/mail/`)

Mail leaves the process through the BullMQ queue. `sendEmailQueue.add("send-email", ...)` returns
immediately; the separate worker process (`src/bull/worker/send-email.worker.ts`) calls
`EmailService.sendEmail`. Calling `EmailService.sendEmail` inline from a request is wrong unless the
mail must land before the response, and then a comment says why.

## `AuthMailService` — mint in the transaction, queue after commit

`AuthMailService` (`src/libs/mail/auth-mail.service.ts`, a plain object used by the auth module and
the settings users module) owns the auth mails and their tokens:

| Method | Does |
| --- | --- |
| `issueVerificationToken(userId, tx?)` | stamps `usedAt` on every unused verification token of the user, inserts a new one (`StrToolkit.random(100)`, expiry `verificationTokenLifetime()`), returns it |
| `issueResetToken(userId, tx?)` | same for password reset (`StrToolkit.random(255)`, `resetPasswordLifetime()`) |
| `queueVerificationEmail(user, token)` | enqueues `auth/email-verification` with `${CLIENT_URL}/auth/verify-email?token=...` |
| `queueResetPasswordEmail(user, token)` | enqueues `auth/forgot-password` with `${CLIENT_URL}/auth/reset-password?token=...` |
| `sendVerificationEmail(user)` / `sendResetPasswordEmail(user)` | issue in their own `db.$transaction`, then queue |

A caller that writes something else in the same transaction mints **inside** it and queues **after**
it returns:

```ts
const { user, token } = await db.$transaction(async (tx: TransactionClient) => {
	const created = await UserRepository(tx).create({ ... });
	return { user: created, token: await AuthMailService.issueVerificationToken(created.id, tx) };
});
await AuthMailService.queueVerificationEmail(user, token);
```

Queueing inside the transaction would send a link for a token a rollback then deletes. Issuing
**revokes earlier unused tokens**, so only the newest link works.

## Templates

Plain HTML under `src/libs/mail/templates/<area>/<name>.html`. `sendEmail` replaces `{{key}}` from the
flat `variables` record — not Handlebars: no helpers, no loops. Templates are English only today;
subjects come from `mail.subject.*` keys ([i18n.md](./i18n.md)) translated at enqueue time. The build
copies the folder to `dist/templates/`, which is where the bundled worker reads it.
`sendEmail` prefixes the subject with `[<APP_ENV>]` outside production — don't prefix it yourself.

## Don't

1. Don't enqueue mail inside a transaction.
2. Don't log a token, a token-bearing URL, or the recipient address — `logger.info({ userId }, "...")`
   in producers, `{ jobId, template }` in the worker and `{ template }` in `EmailService`. SMTP errors
   can quote the address, so `EmailService` logs and re-throws only their `code` / `responseCode`.
3. Don't hardcode a host or read `process.env` — links come from `AppConfig.CLIENT_URL`.
4. Don't pass non-string `variables`.
