import { Session } from "@cache";
import { db, RoleRepository, type TransactionClient, UserRepository, UserStatus } from "@database";
import { injectable, NotFoundError, UnprocessableEntityError } from "@fastify-libs";
import { t } from "@i18n";
import { AuthMailService } from "@libs/mail/auth-mail.service";
import {
	DatatableType,
	PaginationResponse,
	UserCreate,
	UserDetail,
	UserList,
	UserUpdate,
} from "@types";
import { Hash } from "@utils";

@injectable()
export class UserService {
	async findAll(query: DatatableType): Promise<PaginationResponse<UserList>> {
		return await UserRepository().findAll(query);
	}

	async findOne(id: string): Promise<UserDetail> {
		const user = await UserRepository().getDetail(id);
		if (!user) {
			throw new NotFoundError(t("settings.users.notFound"));
		}
		return user;
	}

	async create(data: UserCreate): Promise<void> {
		await this.assertEmailAvailable(data.email);
		await this.assertRolesExist(data.roleIds);

		const password = await Hash.generateHash(data.password);
		await db.$transaction(async (tx: TransactionClient) => {
			await UserRepository(tx).create({ ...data, password });
		});
	}

	async update(id: string, data: UserUpdate): Promise<void> {
		await this.findLive(id);
		await this.assertEmailAvailable(data.email, id);
		await this.assertRolesExist(data.roleIds);

		await db.$transaction(async (tx: TransactionClient) => {
			await UserRepository(tx).update(id, data);
		});
		if (data.status === UserStatus.ACTIVE) {
			await Session.forgetUsers([id]);
		} else {
			await Session.revokeSessions(id);
		}
	}

	async delete(id: string): Promise<void> {
		await this.findLive(id);
		await UserRepository().softDelete(id);
		await Session.revokeSessions(id);
	}

	async resetPassword(id: string, newPassword: string): Promise<void> {
		await this.findLive(id);
		await UserRepository().updatePassword(id, await Hash.generateHash(newPassword));
		await Session.revokeSessions(id);
	}

	async sendVerificationEmail(id: string): Promise<void> {
		await AuthMailService.sendVerificationEmail(await this.findLive(id));
	}

	async sendResetPasswordEmail(id: string): Promise<void> {
		await AuthMailService.sendResetPasswordEmail(await this.findLive(id));
	}

	private async findLive(id: string): Promise<{ id: string; name: string; email: string }> {
		const user = await UserRepository().findById(id);
		if (!user) {
			throw new NotFoundError(t("settings.users.notFound"));
		}
		return user;
	}

	private async assertEmailAvailable(email: string, excludeId?: string): Promise<void> {
		if (await UserRepository().findLiveByEmail(email, excludeId)) {
			throw new UnprocessableEntityError(t("auth.validationError"), [
				{ field: "email", message: t("settings.users.emailExists") },
			]);
		}
	}

	private async assertRolesExist(roleIds: string[]): Promise<void> {
		const unique = [...new Set(roleIds)];
		if ((await RoleRepository().countByIds(unique)) !== unique.length) {
			throw new UnprocessableEntityError(t("auth.validationError"), [
				{ field: "roleIds", message: t("settings.users.invalidRoles") },
			]);
		}
	}
}
