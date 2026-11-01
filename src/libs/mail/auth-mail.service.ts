import { sendEmailQueue } from "@bull/queue/send-email.queue";
import { AppConfig } from "@config";
import {
	db,
	EmailVerificationRepository,
	PasswordResetRepository,
	type TransactionClient,
} from "@database";
import { resetPasswordLifetime, verificationTokenLifetime } from "@fastify-libs";
import { t } from "@i18n";
import { logger, StrToolkit } from "@utils";

type MailRecipient = { id: string; name: string; email: string };

/**
 * Mints single-use tokens and queues the auth mails. Issuing a token spends every earlier unused
 * one for the same user, so only the newest link works. Minting accepts `tx` so it can join the
 * caller's transaction; queueing is a separate call made after that transaction commits, so a
 * rolled-back write never sends a mail for a token that does not exist.
 */
export const AuthMailService = {
	async issueVerificationToken(userId: string, tx?: TransactionClient): Promise<string> {
		const token = StrToolkit.random(100);
		await EmailVerificationRepository(tx).markAllUsed(userId);
		await EmailVerificationRepository(tx).create(userId, token, verificationTokenLifetime());
		return token;
	},

	async issueResetToken(userId: string, tx?: TransactionClient): Promise<string> {
		const token = StrToolkit.random(255);
		await PasswordResetRepository(tx).markAllUsed(userId);
		await PasswordResetRepository(tx).create(userId, token, resetPasswordLifetime());
		return token;
	},

	async queueVerificationEmail(user: MailRecipient, token: string): Promise<void> {
		await sendEmailQueue.add("send-email", {
			subject: t("mail.subject.verification"),
			to: user.email,
			template: "/auth/email-verification",
			variables: {
				user_id: user.id,
				user_name: user.name,
				user_email: user.email,
				verification_url: `${AppConfig.CLIENT_URL}/auth/verify-email?token=${token}`,
			},
		});
		logger.info({ userId: user.id }, "Verification email queued");
	},

	async queueResetPasswordEmail(user: MailRecipient, token: string): Promise<void> {
		await sendEmailQueue.add("send-email", {
			subject: t("mail.subject.resetPassword"),
			to: user.email,
			template: "/auth/forgot-password",
			variables: {
				user_id: user.id,
				user_name: user.name,
				user_email: user.email,
				reset_password_url: `${AppConfig.CLIENT_URL}/auth/reset-password?token=${token}`,
			},
		});
		logger.info({ userId: user.id }, "Reset password email queued");
	},

	async sendVerificationEmail(user: MailRecipient): Promise<void> {
		const token = await db.$transaction(
			async (tx: TransactionClient) => await AuthMailService.issueVerificationToken(user.id, tx),
		);
		await AuthMailService.queueVerificationEmail(user, token);
	},

	async sendResetPasswordEmail(user: MailRecipient): Promise<void> {
		const token = await db.$transaction(
			async (tx: TransactionClient) => await AuthMailService.issueResetToken(user.id, tx),
		);
		await AuthMailService.queueResetPasswordEmail(user, token);
	},
};
