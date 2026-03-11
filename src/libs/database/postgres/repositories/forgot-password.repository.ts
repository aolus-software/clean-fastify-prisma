import type { Prisma } from "@prisma-generated";

import { db } from "../client";

type TransactionClient = Prisma.TransactionClient;

export function ForgotPasswordRepository(tx?: TransactionClient) {
	const dbClient = tx ?? db;

	return {
		async create(userId: string, token: string): Promise<void> {
			await dbClient.passwordResetToken.create({
				data: { user_id: userId, token },
			});
		},

		async findByToken(
			token: string,
		): Promise<{ id: string; user_id: string; created_at: Date } | null> {
			return await dbClient.passwordResetToken.findFirst({
				where: { token },
				select: { id: true, user_id: true, created_at: true },
			});
		},

		async delete(id: string): Promise<void> {
			await dbClient.passwordResetToken.delete({ where: { id } });
		},

		async deleteByUserId(userId: string): Promise<void> {
			await dbClient.passwordResetToken.deleteMany({
				where: { user_id: userId },
			});
		},
	};
}
