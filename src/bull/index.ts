import "reflect-metadata";

import { AppConfig } from "@config";
import { runWithCluster } from "@utils/cluster";
import { logger } from "@utils/fastify/logger";

runWithCluster(
	{
		name: "worker",
		enabled: AppConfig.APP_CLUSTER_MODE,
		workers: AppConfig.APP_CLUSTER_WORKERS,
	},
	async () => {
		const { worker } = await import("./worker/send-email.worker");

		logger.info({ pid: process.pid }, "Worker started.");

		const gracefulShutdown = async (signal: string) => {
			logger.info({ signal }, "Worker received signal, closing");
			try {
				await worker.close();
				process.exit(0);
			} catch (err) {
				logger.error(err, "Error closing worker, forcing exit");
				process.exit(1);
			}
		};

		process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"));
		process.on("SIGINT", () => void gracefulShutdown("SIGINT"));
	},
);
