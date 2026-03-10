import { type TransactionClient } from "../../src/libs/database/postgres/client";
import { db } from "../../src/libs/database/postgres/client";
import { Hash } from "../../src/libs/utils/security/hash";

export const UserSeeder = async () => {
	await db.$transaction(async (tx: TransactionClient) => {
		const [superuser, admin] = await Promise.all([
			tx.user.create({
				data: {
					name: "superuser",
					email: "superuser@example.com",
					email_verified_at: new Date(),
					password: await Hash.generateHash("Password@123"),
				},
			}),
			tx.user.create({
				data: {
					name: "admin",
					email: "admin@example.com",
					email_verified_at: new Date(),
					password: await Hash.generateHash("Password@123"),
				},
			}),
		]);

		const [superuserRole, adminRole] = await Promise.all([
			tx.role.findFirst({ where: { name: "superuser" } }),
			tx.role.findFirst({ where: { name: "admin" } }),
		]);

		await Promise.all([
			superuserRole &&
				tx.userRole.create({
					data: { user_id: superuser.id, role_id: superuserRole.id },
				}),
			adminRole &&
				tx.userRole.create({
					data: { user_id: admin.id, role_id: adminRole.id },
				}),
		]);
	});
};
