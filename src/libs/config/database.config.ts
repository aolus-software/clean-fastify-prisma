import { env } from "./env.config";

interface IDatabaseConfig {
	url: string;
	pool: {
		max: number;
		idleTimeoutMillis: number;
		connectionTimeoutMillis: number;
	};
}

/** `pool` is passed to the `pg` pool behind the Prisma adapter, per process (per cluster worker). */
export const DatabaseConfig: IDatabaseConfig = {
	url: env.DATABASE_URL,
	pool: {
		max: env.DB_POOL_MAX,
		idleTimeoutMillis: env.DB_IDLE_TIMEOUT,
		connectionTimeoutMillis: env.DB_CONNECTION_TIMEOUT,
	},
};
