import type { Prisma } from "@prisma-generated";

import type {
	PermissionList,
	PermissionSelectOptions,
} from "../../../types/repositories/permission";
import { db } from "../client";

type TransactionClient = Prisma.TransactionClient;

export function PermissionRepository(tx?: TransactionClient) {
	const dbClient = tx ?? db;

	return {
		async findAll(params: {
			page: number;
			limit: number;
			sort_by: string;
			sort_order: "asc" | "desc";
			search?: string;
		}): Promise<{ data: PermissionList[]; total: number }> {
			const { page, limit, sort_by, sort_order, search } = params;
			const skip = (page - 1) * limit;

			const where = {
				...(search && {
					OR: [
						{ name: { contains: search, mode: "insensitive" as const } },
						{ group: { contains: search, mode: "insensitive" as const } },
					],
				}),
			};

			const orderBy: Record<string, "asc" | "desc"> = { [sort_by]: sort_order };

			const [permissions, total] = await Promise.all([
				dbClient.permission.findMany({
					where,
					skip,
					take: limit,
					orderBy,
					select: {
						id: true,
						name: true,
						group: true,
						created_at: true,
						updated_at: true,
					},
				}),
				dbClient.permission.count({ where }),
			]);

			return { data: permissions, total };
		},

		async findById(id: string): Promise<{ id: string; name: string; group: string } | null> {
			return await dbClient.permission.findUnique({
				where: { id },
				select: { id: true, name: true, group: true },
			});
		},

		async create(data: { name: string; group: string }): Promise<string> {
			const permission = await dbClient.permission.create({ data });
			return permission.id;
		},

		async createMany(data: { name: string; group: string }[]): Promise<void> {
			await dbClient.permission.createMany({ data });
		},

		async update(id: string, data: { name?: string; group?: string }): Promise<void> {
			await dbClient.permission.update({ where: { id }, data });
		},

		async delete(id: string): Promise<void> {
			await dbClient.permission.delete({ where: { id } });
		},

		async nameExists(name: string, excludeId?: string): Promise<boolean> {
			const count = await dbClient.permission.count({
				where: { name, ...(excludeId && { id: { not: excludeId } }) },
			});
			return count > 0;
		},

		async getSelectOptions(): Promise<PermissionSelectOptions[]> {
			const permissions = await dbClient.permission.findMany({
				orderBy: [{ group: "asc" }, { name: "asc" }],
				select: { id: true, name: true, group: true },
			});

			const groupedMap = new Map<string, { id: string; name: string; group: string }[]>();

			for (const permission of permissions) {
				if (!groupedMap.has(permission.group)) {
					groupedMap.set(permission.group, []);
				}
				groupedMap.get(permission.group)!.push(permission);
			}

			return Array.from(groupedMap.entries()).map(([group, perms]) => ({
				group,
				permissions: perms,
			}));
		},
	};
}
