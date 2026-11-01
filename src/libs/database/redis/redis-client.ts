import { RedisConfig } from "@config";
import { RedisClient as BunRedisClient } from "bun";
import IORedis from "ioredis";

export class RedisClient {
	private static redis: BunRedisClient | null = null;
	private static queueRedis: IORedis | null = null;

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

	/** BullMQ needs ioredis (blocking commands, Lua); everything else uses Bun's native client. */
	static getQueueRedisClient(): IORedis {
		if (!this.queueRedis) {
			this.queueRedis = new IORedis({
				host: RedisConfig.REDIS_HOST,
				port: RedisConfig.REDIS_PORT,
				password: RedisConfig.REDIS_PASSWORD || undefined,
				db: RedisConfig.REDIS_DB,
				maxRetriesPerRequest: null,
			});
		}
		return this.queueRedis;
	}
}
