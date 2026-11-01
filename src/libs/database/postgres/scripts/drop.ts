import { AppConfig } from "@config";
import { spawnSync } from "child_process";

/**
 * Drops every table and re-applies the migrations with `prisma migrate reset --force`. `make fresh`
 * and `bun run db:drop` go through this script so they refuse to run with NODE_ENV=production.
 */
if (AppConfig.APP_ENV === "production") {
	// eslint-disable-next-line no-console
	console.error("Refusing to drop the database with NODE_ENV=production");
	process.exit(1);
}

const result = spawnSync("bunx", ["--bun", "prisma", "migrate", "reset", "--force"], {
	stdio: "inherit",
});

process.exit(result.status ?? 1);
