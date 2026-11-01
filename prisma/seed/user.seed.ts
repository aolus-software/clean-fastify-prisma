import { db } from "@database/postgres/client";
import { UserStatus } from "@prisma-generated";
import { Hash } from "@utils";

import { SEEDED_ROLES } from "./rbac.seed";

const SEED_PASSWORD = "S3crEtP4ssw0rd!";

/**
 * One verified, active account per seeded role (`<role>@example.com`). An
 * existing live account is left untouched, so a rerun never resets a
 * password an operator has changed.
 */
export const UserSeeder = async (): Promise<void> => {
	for (const roleName of SEEDED_ROLES) {
		const email = `${roleName}@example.com`;
		const existing = await db.user.findFirst({
			where: { email, deletedAt: null },
			select: { id: true },
		});
		if (existing) continue;

		const role = await db.role.findUniqueOrThrow({
			where: { name: roleName },
			select: { id: true },
		});

		await db.user.create({
			data: {
				name: roleName,
				email,
				password: await Hash.generateHash(SEED_PASSWORD),
				status: UserStatus.ACTIVE,
				emailVerifiedAt: new Date(),
				userRoles: { create: { roleId: role.id } },
			},
		});
	}
};
