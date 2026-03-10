import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma-generated";

const connectionString = `${process.env.DATABASE_URL}`;

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

export type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
export { prisma as db };
