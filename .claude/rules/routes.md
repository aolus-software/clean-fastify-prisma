# Rule: Route structure and the live route map

## Convention: flat, resource-named, composed by folder

There is no global prefix and no URL versioning. Every module is registered explicitly in the
`routes` array of `src/app.ts` with its prefix, and the module folder mirrors that prefix:
`src/modules/settings/roles/index.ts` is registered at `/settings/roles`. `src/modules/index.ts` serves
the root (`/`, `/live`).

Resource folders are **plural, kebab-case**: `users`, `roles`, `permissions`, `select-options`.
Changing a prefix renames the URL — a breaking change that moves this map and
`docs/API_DOCUMENTATION.md` with it.

Collection routes register the path `""`, not `"/"` (which would add a trailing slash). Access is
enforced by the route's `onRequest` guard, never by the path: `/settings/**` is not a security
boundary ([rbac.md](./rbac.md)).

## Method conventions

| Operation | Verb + path | Success |
| --------- | ----------- | ------- |
| list      | `GET ""` | 200 |
| create    | `POST ""` | 201, `data: null` |
| detail    | `GET "/:id"` | 200 |
| update    | `PATCH "/:id"` | 200, `data: null` |
| delete    | `DELETE "/:id"` | 200, `data: null` |

**`PATCH`, never `PUT`.** A sub-resource action is a trailing segment on the id
(`POST /settings/users/:id/reset-password`). `:id` params are validated as UUIDs (422 otherwise).

## Current route map

"auth" = the module's `authenticate` hook runs. Guard column is the route-level `onRequest`.

```
# Root (src/modules/index.ts, src/modules/health) — tags ["General"]
GET    /                                              public
GET    /health                                        public  (503 if Postgres or Redis is down)
GET    /live                                          public

# Auth (src/modules/auth) — tags ["Auth"]
POST   /auth/login                                    public
POST   /auth/register                                 public
POST   /auth/resend-verification                      public  (always 200)
POST   /auth/verify-email                             public
POST   /auth/forgot-password                          public  (always 200)
POST   /auth/reset-password                           public
POST   /auth/refresh                                  public  (refresh token in body; rotates the pair; owner decision O3)

# Profile (src/modules/profile) — tags ["Profile"], auth
GET    /profile                                       own identity
PATCH  /profile                                       own identity
PATCH  /profile/password                              own identity  (body currentPassword, newPassword; 422 on currentPassword; 200 null; revokes sessions; owner decision O5)

# Settings / Users (src/modules/settings/users) — tags ["Settings/Users"], auth
GET    /settings/users                                PermissionGuard(["user list"])
POST   /settings/users                                PermissionGuard(["user create"])
GET    /settings/users/:id                            PermissionGuard(["user detail"])
PATCH  /settings/users/:id                            PermissionGuard(["user edit"])
DELETE /settings/users/:id                            PermissionGuard(["user delete"])
POST   /settings/users/:id/reset-password             RoleGuard(["superuser"])
POST   /settings/users/:id/send-verification-email    PermissionGuard(["user create"])
POST   /settings/users/:id/send-reset-password-email  PermissionGuard(["user create"])

# Settings / Roles (src/modules/settings/roles) — tags ["Settings/Roles"], auth
GET    /settings/roles                                PermissionGuard(["role list"])
POST   /settings/roles                                PermissionGuard(["role create"])
GET    /settings/roles/:id                            PermissionGuard(["role detail"])
PATCH  /settings/roles/:id                            PermissionGuard(["role edit"])
DELETE /settings/roles/:id                            PermissionGuard(["role delete"])

# Settings / Permissions (src/modules/settings/permissions) — tags ["Settings/Permissions"], auth
GET    /settings/permissions                          PermissionGuard(["permission list"])
POST   /settings/permissions                          PermissionGuard(["permission create"])
GET    /settings/permissions/:id                      PermissionGuard(["permission detail"])
PATCH  /settings/permissions/:id                      PermissionGuard(["permission edit"])
DELETE /settings/permissions/:id                      PermissionGuard(["permission delete"])

# Settings / Select Options (src/modules/settings/select-options) — tags ["Settings/Select Options"], auth
GET    /settings/select-options/permissions           RoleGuard(["superuser"])
GET    /settings/select-options/roles                 RoleGuard(["superuser"])
```

Plus `GET /docs` and `GET /docs/openapi.json` when `ENABLE_API_DOCS=true` ([openapi.md](./openapi.md)).

**Keep this map current** — adding, renaming, or re-gating a route updates it in the same change.

## Known quirks, kept deliberately

- `POST /settings/permissions` takes `name: string[]` of **actions** and stores `"<group> <action>"`
  for each; `PATCH /settings/permissions/:id` stores `name` **verbatim**, so the caller sends the full
  string. Matches the base contract; the route description says so.
- The `send-*-email` actions reuse `user create`; no `user resend` permission is seeded.

## Registering a route

1. Add it to `src/modules/<feature>/index.ts` ([handlers.md](./handlers.md)); a new module is also
   added to the `routes` array in `src/app.ts` ([modules.md](./modules.md)).
2. Add it to the map above with its guard.
