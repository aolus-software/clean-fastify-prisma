import { RedisConfig } from "@config";
import fastifyRateLimit from "@fastify/rate-limit";
import type { FastifyRequest } from "fastify";
import fp from "fastify-plugin";

export default fp(
	async function (fastify) {
		await fastify.register(fastifyRateLimit, {
			max: 100,
			timeWindow: "1 minute",
			redis: fastify.redis,
			keyGenerator: (request: FastifyRequest) => {
				const ip =
					request.headers["x-forwarded-for"] ||
					request.headers["x-real-ip"] ||
					request.ip;

				const ips = Array.isArray(ip) ? ip.join(",") : ip;
				return `rate-limit:${ips}`;
			},
			skipOnError: false,
			errorResponseBuilder: (_request: FastifyRequest, context) => {
				return {
					status: 429,
					success: false,
					message: "Too many requests. Please try again later.",
					retryAfter: context.ttl,
				};
			},
			addHeadersOnExceeding: {
				"x-ratelimit-limit": true,
				"x-ratelimit-remaining": true,
				"x-ratelimit-reset": true,
			},
			addHeaders: {
				"x-ratelimit-limit": true,
				"x-ratelimit-remaining": true,
				"x-ratelimit-reset": true,
				"retry-after": true,
			},
			global: true,
		});

		fastify.addHook("onRequest", async (request, _reply) => {
			if (request.url === "/health" || request.url === "/metrics") {
				// @ts-expect-error - rate limit skip flag
				request.skipRateLimit = true;
			}
		});

		fastify.log.info({
			msg: "Rate limiting enabled",
			redis: `${RedisConfig.REDIS_HOST}:${RedisConfig.REDIS_PORT}`,
			max: 100,
			timeWindow: "1 minute",
		});
	},
	{ name: "rate-limiting-plugin", dependencies: ["@fastify/redis"] },
);
