import { db, RoleRepository, type TransactionClient, UserRepository } from "@database";
import { injectable, UnprocessableEntityError } from "@fastify-libs";
import {
	DatatableType,
	PaginationResponse,
	UserDetail,
	UserList,
	UserStatusEnum,
} from "@types";
import { Hash } from "@utils";

@injectable()
export class UserService {
	async findAll(queryParam: DatatableType): Promise<PaginationResponse<UserList>> {
		const { data, total } = await UserRepository().findAll({
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

	async create(data: {
		name: string;
		email: string;
		password: string;
		role_ids: string[];
		remark?: string;
		status?: UserStatusEnum;
	}): Promise<void> {
		const emailExists = await UserRepository().emailExists(data.email);
		if (emailExists) {
			throw new UnprocessableEntityError("Validation error", [
				{ field: "email", message: "Email already exists" },
			]);
		}

		const roles = await RoleRepository().findAll({
			page: 1,
			limit: data.role_ids.length,
			sort_by: "created_at",
			sort_order: "desc",
		});

		const validIds = roles.data.map((r) => r.id);
		const allValid = data.role_ids.every((id) => validIds.includes(id));
		if (!allValid) {
			throw new UnprocessableEntityError("Validation error", [
				{ field: "role_ids", message: "One or more roles are invalid" },
			]);
		}

		const hashedPassword = await Hash.generateHash(data.password);
		await db.$transaction(async (tx: TransactionClient) => {
			await UserRepository(tx).create({
				...data,
				password: hashedPassword,
			});
		});
	}

	async detail(userId: string): Promise<UserDetail> {
		const user = await UserRepository().findById(userId);
		if (!user) {
			throw new UnprocessableEntityError("User not found", [
				{ field: "userId", message: "User not found" },
			]);
		}
		return user;
	}

	async update(
		id: string,
		data: {
			name: string;
			email: string;
			role_ids: string[];
			remark?: string;
			status?: UserStatusEnum;
		},
	): Promise<void> {
		const emailExists = await UserRepository().emailExists(data.email, id);
		if (emailExists) {
			throw new UnprocessableEntityError("Validation error", [
				{ field: "email", message: "Email already exists" },
			]);
		}

		await db.$transaction(async (tx: TransactionClient) => {
			await UserRepository(tx).update(id, data);
		});
	}

	async delete(userId: string): Promise<void> {
		await db.$transaction(async (tx: TransactionClient) => {
			await UserRepository(tx).softDelete(userId);
		});
	}

	async resetPassword(userId: string, data: { password: string }): Promise<void> {
		const hashedPassword = await Hash.generateHash(data.password);
		await db.$transaction(async (tx: TransactionClient) => {
			await UserRepository(tx).updatePassword(userId, hashedPassword);
		});
	}
}
