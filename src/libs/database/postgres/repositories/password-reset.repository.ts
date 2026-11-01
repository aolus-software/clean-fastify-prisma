import { Prisma } from "@prisma-generated";

import { db } from "../client";

type TransactionClient = Prisma.TransactionClient;

export type PasswordResetToken = {
	id: string;
	userId: string;
	expiresAt: Date;
	usedAt: Date | null;
};

export function PasswordResetRepository(tx?: TransactionClient) {
	const dbClient = tx || db;

	return {
		async findByToken(token: string): Promise<PasswordResetToken | null> {
			return dbClient.passwordReset.findUnique({
				where: { token },
				select: { id: true, userId: true, expiresAt: true, usedAt: true },
			});
		},

		async create(userId: string, token: string, expiresAt: Date): Promise<void> {
			await dbClient.passwordReset.create({
				data: { userId, token, expiresAt },
			});
		},

		async markAllUsed(userId: string): Promise<void> {
			await dbClient.passwordReset.updateMany({
				where: { userId, usedAt: null },
				data: { usedAt: new Date() },
			});
		},
	};
}
