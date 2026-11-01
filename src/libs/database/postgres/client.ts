import { DatabaseConfig } from "@config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma-generated";

const adapter = new PrismaPg({
	connectionString: DatabaseConfig.url,
	...DatabaseConfig.pool,
});
const prisma = new PrismaClient({ adapter });

export type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
export { prisma as db };
