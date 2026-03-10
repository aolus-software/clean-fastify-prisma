import { type TransactionClient } from "../../src/libs/database/postgres/client";
import { db } from "../../src/libs/database/postgres/client";

export const RBACSeeder = async () => {
	await db.$transaction(async (tx: TransactionClient) => {
		await tx.role.createMany({
			data: [{ name: "superuser" }, { name: "admin" }],
		});

		const groups = ["user", "permission", "role"];
		const actions = ["list", "create", "detail", "edit", "delete"];

		await tx.permission.createMany({
			data: groups.flatMap((group) =>
				actions.map((action) => ({
					name: `${group} ${action}`,
					group,
				})),
			),
		});
	});
};
