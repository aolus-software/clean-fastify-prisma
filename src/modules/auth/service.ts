import { Cache, RefreshTokenCacheKey, Session } from "@cache";
import { JwtConfig } from "@config";
import {
	db,
	EmailVerificationRepository,
	PasswordResetRepository,
	type TransactionClient,
	UserRepository,
	UserStatus,
} from "@database";
import type { JWT } from "@fastify/jwt";
import {
	BadRequestError,
	injectable,
	UnauthorizedError,
	UnprocessableEntityError,
} from "@fastify-libs";
import { t } from "@i18n";
import { AuthMailService } from "@libs/mail/auth-mail.service";
import { AccessTokenPayload, RefreshTokenPayload, TokenPair, UserInformation } from "@types";
import { Hash, logger, StrToolkit } from "@utils";

/* A real bcrypt hash of a random string. Login compares against it when the email is unknown so
   the response time does not reveal whether an account exists. */
const DUMMY_PASSWORD_HASH = "$2b$10$kcnIBQPdVdQFzLsfjwlfhOiScH0eMZ8VOlm/VyfanNbzsVLuOLSmq";

@injectable()
export class AuthService {
	/**
	 * The password is checked before any account state, and an unknown email and a wrong password
	 * get the same answer, so an unauthenticated caller cannot learn whether an address is
	 * registered, unverified, or inactive without already knowing its password.
	 */
	async login(email: string, password: string): Promise<UserInformation> {
		const user = await UserRepository().findByEmail(email);
		const isPasswordValid = await Hash.compareHash(password, user?.password ?? DUMMY_PASSWORD_HASH);

		if (!user || !isPasswordValid) {
			throw new BadRequestError(t("auth.validationError"), [
				{ field: "email", message: t("auth.invalidCredentials") },
			]);
		}

		if (user.emailVerifiedAt === null) {
			throw new BadRequestError(t("auth.validationError"), [
				{ field: "email", message: t("auth.emailNotVerified") },
			]);
		}

		if (user.status !== UserStatus.ACTIVE) {
			throw new BadRequestError(t("auth.validationError"), [
				{ field: "email", message: t("auth.accountInactive") },
			]);
		}

		await Session.forgetUsers([user.id]);
		const information = await Session.getUserInformation(user.id);
		if (!information) {
			throw new UnauthorizedError(t("auth.userNotFound"));
		}

		logger.info({ userId: user.id }, "User logged in");
		return information;
	}

	async register(payload: { name: string; email: string; password: string }): Promise<void> {
		if (await UserRepository().findLiveByEmail(payload.email)) {
			throw new UnprocessableEntityError(t("auth.validationError"), [
				{ field: "email", message: t("auth.emailAlreadyRegistered") },
			]);
		}

		const hashedPassword = await Hash.generateHash(payload.password);
		const { user, token } = await db.$transaction(async (tx: TransactionClient) => {
			const created = await UserRepository(tx).create({
				name: payload.name,
				email: payload.email,
				password: hashedPassword,
				status: UserStatus.ACTIVE,
				remark: null,
			});
			const verificationToken = await AuthMailService.issueVerificationToken(created.id, tx);
			return { user: created, token: verificationToken };
		});

		await AuthMailService.queueVerificationEmail(user, token);
	}

	async resendVerification(email: string): Promise<void> {
		const user = await UserRepository().findByEmail(email);
		if (!user || user.emailVerifiedAt !== null) {
			return;
		}

		await AuthMailService.sendVerificationEmail(user);
	}

	async verifyEmail(token: string): Promise<void> {
		const record = await EmailVerificationRepository().findByToken(token);
		if (!record || record.expiresAt < new Date() || record.usedAt !== null) {
			throw new BadRequestError(t("auth.validationError"), [
				{ field: "token", message: t("auth.invalidVerificationToken") },
			]);
		}

		await db.$transaction(async (tx: TransactionClient) => {
			await UserRepository(tx).markEmailVerified(record.userId);
			await EmailVerificationRepository(tx).markAllUsed(record.userId);
		});

		logger.info({ userId: record.userId }, "Email verified");
	}

	async forgotPassword(email: string): Promise<void> {
		const user = await UserRepository().findByEmail(email);
		if (!user) {
			return;
		}

		await AuthMailService.sendResetPasswordEmail(user);
	}

	async resetPassword(token: string, newPassword: string): Promise<void> {
		const record = await PasswordResetRepository().findByToken(token);
		if (!record || record.expiresAt < new Date() || record.usedAt !== null) {
			throw new BadRequestError(t("auth.validationError"), [
				{ field: "token", message: t("auth.invalidResetToken") },
			]);
		}

		const hashedPassword = await Hash.generateHash(newPassword);
		await db.$transaction(async (tx: TransactionClient) => {
			await UserRepository(tx).updatePassword(record.userId, hashedPassword);
			await PasswordResetRepository(tx).markAllUsed(record.userId);
		});

		await Session.revokeSessions(record.userId);
		logger.info({ userId: record.userId }, "Password reset");
	}

	/**
	 * Access and refresh tokens are signed with different secrets and carry a `type` claim; the
	 * auth plugin accepts only `type: "access"` and refresh accepts only `type: "refresh"`. The
	 * refresh token's `jti` is stored per user, so issuing a pair rotates out the previous one.
	 */
	async issueTokens(jwt: JWT, userId: string): Promise<TokenPair> {
		const jti = StrToolkit.random(32);
		const accessPayload: AccessTokenPayload = { id: userId, type: "access" };
		const refreshPayload: RefreshTokenPayload = { id: userId, type: "refresh", jti };

		const accessToken = jwt.sign(accessPayload, {
			key: JwtConfig.ACCESS_SECRET,
			expiresIn: JwtConfig.ACCESS_EXPIRES_IN,
		});
		const refreshToken = jwt.sign(refreshPayload, {
			key: JwtConfig.REFRESH_SECRET,
			expiresIn: JwtConfig.REFRESH_EXPIRES_IN,
		});

		await Cache.set(RefreshTokenCacheKey(userId), jti, JwtConfig.REFRESH_EXPIRES_IN_SECONDS);

		return { accessToken, refreshToken };
	}

	async refresh(jwt: JWT, refreshToken: string): Promise<TokenPair> {
		let payload: Partial<RefreshTokenPayload>;
		try {
			payload = jwt.verify<Partial<RefreshTokenPayload>>(refreshToken, {
				key: JwtConfig.REFRESH_SECRET,
			});
		} catch {
			throw new UnauthorizedError(t("auth.invalidRefreshToken"));
		}

		if (payload.type !== "refresh" || !payload.id || !payload.jti) {
			throw new UnauthorizedError(t("auth.invalidRefreshToken"));
		}

		const storedJti = await Cache.get<string>(RefreshTokenCacheKey(payload.id));
		if (storedJti !== payload.jti) {
			throw new UnauthorizedError(t("auth.invalidRefreshToken"));
		}

		await Session.forgetUsers([payload.id]);
		const information = await Session.getUserInformation(payload.id);
		if (!information) {
			await Session.revokeSessions(payload.id);
			throw new UnauthorizedError(t("auth.invalidRefreshToken"));
		}

		return await this.issueTokens(jwt, payload.id);
	}
}
