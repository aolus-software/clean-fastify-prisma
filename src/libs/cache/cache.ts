import { RedisClient } from "@database";
import { logger } from "@utils";
import type { RedisClient as BunRedisClient } from "bun";

class Cache {
	private static redis: BunRedisClient | null = null;

	private static getRedisClient(): BunRedisClient {
		if (!this.redis) {
			this.redis = RedisClient.getRedisClient();
		}

		return this.redis;
	}

	static async get<T>(key: string): Promise<T | null> {
		try {
			const client = this.getRedisClient();
			const value = await client.get(key);
			return value ? (JSON.parse(value) as T) : null;
		} catch (error) {
			logger.error(error, `Error getting cache for key ${key}:`);
			return null;
		}
	}

	static async set<T>(key: string, value: T, ttl: number = 3600): Promise<void> {
		try {
			const client = this.getRedisClient();
			await client.set(key, JSON.stringify(value), "EX", ttl);
		} catch (error) {
			logger.error(error, `Error setting cache for key ${key}:`);
		}
	}

	static async delete(key: string): Promise<void> {
		try {
			const client = this.getRedisClient();
			await client.del(key);
		} catch (error) {
			logger.error(error, `Error deleting cache for key ${key}:`);
		}
	}

	static async exists(key: string): Promise<boolean> {
		try {
			const client = this.getRedisClient();
			return await client.exists(key);
		} catch (error) {
			logger.error(error, `Error checking existence of key ${key}:`);
			return false;
		}
	}

	static async remember<T>(
		key: string,
		callback: () => Promise<T>,
		ttl: number = 3600,
	): Promise<T | null> {
		const cachedValue = await this.get<T>(key);
		if (cachedValue !== null) {
			return cachedValue;
		}

		const freshValue = await callback();
		await this.set(key, freshValue, ttl);
		return freshValue;
	}

	static generateKey(...args: string[]): string {
		return args.join(":");
	}
}

export { Cache };
