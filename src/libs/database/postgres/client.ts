import { AppConfig, DatabaseConfig } from "@config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma-generated";
import { createLogger } from "@utils/fastify/logger";

const adapter = new PrismaPg({
	connectionString: DatabaseConfig.url,
	...DatabaseConfig.pool,
});
const prisma = new PrismaClient({
	adapter,
	log: DatabaseConfig.logQueries ? [{ emit: "event", level: "query" }] : [],
});

/**
 * Debug-level SQL log behind DB_LOG_QUERIES: statement text and duration only. Parameters carry
 * password hashes and tokens, so they are never written. Shows only with LOG_LEVEL=debug.
 */
if (DatabaseConfig.logQueries) {
	const queryLogger = createLogger({ level: AppConfig.LOG_LEVEL });
	prisma.$on("query", (event) => {
		queryLogger.debug({ query: event.query, durationMs: event.duration }, "db query");
	});
}

export type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
export { prisma as db };
