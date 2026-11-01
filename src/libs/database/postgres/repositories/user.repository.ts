import { Prisma, UserStatus } from "@prisma-generated";
import type {
	DatatableType,
	FilterField,
	PaginationResponse,
	UserCreate,
	UserDetail,
	UserForAuth,
	UserInformation,
	UserList,
	UserUpdate,
} from "@types";
import { DatatableToolkit } from "@utils/fastify/datatable";

import { db } from "../client";

type TransactionClient = Prisma.TransactionClient;

export const userSortableFields = [
	"id",
	"name",
	"email",
	"status",
	"createdAt",
	"updatedAt",
] as const;

export const userSearchColumns = ["name", "email", "status"] as const;

export const userFilterableFields: FilterField[] = [
	{ field: "status", enum: Object.values(UserStatus) },
	"name",
	"email",
	{ field: "roleId", kind: "id" },
	{ field: "createdAt", kind: "date" },
	{ field: "updatedAt", kind: "date" },
];

export const userFilterExample: Record<string, string> = {
	name: "jane",
	email: "jane@example.com",
	roleId: "550e8400-e29b-41d4-a716-446655440000",
	createdAt: "2024-01-01,2024-12-31",
	updatedAt: "2024-01-01,2024-12-31",
};

const listSelect = {
	id: true,
	name: true,
	email: true,
	status: true,
	remark: true,
	createdAt: true,
	updatedAt: true,
	userRoles: { select: { role: { select: { id: true, name: true } } } },
} satisfies Prisma.UserSelect;

