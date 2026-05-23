import cluster from "node:cluster";
import { availableParallelism } from "node:os";

import { logger } from "./fastify/logger";

export interface ClusterOptions {
	name: string;
	workers?: number;
}

export function runWithCluster(opts: ClusterOptions, run: () => void | Promise<void>): void {
	const desired = opts.workers && opts.workers > 0 ? opts.workers : availableParallelism();
	const count = Math.max(1, Math.floor(desired));

	if (count === 1 || cluster.isWorker) {
		void run();
		return;
	}

	let shuttingDown = false;
	logger.info(
		{ name: opts.name, workers: count, pid: process.pid },
		`Primary forking ${count} ${opts.name} workers`,
	);

	for (let i = 0; i < count; i++) cluster.fork();

	cluster.on("exit", (worker, code, signal) => {
		if (shuttingDown) return;
		logger.warn(
			{ pid: worker.process.pid, code, signal, name: opts.name },
			"Cluster worker exited unexpectedly, respawning",
		);
		cluster.fork();
	});

	const shutdown = (signal: NodeJS.Signals) => {
		if (shuttingDown) return;
		shuttingDown = true;
		logger.info({ name: opts.name, signal }, "Primary received signal, terminating workers");
		for (const worker of Object.values(cluster.workers ?? {})) {
			worker?.kill(signal);
		}
	};

	process.on("SIGTERM", () => shutdown("SIGTERM"));
	process.on("SIGINT", () => shutdown("SIGINT"));
}
