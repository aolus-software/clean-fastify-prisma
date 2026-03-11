import type { Prisma } from "@prisma-generated";

import { db } from "../client";

type TransactionClient = Prisma.TransactionClient;

export function EmailVerificationRepository(tx?: TransactionClient) {
	const dbClient = tx ?? db;

	return {
		async create(userId: string, token: string, expiredAt: Date): Promise<void> {
			await dbClient.emailVerification.create({
				data: { user_id: userId, token, expired_at: expiredAt },
			});
		},

		async findByToken(token: string): Promise<{
			id: string;
			user_id: string;
			token: string;
			expired_at: Date;
		} | null> {
			return await dbClient.emailVerification.findFirst({
				where: { token },
				select: { id: true, user_id: true, token: true, expired_at: true },
			});
		},

		async delete(id: string): Promise<void> {
			await dbClient.emailVerification.delete({ where: { id } });
		},
	};
}
