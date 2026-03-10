import { db, PermissionRepository, RoleRepository, type TransactionClient } from "@database";
import { injectable, UnprocessableEntityError } from "@fastify-libs";
import {
	DatatableType,
	PaginationResponse,
	RoleDetail,
	RoleList,
} from "@types";

@injectable()
export class RoleService {
	async findAll(queryParam: DatatableType): Promise<PaginationResponse<RoleList>> {
		const { data, total } = await RoleRepository().findAll({
			page: queryParam.page,
			limit: queryParam.limit,
			sort_by: queryParam.sort,
			sort_order: queryParam.sortDirection,
			search: queryParam.search ?? undefined,
		});

		return {
			data,
			meta: {
				page: queryParam.page,
				limit: queryParam.limit,
				totalCount: total,
			},
		};
	}

	async create(data: { name: string; permission_ids?: string[] }): Promise<void> {
		if (data.permission_ids && data.permission_ids.length > 0) {
			const { data: permissions } = await PermissionRepository().findAll({
				page: 1,
				limit: data.permission_ids.length,
				sort_by: "created_at",
				sort_order: "desc",
			});

			const validIds = permissions.map((p) => p.id);
			const allValid = data.permission_ids.every((id) => validIds.includes(id));
			if (!allValid) {
				throw new UnprocessableEntityError("Validation error", [
					{ field: "permission_ids", message: "One or more permissions are invalid" },
				]);
			}
		}

		await db.$transaction(async (tx: TransactionClient) => {
			await RoleRepository(tx).create(data);
		});
	}

	async detail(roleId: string): Promise<RoleDetail> {
		const role = await RoleRepository().findById(roleId);
		if (!role) {
			throw new UnprocessableEntityError("Role not found", [
				{ field: "roleId", message: "Role not found" },
			]);
		}
		return role;
	}

	async update(
		id: string,
		data: { name?: string; permission_ids?: string[] },
	): Promise<void> {
		await db.$transaction(async (tx: TransactionClient) => {
			await RoleRepository(tx).update(id, data);
		});
	}

	async delete(roleId: string): Promise<void> {
		await db.$transaction(async (tx: TransactionClient) => {
			await RoleRepository(tx).delete(roleId);
		});
	}
}
