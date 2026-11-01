import { Prisma } from "@prisma-generated";
import type { DatatableType, FilterField, PaginationResponse, RoleDetail, RoleList } from "@types";
import { DatatableToolkit } from "@utils/fastify/datatable";

import { db } from "../client";

type TransactionClient = Prisma.TransactionClient;

export const roleSortableFields = ["id", "name", "createdAt", "updatedAt"] as const;

export const roleSearchColumns = ["name"] as const;

export const roleFilterableFields: FilterField[] = [
	"name",
	{ field: "createdAt", kind: "date" },
	{ field: "updatedAt", kind: "date" },
];

export const roleFilterExample: Record<string, string> = {
	name: "admin",
	createdAt: "2024-01-01,2024-12-31",
	updatedAt: "2024-01-01,2024-12-31",
};

const roleSelect = {
	id: true,
	name: true,
	createdAt: true,
	updatedAt: true,
} satisfies Prisma.RoleSelect;

export function RoleRepository(tx?: TransactionClient) {
	const dbClient = tx || db;

	return {
		async findAll(query: DatatableType): Promise<PaginationResponse<RoleList>> {
			const { page, perPage, search, sort, sortDirection, filter } = query;

			DatatableToolkit.assertSort(sort, roleSortableFields);
			DatatableToolkit.assertFilter(filter, roleFilterableFields);

			const conditions: Prisma.RoleWhereInput[] = [];
			if (search) {
				conditions.push({ name: { contains: search, mode: "insensitive" } });
			}
			if (filter?.name !== undefined) {
				conditions.push({
					name: { contains: filter.name.toString(), mode: "insensitive" },
				});
			}
			if (filter?.createdAt !== undefined) {
				const { from, to } = DatatableToolkit.filterDateRange(filter.createdAt, "createdAt");
				conditions.push({ createdAt: { gte: from, lte: to } });
			}
			if (filter?.updatedAt !== undefined) {
				const { from, to } = DatatableToolkit.filterDateRange(filter.updatedAt, "updatedAt");
				conditions.push({ updatedAt: { gte: from, lte: to } });
			}

			const where: Prisma.RoleWhereInput = { AND: conditions };

			const [data, totalCount] = await Promise.all([
				dbClient.role.findMany({
					where,
					skip: (page - 1) * perPage,
					take: perPage,
					orderBy: { [sort]: sortDirection },
					select: roleSelect,
				}),
				dbClient.role.count({ where }),
			]);

			return { data, meta: { page, limit: perPage, totalCount } };
		},

		async findById(id: string): Promise<RoleList | null> {
			return dbClient.role.findUnique({ where: { id }, select: roleSelect });
		},

		async findByName(name: string, excludeId?: string): Promise<{ id: string } | null> {
			return dbClient.role.findFirst({
				where: { name, ...(excludeId ? { id: { not: excludeId } } : {}) },
				select: { id: true },
			});
		},

		async getDetail(id: string): Promise<RoleDetail | null> {
			const role = await dbClient.role.findUnique({
				where: { id },
				select: {
					...roleSelect,
					rolePermissions: { select: { permissionId: true } },
				},
			});
			if (!role) return null;

			const assigned = new Set(
				role.rolePermissions.map((rolePermission) => rolePermission.permissionId),
			);
			const allPermissions = await dbClient.permission.findMany({
				orderBy: [{ group: "asc" }, { name: "asc" }],
				select: { id: true, name: true, group: true },
			});

			const grouped = new Map<string, { id: string; name: string; isAssigned: boolean }[]>();
			for (const permission of allPermissions) {
				const names = grouped.get(permission.group) ?? [];
				names.push({
					id: permission.id,
					name: permission.name,
					isAssigned: assigned.has(permission.id),
				});
				grouped.set(permission.group, names);
			}

			return {
				id: role.id,
				name: role.name,
				createdAt: role.createdAt,
				updatedAt: role.updatedAt,
				permissions: Array.from(grouped.entries()).map(([group, names]) => ({
					group,
					names,
				})),
			};
		},

		async countByIds(ids: string[]): Promise<number> {
			if (ids.length === 0) return 0;
			return dbClient.role.count({ where: { id: { in: ids } } });
		},

		async findIdsByPermissionId(permissionId: string): Promise<string[]> {
			const rows = await dbClient.rolePermission.findMany({
				where: { permissionId },
				select: { roleId: true },
			});
			return rows.map((row) => row.roleId);
		},

		async create(data: { name: string; permissionIds: string[] }): Promise<{ id: string }> {
			return dbClient.role.create({
				data: {
					name: data.name,
					rolePermissions: {
						create: Array.from(new Set(data.permissionIds)).map((permissionId) => ({
							permissionId,
						})),
					},
				},
				select: { id: true },
			});
		},

		async update(id: string, data: { name: string; permissionIds: string[] }): Promise<void> {
			await dbClient.role.update({ where: { id }, data: { name: data.name } });
			await dbClient.rolePermission.deleteMany({ where: { roleId: id } });
			if (data.permissionIds.length > 0) {
				await dbClient.rolePermission.createMany({
					data: Array.from(new Set(data.permissionIds)).map((permissionId) => ({
						roleId: id,
						permissionId,
					})),
				});
			}
		},

		async delete(id: string): Promise<void> {
			await dbClient.role.delete({ where: { id } });
		},

		async getSelectOptions(): Promise<{ id: string; name: string }[]> {
			return dbClient.role.findMany({
				where: { name: { not: "superuser" } },
				orderBy: { name: "asc" },
				select: { id: true, name: true },
			});
		},
	};
}
