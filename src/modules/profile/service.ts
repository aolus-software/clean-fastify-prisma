import { Session } from "@cache";
import { UserRepository } from "@database";
import { injectable, UnauthorizedError, UnprocessableEntityError } from "@fastify-libs";
import { t } from "@i18n";
import { UserInformation } from "@types";
import { Hash } from "@utils";

@injectable()
export class ProfileService {
	async updateProfile(
		userId: string,
		data: { name: string; email: string },
	): Promise<UserInformation> {
		if (await UserRepository().findLiveByEmail(data.email, userId)) {
			throw new UnprocessableEntityError(t("auth.validationError"), [
				{ field: "email", message: t("settings.users.emailExists") },
			]);
		}

		await UserRepository().update(userId, data);
		await Session.forgetUsers([userId]);

		const information = await Session.getUserInformation(userId);
		if (!information) {
			throw new UnauthorizedError(t("auth.userNotFound"));
		}
		return information;
	}

	/** Wrong current password is a 422 on `currentPassword`; success ends every session of the user. */
	async updatePassword(
		userId: string,
		data: { currentPassword: string; newPassword: string },
	): Promise<void> {
		const currentHash = await UserRepository().findPasswordHash(userId);
		if (!currentHash) {
			throw new UnauthorizedError(t("auth.userNotFound"));
		}

		if (!(await Hash.compareHash(data.currentPassword, currentHash))) {
			throw new UnprocessableEntityError(t("auth.validationError"), [
				{ field: "currentPassword", message: t("profile.currentPasswordIncorrect") },
			]);
		}

		await UserRepository().updatePassword(userId, await Hash.generateHash(data.newPassword));
		await Session.revokeSessions(userId);
	}
}
