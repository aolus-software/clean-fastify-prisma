import { RedisConfig } from "@config";
import Redis from "ioredis";

export type QueueConnectionOptions = {
	host: string;
	port: number;
	password?: string;
	db?: number;
	maxRetriesPerRequest: null;
};

export class RedisClient {
	private static redis: Redis | null = null;

	static getRedisClient(): Redis {
		if (!this.redis) {
			this.redis = new Redis({
				host: RedisConfig.REDIS_HOST,
				port: RedisConfig.REDIS_PORT,
				password: RedisConfig.REDIS_PASSWORD || undefined,
				db: RedisConfig.REDIS_DB,
			});
		}

		return this.redis;
	}

	static getQueueConnectionOptions(): QueueConnectionOptions {
		return {
			host: RedisConfig.REDIS_HOST,
			port: RedisConfig.REDIS_PORT,
			password: RedisConfig.REDIS_PASSWORD || undefined,
			db: RedisConfig.REDIS_DB,
			maxRetriesPerRequest: null,
		};
	}
}
