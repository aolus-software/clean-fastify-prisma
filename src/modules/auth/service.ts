import { sendEmailQueue } from "@bull/queue/send-email.queue";
import { AppConfig } from "@config";
import {
	db,
	EmailVerificationRepository,
	ForgotPasswordRepository,
	type TransactionClient,
	UserRepository,
} from "@database";
import { injectable, UnprocessableEntityError, verificationTokenLifetime } from "@fastify-libs";
import { t } from "@i18n";
import { UserInformation } from "@types";
import { Hash, StrToolkit } from "@utils";

@injectable()
export class AuthService {
	async login(email: string, password: string): Promise<UserInformation> {
		const user = await UserRepository().findByEmail(email);

		if (!user) {
			throw new UnprocessableEntityError(t("auth.validationError"), [
				{ field: "email", message: t("auth.invalidCredentials") },
			]);
		}

		if (user.email_verified_at === null) {
			throw new UnprocessableEntityError(t("auth.validationError"), [
				{ field: "email", message: t("auth.emailNotVerified") },
			]);
		}

		if (user.status !== "active") {
			throw new UnprocessableEntityError(t("auth.validationError"), [
				{
					field: "email",
					message: t("auth.accountInactive"),
				},
			]);
		}

		const isPasswordValid = await Hash.compareHash(password, user.password);
		if (!isPasswordValid) {
			throw new UnprocessableEntityError(t("auth.validationError"), [
				{ field: "email", message: t("auth.invalidCredentials") },
			]);
		}

		const userInfo = await UserRepository().findUserInformation(user.id);
		if (!userInfo) {
			throw new UnprocessableEntityError(t("auth.validationError"), [
				{ field: "email", message: t("auth.userNotFound") },
			]);
		}

		return userInfo;
	}

	async register(payload: { name: string; email: string; password: string }): Promise<void> {
		const emailExists = await UserRepository().emailExists(payload.email);
		if (emailExists) {
			throw new UnprocessableEntityError(t("auth.emailAlreadyInUse"), [
				{ field: "email", message: t("auth.emailAlreadyRegistered") },
			]);
		}

		const hashedPassword = await Hash.generateHash(payload.password);

		await db.$transaction(async (tx: TransactionClient) => {
			const userId = await UserRepository(tx).create({
				name: payload.name,
				email: payload.email,
				password: hashedPassword,
				status: "active",
			});

			const token = StrToolkit.random(255);
			await EmailVerificationRepository(tx).create(userId, token, verificationTokenLifetime);

			await sendEmailQueue.add("send-email", {
				subject: t("mail.subject.verification"),
				to: payload.email,
				template: "/auth/email-verification",
				variables: {
					user_id: userId,
					user_name: payload.name,
					user_email: payload.email,
					verification_url: `${AppConfig.CLIENT_URL}/auth/verify-email?token=${token}`,
				},
			});
		});
	}

	async resendVerification(payload: { email: string }): Promise<void> {
		const user = await UserRepository().findByEmail(payload.email);
		if (!user) return;

		if (user.email_verified_at !== null) {
			throw new UnprocessableEntityError(t("auth.emailAlreadyVerified"), [
				{ field: "email", message: t("auth.emailAlreadyVerified") },
			]);
		}

		const token = StrToolkit.random(255);
		await db.$transaction(async (tx: TransactionClient) => {
			await EmailVerificationRepository(tx).create(user.id, token, verificationTokenLifetime);

			await sendEmailQueue.add("send-email", {
				subject: t("mail.subject.verification"),
				to: payload.email,
				template: "/auth/email-verification",
				variables: {
					user_id: user.id,
					user_name: user.name,
					user_email: user.email,
					verification_url: `${AppConfig.CLIENT_URL}/auth/verify-email?token=${token}`,
				},
			});
		});
	}

	async verifyEmail(payload: { token: string }): Promise<void> {
		const record = await EmailVerificationRepository().findByToken(payload.token);

		if (!record) {
			throw new UnprocessableEntityError(t("auth.invalidVerificationToken"), [
				{ field: "token", message: t("auth.invalidVerificationToken") },
			]);
		}

		await db.$transaction(async (tx: TransactionClient) => {
			await UserRepository(tx).updateEmailVerifiedAt(record.user_id);
			await EmailVerificationRepository(tx).delete(record.id);
		});
	}

	async forgotPassword(email: string): Promise<void> {
		const user = await UserRepository().findByEmail(email);
		if (!user) return;

		const token = StrToolkit.random(255);
		await ForgotPasswordRepository().create(user.id, token);

		await sendEmailQueue.add("send-email", {
			subject: t("mail.subject.resetPassword"),
			to: email,
			template: "/auth/forgot-password",
			variables: {
				user_id: user.id,
				user_name: user.name,
				user_email: user.email,
				reset_password_url: `${AppConfig.CLIENT_URL}/auth/reset-password?token=${token}`,
			},
		});
	}

	async resetPassword(token: string, newPassword: string): Promise<void> {
		const passwordReset = await ForgotPasswordRepository().findByToken(token);
		if (!passwordReset) {
			throw new UnprocessableEntityError(t("auth.validationError"), [
				{ field: "token", message: t("auth.invalidResetToken") },
			]);
		}

		const hashPassword = await Hash.generateHash(newPassword);
		await db.$transaction(async (tx: TransactionClient) => {
			await UserRepository(tx).updatePassword(passwordReset.user_id, hashPassword);
			await ForgotPasswordRepository(tx).delete(passwordReset.id);
		});
	}

	async storeRefreshToken(userId: string, refreshToken: string): Promise<void> {
		// Import RedisClient directly to avoid circular deps
		const { RedisClient } = await import("@database");
		const redis = RedisClient.getRedisClient();
		const key = `refresh_token:${userId}`;
		await redis.set(key, refreshToken, "EX", AppConfig.APP_JWT_REFRESH_EXPIRES_IN);
	}

	async validateRefreshToken(refreshToken: string, userId: string): Promise<boolean> {
		const { RedisClient } = await import("@database");
		const redis = RedisClient.getRedisClient();
		const key = `refresh_token:${userId}`;
		const storedToken = await redis.get(key);
		return storedToken === refreshToken;
	}

	async revokeRefreshToken(userId: string): Promise<void> {
		const { RedisClient } = await import("@database");
		const redis = RedisClient.getRedisClient();
		const key = `refresh_token:${userId}`;
		await redis.del(key);
	}
}
