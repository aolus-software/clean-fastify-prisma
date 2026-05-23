import { db, UserRepository } from "@database";
import { injectable, UnauthorizedError, UnprocessableEntityError } from "@fastify-libs";
import { t } from "@i18n";
import { UserInformation } from "@types";
import { Hash } from "@utils";

@injectable()
export class ProfileService {
	async updateProfile(
		userId: string,
		data: { name: string; email: string; remarks?: string },
	): Promise<UserInformation> {
		const emailExists = await UserRepository().emailExists(data.email, userId);
		if (emailExists) {
			throw new UnprocessableEntityError(t("auth.validationError"), [
				{ field: "email", message: t("auth.emailAlreadyInUse") },
			]);
		}

		await db.user.update({
			where: { id: userId },
			data: {
				name: data.name,
				email: data.email,
				remark: data.remarks ?? null,
			},
		});

		const userInfo = await UserRepository().findUserInformation(userId);
		if (!userInfo) throw new UnauthorizedError(t("auth.userNotFound"));

		return userInfo;
	}

	async updatePassword(
		userId: string,
		data: { password: string; currentPassword: string },
	): Promise<void> {
		const user = await db.user.findFirst({
			where: { id: userId, deleted_at: null },
		});

		if (!user) throw new UnauthorizedError(t("auth.userNotFound"));

		const isPasswordValid = await Hash.compareHash(data.currentPassword, user.password);

		if (!isPasswordValid) {
			throw new UnprocessableEntityError(t("auth.validationError"), [
				{ field: "currentPassword", message: t("profile.currentPasswordIncorrect") },
			]);
		}

		const hashedPassword = await Hash.generateHash(data.password);
		await db.user.update({
			where: { id: userId },
			data: { password: hashedPassword },
		});
	}
}
