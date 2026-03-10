import { db } from "@database";
import { ResponseToolkit } from "@utils";
import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

const ServiceStatusSchema = z.object({
	status: z.enum(["healthy", "unhealthy"]),
	responseTime: z.number(),
	remarks: z.string().optional(),
});

export default function (fastify: FastifyInstance) {
	fastify.withTypeProvider<ZodTypeProvider>();

	fastify.get(
		"",
		{
			schema: {
				tags: ["Health"],
				summary: "Health Check",
				description: "Checks the health status of the application and its dependencies.",
				response: {
					200: z.object({
						status: z.number(),
						success: z.boolean(),
						message: z.string(),
						data: z.object({
							database: ServiceStatusSchema,
							redis: ServiceStatusSchema,
						}),
					}),
					503: z.object({
						status: z.number(),
						success: z.boolean(),
						message: z.string(),
						data: z.object({
							database: ServiceStatusSchema,
							redis: ServiceStatusSchema,
						}),
					}),
				},
			},
		},
		async (_request, reply) => {
			type ServiceStatus = { status: "healthy" | "unhealthy"; responseTime: number; remarks: string };
			const serviceStatus: { database: ServiceStatus; redis: ServiceStatus } = {
				database: {
					status: "healthy",
					responseTime: 0,
					remarks: "PostgreSQL is operational",
				},
				redis: {
					status: "healthy",
					responseTime: 0,
					remarks: "Redis cache is operational",
				},
			};

			try {
				const start = Date.now();
				await db.$queryRaw`SELECT 1`;
				serviceStatus.database.responseTime = Date.now() - start;
			} catch (error) {
				serviceStatus.database = {
					status: "unhealthy",
					responseTime: 0,
					remarks: error instanceof Error ? error.message : String(error),
				};
			}

			try {
				const start = Date.now();
				await fastify.redis.ping();
				serviceStatus.redis.responseTime = Date.now() - start;
			} catch (error) {
				serviceStatus.redis = {
					status: "unhealthy",
					responseTime: 0,
					remarks: error instanceof Error ? error.message : String(error),
				};
			}

			const allHealthy = Object.values(serviceStatus).every(
				(service) => service.status === "healthy",
			);

			if (!allHealthy) {
				return ResponseToolkit.error(
					reply,
					"One or more services are unhealthy",
					503,
					serviceStatus,
				);
			}

			return ResponseToolkit.success(reply, serviceStatus, "All services are healthy");
		},
	);
}
