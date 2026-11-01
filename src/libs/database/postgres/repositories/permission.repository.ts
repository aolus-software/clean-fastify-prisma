import { Prisma } from "@prisma-generated";
import type {
	DatatableType,
	FilterField,
	PaginationResponse,
	PermissionList,
	PermissionSelectOptions,
} from "@types";
import { DatatableToolkit } from "@utils/fastify/datatable";

import { db } from "../client";

type TransactionClient = Prisma.TransactionClient;

export const permissionSortableFields = ["id", "name", "group", "createdAt", "updatedAt"] as const;

export const permissionSearchColumns = ["name", "group"] as const;

export const permissionFilterableFields: FilterField[] = [
	"name",
	"group",
	{ field: "createdAt", kind: "date" },
	{ field: "updatedAt", kind: "date" },
];

export const permissionFilterExample: Record<string, string> = {
	name: "user list",
	group: "user",
	createdAt: "2024-01-01,2024-12-31",
	updatedAt: "2024-01-01,2024-12-31",
};

const permissionSelect = {
	id: true,
	name: true,
	group: true,
	createdAt: true,
	updatedAt: true,
} satisfies Prisma.PermissionSelect;

export function PermissionRepository(tx?: TransactionClient) {
	const dbClient = tx || db;

	return {
		async findAll(query: DatatableType): Promise<PaginationResponse<PermissionList>> {
			const { page, perPage, search, sort, sortDirection, filter } = query;

			DatatableToolkit.assertSort(sort, permissionSortableFields);
			DatatableToolkit.assertFilter(filter, permissionFilterableFields);

			const conditions: Prisma.PermissionWhereInput[] = [];
			if (search) {
				conditions.push({
					OR: [
						{ name: { contains: search, mode: "insensitive" } },
						{ group: { contains: search, mode: "insensitive" } },
					],
				});
			}
			if (filter?.name !== undefined) {
				conditions.push({
					name: { contains: filter.name.toString(), mode: "insensitive" },
				});
			}
			if (filter?.group !== undefined) {
				conditions.push({
					group: { contains: filter.group.toString(), mode: "insensitive" },
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

			const where: Prisma.PermissionWhereInput = { AND: conditions };

			const [data, totalCount] = await Promise.all([
				dbClient.permission.findMany({
					where,
					skip: (page - 1) * perPage,
					take: perPage,
					orderBy: { [sort]: sortDirection },
					select: permissionSelect,
				}),
				dbClient.permission.count({ where }),
			]);

			return { data, meta: { page, limit: perPage, totalCount } };
		},

		async findById(id: string): Promise<PermissionList | null> {
			return dbClient.permission.findUnique({
				where: { id },
				select: permissionSelect,
			});
		},

		async findByName(name: string, excludeId?: string): Promise<{ id: string } | null> {
			return dbClient.permission.findFirst({
				where: { name, ...(excludeId ? { id: { not: excludeId } } : {}) },
				select: { id: true },
			});
		},

		async findExistingByNames(names: string[]): Promise<{ name: string }[]> {
			return dbClient.permission.findMany({
				where: { name: { in: names } },
				select: { name: true },
			});
		},

		async countByIds(ids: string[]): Promise<number> {
			if (ids.length === 0) return 0;
			return dbClient.permission.count({ where: { id: { in: ids } } });
		},

		async createMany(data: { name: string; group: string }[]): Promise<void> {
			await dbClient.permission.createMany({ data });
		},

		async update(id: string, data: { name: string; group: string }): Promise<void> {
			await dbClient.permission.update({ where: { id }, data });
		},

		async delete(id: string): Promise<void> {
			await dbClient.permission.delete({ where: { id } });
		},

		async getSelectOptions(): Promise<PermissionSelectOptions[]> {
			const permissions = await dbClient.permission.findMany({
				orderBy: [{ group: "asc" }, { name: "asc" }],
				select: { id: true, name: true, group: true },
			});

			const grouped = new Map<string, PermissionSelectOptions["permissions"]>();
			for (const permission of permissions) {
				const list = grouped.get(permission.group) ?? [];
				list.push(permission);
				grouped.set(permission.group, list);
			}

			return Array.from(grouped.entries()).map(([group, list]) => ({
				group,
				permissions: list,
			}));
		},
	};
}
