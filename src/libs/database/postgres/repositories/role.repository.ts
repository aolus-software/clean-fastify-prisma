import type { Prisma } from "@prisma-generated";

import type { RoleDetail, RoleList } from "../../../types/repositories/role";
import { db } from "../client";

type TransactionClient = Prisma.TransactionClient;

export function RoleRepository(tx?: TransactionClient) {
	const dbClient = tx ?? db;

	return {
		async findAll(params: {
			page: number;
			limit: number;
			sort_by: string;
			sort_order: "asc" | "desc";
			search?: string;
		}): Promise<{ data: RoleList[]; total: number }> {
			const { page, limit, sort_by, sort_order, search } = params;
			const skip = (page - 1) * limit;

			const where = {
				...(search && {
					name: { contains: search, mode: "insensitive" as const },
				}),
			};

			const orderBy: Record<string, "asc" | "desc"> = { [sort_by]: sort_order };

			const [roles, total] = await Promise.all([
				dbClient.role.findMany({
					where,
					skip,
					take: limit,
					orderBy,
					select: {
						id: true,
						name: true,
						created_at: true,
						updated_at: true,
					},
				}),
				dbClient.role.count({ where }),
			]);

			return { data: roles, total };
		},

		async findById(id: string): Promise<RoleDetail | null> {
			const role = await dbClient.role.findUnique({
				where: { id },
				select: {
					id: true,
					name: true,
					created_at: true,
					updated_at: true,
				},
			});

			if (!role) return null;

			const allPermissions = await dbClient.permission.findMany({
				orderBy: [{ group: "asc" }, { name: "asc" }],
				select: { id: true, name: true, group: true },
			});

			const assignedPermissionIds = await dbClient.rolePermission.findMany({
				where: { role_id: id },
				select: { permission_id: true },
			});

			const assignedIds = new Set(
				assignedPermissionIds.map((rp: { permission_id: string }) => rp.permission_id),
			);

			const groupedPermissions = new Map<
				string,
				{ id: string; name: string; is_assigned: boolean }[]
			>();

			for (const permission of allPermissions) {
				if (!groupedPermissions.has(permission.group)) {
					groupedPermissions.set(permission.group, []);
				}
				groupedPermissions.get(permission.group)!.push({
					id: permission.id,
					name: permission.name,
					is_assigned: assignedIds.has(permission.id),
				});
			}

			const permissions = Array.from(groupedPermissions.entries()).map(([group, names]) => ({
				group,
				names,
			}));

			return {
				id: role.id,
				name: role.name,
				created_at: role.created_at,
				updated_at: role.updated_at,
				permissions,
			};
		},

		async create(data: { name: string; permission_ids?: string[] }): Promise<string> {
			const { name, permission_ids } = data;

			const role = await dbClient.role.create({
				data: {
					name,
					...(permission_ids &&
						permission_ids.length > 0 && {
							role_permissions: {
								create: permission_ids.map((permission_id) => ({ permission_id })),
							},
						}),
				},
			});

			return role.id;
		},

		async update(id: string, data: { name?: string; permission_ids?: string[] }): Promise<void> {
			const { name, permission_ids } = data;

			const executeUpdate = async (client: typeof dbClient) => {
				if (name !== undefined) {
					await client.role.update({ where: { id }, data: { name } });
				}

				if (permission_ids !== undefined) {
					await client.rolePermission.deleteMany({ where: { role_id: id } });

					if (permission_ids.length > 0) {
						await client.rolePermission.createMany({
							data: permission_ids.map((permission_id) => ({
								role_id: id,
								permission_id,
							})),
						});
					}
				}
			};

			if (tx) {
				await executeUpdate(dbClient);
			} else {
				await db.$transaction(async (transaction: TransactionClient) => {
					await executeUpdate(transaction);
				});
			}
		},

		async delete(id: string): Promise<void> {
			await dbClient.role.delete({ where: { id } });
		},

		async nameExists(name: string, excludeId?: string): Promise<boolean> {
			const count = await dbClient.role.count({
				where: { name, ...(excludeId && { id: { not: excludeId } }) },
			});
			return count > 0;
		},

		async getSelectOptions(): Promise<{ id: string; name: string }[]> {
			return await dbClient.role.findMany({
				orderBy: { name: "asc" },
				select: { id: true, name: true },
			});
		},
	};
}