export function UserRepository(tx?: TransactionClient) {
	const dbClient = tx || db;

	return {
		async findAll(query: DatatableType): Promise<PaginationResponse<UserList>> {
			const { page, perPage, search, sort, sortDirection, filter } = query;

			DatatableToolkit.assertSort(sort, userSortableFields);
			DatatableToolkit.assertFilter(filter, userFilterableFields);

			const conditions: Prisma.UserWhereInput[] = [{ deletedAt: null }];

			if (search) {
				const statuses = Object.values(UserStatus).filter((status) =>
					status.includes(search.toUpperCase()),
				);
				conditions.push({
					OR: [
						{ name: { contains: search, mode: "insensitive" } },
						{ email: { contains: search, mode: "insensitive" } },
						...(statuses.length > 0 ? [{ status: { in: statuses } }] : []),
					],
				});
			}

			if (filter?.status !== undefined) {
				conditions.push({
					status: {
						in: DatatableToolkit.filterValues(filter.status) as UserStatus[],
					},
				});
			}
			if (filter?.name !== undefined) {
				conditions.push({
					name: { contains: filter.name.toString(), mode: "insensitive" },
				});
			}
			if (filter?.email !== undefined) {
				conditions.push({
					email: { contains: filter.email.toString(), mode: "insensitive" },
				});
			}
			if (filter?.roleId !== undefined) {
				const roleIds = DatatableToolkit.filterIds(filter.roleId, "roleId");
				conditions.push({ userRoles: { some: { roleId: { in: roleIds } } } });
			}
			if (filter?.createdAt !== undefined) {
				const { from, to } = DatatableToolkit.filterDateRange(filter.createdAt, "createdAt");
				conditions.push({ createdAt: { gte: from, lte: to } });
			}
			if (filter?.updatedAt !== undefined) {
				const { from, to } = DatatableToolkit.filterDateRange(filter.updatedAt, "updatedAt");
				conditions.push({ updatedAt: { gte: from, lte: to } });
			}

			const where: Prisma.UserWhereInput = { AND: conditions };

			const [users, totalCount] = await Promise.all([
				dbClient.user.findMany({
					where,
					skip: (page - 1) * perPage,
					take: perPage,
					orderBy: { [sort]: sortDirection },
					select: listSelect,
				}),
				dbClient.user.count({ where }),
			]);

			return {
				data: users.map((user) => ({
					id: user.id,
					name: user.name,
					email: user.email,
					status: user.status,
					remark: user.remark,
					roles: user.userRoles.map((userRole) => userRole.role.name),
					createdAt: user.createdAt,
					updatedAt: user.updatedAt,
				})),
				meta: { page, limit: perPage, totalCount },
			};
		},

		async findById(id: string): Promise<{ id: string; name: string; email: string } | null> {
			return dbClient.user.findFirst({
				where: { id, deletedAt: null },
				select: { id: true, name: true, email: true },
			});
		},

		async getDetail(id: string): Promise<UserDetail | null> {
			const user = await dbClient.user.findFirst({
				where: { id, deletedAt: null },
				select: listSelect,
			});
			if (!user) return null;

			return {
				id: user.id,
				name: user.name,
				email: user.email,
				status: user.status,
				remark: user.remark,
				roles: user.userRoles.map((userRole) => userRole.role),
				createdAt: user.createdAt,
				updatedAt: user.updatedAt,
			};
		},

		async findByEmail(email: string): Promise<UserForAuth | null> {
			return dbClient.user.findFirst({
				where: { email, deletedAt: null },
				select: {
					id: true,
					name: true,
					email: true,
					password: true,
					status: true,
					emailVerifiedAt: true,
				},
			});
		},

		async findLiveByEmail(email: string, excludeId?: string): Promise<{ id: string } | null> {
			return dbClient.user.findFirst({
				where: {
					email,
					deletedAt: null,
					...(excludeId ? { id: { not: excludeId } } : {}),
				},
				select: { id: true },
			});
		},

		async findPasswordHash(id: string): Promise<string | null> {
			const user = await dbClient.user.findFirst({
				where: { id, deletedAt: null },
				select: { password: true },
			});
			return user?.password ?? null;
		},

		/**
		 * The identity behind every authenticated request. Only active,
		 * non-deleted users resolve; anything else is treated as logged out.
		 */
		async findUserInformation(id: string): Promise<UserInformation | null> {
			const user = await dbClient.user.findFirst({
				where: { id, deletedAt: null, status: UserStatus.ACTIVE },
				select: {
					id: true,
					name: true,
					email: true,
					userRoles: {
						select: {
							role: {
								select: {
									name: true,
									rolePermissions: {
										select: { permission: { select: { name: true } } },
									},
								},
							},
						},
					},
				},
			});
			if (!user) return null;

			const permissions = new Set<string>();
			for (const userRole of user.userRoles) {
				for (const rolePermission of userRole.role.rolePermissions) {
					permissions.add(rolePermission.permission.name);
				}
			}

			return {
				id: user.id,
				name: user.name,
				email: user.email,
				roles: user.userRoles.map((userRole) => userRole.role.name),
				permissions: Array.from(permissions),
			};
		},

		async findIdsByRoleIds(roleIds: string[]): Promise<string[]> {
			if (roleIds.length === 0) return [];
			const rows = await dbClient.userRole.findMany({
				where: { roleId: { in: roleIds } },
				select: { userId: true },
				distinct: ["userId"],
			});
			return rows.map((row) => row.userId);
		},

		async create(
			data: Omit<UserCreate, "roleIds"> & {
				roleIds?: string[];
				emailVerifiedAt?: Date | null;
			},
		): Promise<{ id: string; name: string; email: string }> {
			const { roleIds = [], ...userData } = data;
			return dbClient.user.create({
				data: {
					...userData,
					userRoles: {
						create: Array.from(new Set(roleIds)).map((roleId) => ({ roleId })),
					},
				},
				select: { id: true, name: true, email: true },
			});
		},

		async update(id: string, data: Partial<UserUpdate>): Promise<void> {
			const { roleIds, ...userData } = data;
			await dbClient.user.update({ where: { id }, data: userData });

			if (roleIds !== undefined) {
				await dbClient.userRole.deleteMany({ where: { userId: id } });
				if (roleIds.length > 0) {
					await dbClient.userRole.createMany({
						data: Array.from(new Set(roleIds)).map((roleId) => ({
							userId: id,
							roleId,
						})),
					});
				}
			}
		},

		async updatePassword(id: string, hashedPassword: string): Promise<void> {
			await dbClient.user.update({
				where: { id },
				data: { password: hashedPassword },
			});
		},

		async markEmailVerified(id: string): Promise<void> {
			await dbClient.user.update({
				where: { id },
				data: { emailVerifiedAt: new Date() },
			});
		},

		async softDelete(id: string): Promise<void> {
			await dbClient.user.update({
				where: { id },
				data: { deletedAt: new Date() },
			});
		},
	};
}
