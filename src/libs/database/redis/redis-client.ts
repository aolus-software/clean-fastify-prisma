import { RedisConfig } from "@config";
import { RedisClient as BunRedisClient } from "bun";

export type QueueConnectionOptions = {
	host: string;
	port: number;
	password?: string;
	db?: number;
	maxRetriesPerRequest: null;
};

export class RedisClient {
	private static redis: BunRedisClient | null = null;

	private static buildUrl(): string {
		const { REDIS_HOST, REDIS_PORT, REDIS_PASSWORD, REDIS_DB } = RedisConfig;
		const auth = REDIS_PASSWORD ? `:${encodeURIComponent(REDIS_PASSWORD)}@` : "";
		return `redis://${auth}${REDIS_HOST}:${REDIS_PORT}/${REDIS_DB}`;
	}

	static getRedisClient(): BunRedisClient {
		if (!this.redis) {
			this.redis = new BunRedisClient(this.buildUrl());
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
