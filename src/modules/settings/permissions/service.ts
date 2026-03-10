import { db, PermissionRepository, type TransactionClient } from "@database";
import { injectable } from "@fastify-libs";
import { DatatableType, PaginationResponse, PermissionList } from "@types";

@injectable()
export class PermissionService {
	async findAll(queryParams: DatatableType): Promise<PaginationResponse<PermissionList>> {
		const { data, total } = await PermissionRepository().findAll({
			page: queryParams.page,
			limit: queryParams.limit,
			sort_by: queryParams.sort,
			sort_order: queryParams.sortDirection,
			search: queryParams.search ?? undefined,
		});

		return {
			data,
			meta: {
				page: queryParams.page,
				limit: queryParams.limit,
				totalCount: total,
			},
		};
	}

	async create(data: { group: string; name: string[] }): Promise<void> {
		await db.$transaction(async (tx: TransactionClient) => {
			await PermissionRepository(tx).createMany(
				data.name.map((name) => ({ name, group: data.group })),
			);
		});
	}

	async detail(permissionId: string): Promise<PermissionList> {
		const permission = await PermissionRepository().findById(permissionId);
		if (!permission) {
			throw new Error("Permission not found");
		}
		return permission as PermissionList;
	}

	async update(permissionId: string, data: { name: string; group: string }): Promise<void> {
		await db.$transaction(async (tx: TransactionClient) => {
			await PermissionRepository(tx).update(permissionId, data);
		});
	}

	async delete(permissionId: string): Promise<void> {
		await db.$transaction(async (tx: TransactionClient) => {
			await PermissionRepository(tx).delete(permissionId);
		});
	}
}
