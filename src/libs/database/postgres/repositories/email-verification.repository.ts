import { Prisma } from "@prisma-generated";

import { db } from "../client";

type TransactionClient = Prisma.TransactionClient;

export type EmailVerificationToken = {
	id: string;
	userId: string;
	expiresAt: Date;
	usedAt: Date | null;
};

export function EmailVerificationRepository(tx?: TransactionClient) {
	const dbClient = tx || db;

	return {
		async findByToken(token: string): Promise<EmailVerificationToken | null> {
			return dbClient.userEmailVerification.findUnique({
				where: { token },
				select: { id: true, userId: true, expiresAt: true, usedAt: true },
			});
		},

		async create(userId: string, token: string, expiresAt: Date): Promise<void> {
			await dbClient.userEmailVerification.create({
				data: { userId, token, expiresAt },
			});
		},

		async markAllUsed(userId: string): Promise<void> {
			await dbClient.userEmailVerification.updateMany({
				where: { userId, usedAt: null },
				data: { usedAt: new Date() },
			});
		},
	};
}
