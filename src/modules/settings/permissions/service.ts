import { Session } from "@cache";
import { PermissionRepository, RoleRepository, UserRepository } from "@database";
import { injectable, NotFoundError, UnprocessableEntityError } from "@fastify-libs";
import { t } from "@i18n";
import { DatatableType, PaginationResponse, PermissionList } from "@types";

@injectable()
export class PermissionService {
	async findAll(query: DatatableType): Promise<PaginationResponse<PermissionList>> {
		return await PermissionRepository().findAll(query);
	}

	async findOne(id: string): Promise<PermissionList> {
		const permission = await PermissionRepository().findById(id);
		if (!permission) {
			throw new NotFoundError(t("settings.permissions.notFound"));
		}
		return permission;
	}

	/** Each entry in `name` is an action; the stored name is `"<group> <action>"`, as the seeder writes it. */
	async create(data: { group: string; name: string[] }): Promise<void> {
		const names = [...new Set(data.name.map((action) => `${data.group} ${action}`))];
		const existing = await PermissionRepository().findExistingByNames(names);
		if (existing.length > 0) {
			throw new UnprocessableEntityError(t("auth.validationError"), [
				{
					field: "name",
					message: t("settings.permissions.nameExists", {
						name: existing.map((permission) => permission.name).join(", "),
					}),
				},
			]);
		}

		await PermissionRepository().createMany(names.map((name) => ({ name, group: data.group })));
	}

	/** `name` is stored verbatim, so it must be the full `"<group> <action>"` string. */
	async update(id: string, data: { name: string; group: string }): Promise<void> {
		await this.findOne(id);
		if (await PermissionRepository().findByName(data.name, id)) {
			throw new UnprocessableEntityError(t("auth.validationError"), [
				{ field: "name", message: t("settings.permissions.nameExists", { name: data.name }) },
			]);
		}

		await PermissionRepository().update(id, data);
		await Session.forgetUsers(await this.holdersOf(id));
	}

	async delete(id: string): Promise<void> {
		await this.findOne(id);
		const holders = await this.holdersOf(id);
		await PermissionRepository().delete(id);
		await Session.forgetUsers(holders);
	}

	private async holdersOf(permissionId: string): Promise<string[]> {
		const roleIds = await RoleRepository().findIdsByPermissionId(permissionId);
		return await UserRepository().findIdsByRoleIds(roleIds);
	}
}
