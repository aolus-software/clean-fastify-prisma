---
description: Stage and commit all current changes following the repo's commit style
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git add:*), Bash(git commit:*), Bash(bun run format:*), Bash(bun run lint:*), Bash(bun run lint\:fix:*), Bash(bun run typecheck:*), Bash(bun run build:*), Bash(bunx --bun prisma migrate deploy:*)
---

Commit the current working-tree changes.

Run these in parallel first to gather context:

- `git status` (no `-uall`)
- `git diff` (staged + unstaged)
- `git log --oneline -20` to match the existing commit-message style (prefixes like `chore:`, `chore(scope):`, `feat:`, `fix:`, `refactor:`, `docs:`, `add:`, `remove:`)

Then:

1. Review the diff and decide the right prefix based on intent (`feat`, `fix`, `chore`, `refactor`, `docs`, `add`, `remove`, `test`). Use a scope when it sharpens the message (`chore(packages):`, `feat(auth):`).
2. Stage files explicitly by path — **never** `git add -A` / `git add .`. Skip `.env`, credentials, generated `dist/`, `prisma/generated/`, `node_modules/`, and any other untracked files that look sensitive or build-output.
3. Write a concise 1–2 sentence message focused on **why**, not a file list. Match the casing and prefix-style of recent commits.
4. Create the commit with a HEREDOC body (no `--amend`, no `--no-verify` unless the special rule below applies).
5. Run `git status` after to confirm the working tree is clean.

If the pre-commit hook fails, **do not** `--amend` — the commit didn't land. Fix the underlying issue, re-stage, and create a new commit. The hook chain in this repo is:

```
bun run format
bun run lint:fix
bun run build
bunx --bun prisma migrate deploy
```

A `prisma migrate deploy` failure usually means a migration is missing or the local database is out of sync — investigate before retrying, don't bypass.

Do not push unless I explicitly ask.

## Special rules

If you already ran `bun run format`, `bun run lint:fix`, `bun run build`, and `bunx --bun prisma migrate deploy` in this session without any error or warning, you may use `--no-verify` to skip the redundant hook run. Otherwise let the hook run.
