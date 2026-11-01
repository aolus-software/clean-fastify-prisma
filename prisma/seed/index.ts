import { db } from "@database/postgres/client";

import { RBACSeeder } from "./rbac.seed";
import { UserSeeder } from "./user.seed";

try {
	await RBACSeeder();
	await UserSeeder();
	// eslint-disable-next-line no-console
	console.log("Seeding completed successfully");
	await db.$disconnect();
	process.exit(0);
} catch (error) {
	// eslint-disable-next-line no-console
	console.error("Seeding failed:", error);
	await db.$disconnect();
	process.exit(1);
}
