# Rule: The canonical CRUD service

Five methods matching the five routes in [handlers-crud.md](./handlers-crud.md).
`src/modules/settings/roles/service.ts` is the reference.

```ts
findAll(query: DatatableType): Promise<PaginationResponse<XList>>
findOne(id: string): Promise<XDetail>
create(data: XCreate): Promise<void>
update(id: string, data: XUpdate): Promise<void>
delete(id: string): Promise<void>
```

## The service owns the checks

The repository returns `null` for a miss and never checks uniqueness. The service fetches, decides,
then acts:

```ts
async update(id: string, data: RoleInput): Promise<void> {
	await this.findExisting(id);                       // NotFoundError, 404
	await this.assertNameAvailable(data.name, id);     // UnprocessableEntityError, 422
	await this.assertPermissionsExist(data.permissionIds);

	await db.$transaction(async (tx: TransactionClient) => {
		await RoleRepository(tx).update(id, data);
	});
	await Session.forgetUsers(await UserRepository().findIdsByRoleIds([id]));
}
```

- **Uniqueness is 422** (`UnprocessableEntityError`) for user email (`findLiveByEmail`), role name
  (`findByName`) and permission name (`findByName` / `findExistingByNames`).
- **`update` passes its own id as `excludeId`** so saving without renaming does not collide with itself.
- **Related ids are verified**: `roleIds` / `permissionIds` are de-duplicated and counted with
  `countByIds`; a mismatch is a 422 on that field.
- **Multi-table writes are one transaction**, opened here.
- **`findOne` turns `null` into `NotFoundError`**, so the handler has no null branch. Non-CRUD methods
  that need the row (`resetPassword`, `sendVerificationEmail`) check existence the same way.

## Per-entity notes

- **Users**: `create` hashes the password with `Hash.generateHash`; `update` is a full replace of
  name, email, status, remark and roles and never touches the password; `delete` soft-deletes. Admin
  password reset is a separate method behind a superuser-only route.
- **Roles**: hard delete; `RolePermission` and `UserRole` rows cascade.
- **Permissions**: `create` composes `"<group> <action>"` for each action in `name[]`, the seeder's
  format; `update` stores `name` verbatim; delete cascades its grants.

## Checklist

- [ ] Five methods named `findAll` / `findOne` / `create` / `update` / `delete`, explicit types.
- [ ] Existence and uniqueness checks in the service; 404 and 422.
- [ ] `update` passes `excludeId`.
- [ ] Hashing in the service; multi-table writes in `db.$transaction` with `XRepository(tx)`.
- [ ] Cache invalidated through `Session` (`@cache`) after the write ([services.md](./services.md)).
