import type { Prisma } from "@prisma-generated";

import { db } from "../client";
import type {
	UserCreate,
	UserDetail,
	UserForAuth,
	UserInformation,
	UserList,
	UserStatusEnum,
} from "../../../types/repositories/user";

type TransactionClient = Prisma.TransactionClient;

export function UserRepository(tx?: TransactionClient) {
	const dbClient = tx ?? db;

	return {
		async findByEmail(email: string): Promise<UserForAuth | null> {
			const user = await dbClient.user.findFirst({
				where: { email, deleted_at: null },
				select: {
					id: true,
					name: true,
					email: true,
					password: true,
					status: true,
					email_verified_at: true,
				},
			});

			if (!user) return null;

			return {
				id: user.id,
				name: user.name,
				email: user.email,
				password: user.password,
				status: user.status as UserStatusEnum | null,
				email_verified_at: user.email_verified_at,
			};
		},

		async findUserInformation(userId: string): Promise<UserInformation | null> {
			const user = await dbClient.user.findFirst({
				where: { id: userId, deleted_at: null },
				select: {
					id: true,
					name: true,
					email: true,
					user_roles: {
						select: {
							role: {
								select: {
									name: true,
									role_permissions: {
										select: {
											permission: {
												select: {
													name: true,
													group: true,
												},
											},
										},
									},
								},
							},
						},
					},
				},
			});

			if (!user) return null;

			const roles = user.user_roles.map(
				(ur: { role: { name: string } }) => ur.role.name,
			);

			const permissionsMap = new Map<string, Set<string>>();
			for (const userRole of user.user_roles) {
				for (const rolePermission of userRole.role.role_permissions) {
					const { group, name } = rolePermission.permission;
					if (!permissionsMap.has(group)) {
						permissionsMap.set(group, new Set());
					}
					permissionsMap.get(group)!.add(name);
				}
			}

			const permissions = Array.from(permissionsMap.entries()).map(
				([name, perms]) => ({
					name,
					permissions: Array.from(perms),
				}),
			);

			return {
				id: user.id,
				name: user.name,
				email: user.email,
				roles,
				permissions,
			};
		},

		async findAll(params: {
			page: number;
			limit: number;
			sort_by: string;
			sort_order: "asc" | "desc";
			search?: string;
		}): Promise<{ data: UserList[]; total: number }> {
			const { page, limit, sort_by, sort_order, search } = params;
			const skip = (page - 1) * limit;

			const where = {
				deleted_at: null,
				...(search && {
					OR: [
						{ name: { contains: search, mode: "insensitive" as const } },
						{ email: { contains: search, mode: "insensitive" as const } },
					],
				}),
			};

			const orderBy: Record<string, "asc" | "desc"> = { [sort_by]: sort_order };

			const [users, total] = await Promise.all([
				dbClient.user.findMany({
					where,
					skip,
					take: limit,
					orderBy,
					select: {
						id: true,
						name: true,
						email: true,
						status: true,
						created_at: true,
						updated_at: true,
						user_roles: {
							select: {
								role: { select: { name: true } },
							},
						},
					},
				}),
				dbClient.user.count({ where }),
			]);

			const data = users.map(
				(user: {
					id: string;
					name: string;
					email: string;
					status: string;
					created_at: Date;
					updated_at: Date;
					user_roles: { role: { name: string } }[];
				}) => ({
					id: user.id,
					name: user.name,
					email: user.email,
					status: user.status as UserStatusEnum | null,
					roles: user.user_roles.map(
						(ur: { role: { name: string } }) => ur.role.name,
					),
					created_at: user.created_at,
					updated_at: user.updated_at,
				}),
			);

			return { data, total };
		},

		async findById(id: string): Promise<UserDetail | null> {
			const user = await dbClient.user.findFirst({
				where: { id, deleted_at: null },
				select: {
					id: true,
					name: true,
					email: true,
					status: true,
					remark: true,
					created_at: true,
					updated_at: true,
					user_roles: {
						select: {
							role: { select: { id: true, name: true } },
						},
					},
				},
			});

			if (!user) return null;

			return {
				id: user.id,
				name: user.name,
				email: user.email,
				status: user.status as UserStatusEnum | null,
				remark: user.remark,
				roles: user.user_roles.map(
					(ur: { role: { id: string; name: string } }) => ur.role,
				),
				created_at: user.created_at,
				updated_at: user.updated_at,
			};
		},

		async create(data: UserCreate): Promise<string> {
			const { role_ids, ...userData } = data;

			const user = await dbClient.user.create({
				data: {
					...userData,
					...(role_ids &&
						role_ids.length > 0 && {
							user_roles: {
								create: role_ids.map((role_id) => ({ role_id })),
							},
						}),
				},
			});

			return user.id;
		},

		async update(
			id: string,
			data: Partial<Omit<UserCreate, "password">> & { password?: string },
		): Promise<void> {
			const { role_ids, ...userData } = data;

			const executeUpdate = async (client: typeof dbClient) => {
				await client.user.update({
					where: { id },
					data: userData,
				});

				if (role_ids !== undefined) {
					await client.userRole.deleteMany({ where: { user_id: id } });

					if (role_ids.length > 0) {
						await client.userRole.createMany({
							data: role_ids.map((role_id) => ({ user_id: id, role_id })),
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

		async softDelete(id: string): Promise<void> {
			await dbClient.user.update({
				where: { id },
				data: { deleted_at: new Date() },
			});
		},

		async emailExists(email: string, excludeId?: string): Promise<boolean> {
			const count = await dbClient.user.count({
				where: {
					email,
					deleted_at: null,
					...(excludeId && { id: { not: excludeId } }),
				},
			});
			return count > 0;
		},

		async updatePassword(userId: string, hashedPassword: string): Promise<void> {
			await dbClient.user.update({
				where: { id: userId },
				data: { password: hashedPassword },
			});
		},

		async updateEmailVerifiedAt(userId: string): Promise<void> {
			await dbClient.user.update({
				where: { id: userId },
				data: { email_verified_at: new Date() },
			});
		},
	};
}
