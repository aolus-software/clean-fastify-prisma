import { forgetSelectOptions, Session } from "@cache";
import {
	db,
	PermissionRepository,
	RoleRepository,
	type TransactionClient,
	UserRepository,
} from "@database";
import { injectable, NotFoundError, UnprocessableEntityError } from "@fastify-libs";
import { t } from "@i18n";
import { DatatableType, PaginationResponse, RoleDetail, RoleList } from "@types";

type RoleInput = { name: string; permissionIds: string[] };

@injectable()
export class RoleService {
	async findAll(query: DatatableType): Promise<PaginationResponse<RoleList>> {
		return await RoleRepository().findAll(query);
	}

	async findOne(id: string): Promise<RoleDetail> {
		const role = await RoleRepository().getDetail(id);
		if (!role) {
			throw new NotFoundError(t("settings.roles.notFound"));
		}
		return role;
	}

	async create(data: RoleInput): Promise<void> {
		await this.assertNameAvailable(data.name);
		await this.assertPermissionsExist(data.permissionIds);

		await db.$transaction(async (tx: TransactionClient) => {
			await RoleRepository(tx).create(data);
		});
		await forgetSelectOptions();
	}

	/** Every holder of the role has its cached permissions dropped. */
	async update(id: string, data: RoleInput): Promise<void> {
		await this.findExisting(id);
		await this.assertNameAvailable(data.name, id);
		await this.assertPermissionsExist(data.permissionIds);

		await db.$transaction(async (tx: TransactionClient) => {
			await RoleRepository(tx).update(id, data);
		});
		await Session.forgetUsers(await UserRepository().findIdsByRoleIds([id]));
		await forgetSelectOptions();
	}

	async delete(id: string): Promise<void> {
		await this.findExisting(id);
		const holders = await UserRepository().findIdsByRoleIds([id]);
		await RoleRepository().delete(id);
		await Session.forgetUsers(holders);
		await forgetSelectOptions();
	}

	private async findExisting(id: string): Promise<RoleList> {
		const role = await RoleRepository().findById(id);
		if (!role) {
			throw new NotFoundError(t("settings.roles.notFound"));
		}
		return role;
	}

	private async assertNameAvailable(name: string, excludeId?: string): Promise<void> {
		if (await RoleRepository().findByName(name, excludeId)) {
			throw new UnprocessableEntityError(t("auth.validationError"), [
				{ field: "name", message: t("settings.roles.nameExists", { name }) },
			]);
		}
	}

	private async assertPermissionsExist(permissionIds: string[]): Promise<void> {
		const unique = [...new Set(permissionIds)];
		if ((await PermissionRepository().countByIds(unique)) !== unique.length) {
			throw new UnprocessableEntityError(t("auth.validationError"), [
				{ field: "permissionIds", message: t("settings.roles.invalidPermissions") },
			]);
		}
	}
}
