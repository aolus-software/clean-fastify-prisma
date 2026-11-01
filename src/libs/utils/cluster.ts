import cluster from "node:cluster";
import { availableParallelism } from "node:os";

import { logger } from "./fastify/logger";

export interface ClusterOptions {
	name: string;
	enabled: boolean;
	workers?: number;
}

/** A worker that dies sooner than this after being forked is a startup failure, not a crash. */
const MIN_WORKER_UPTIME_MS = 5000;

/**
 * Runs `run` in this process, or, when `enabled`, forks `workers` copies (0 = one per CPU) and
 * keeps them alive. A worker that crashes after starting is replaced. A worker that dies during
 * startup (bad env, port taken) is not, because every replacement would fail the same way: the
 * primary stops forking and exits non-zero once the remaining workers are gone.
 */
export function runWithCluster(opts: ClusterOptions, run: () => void | Promise<void>): void {
	if (!opts.enabled || cluster.isWorker) {
		void run();
		return;
	}

	const desired = opts.workers && opts.workers > 0 ? opts.workers : availableParallelism();
	const count = Math.max(1, Math.floor(desired));
	const forkedAt = new Map<number, number>();
	let shuttingDown = false;
	let exitCode = 0;

	const fork = (): void => {
		const worker = cluster.fork();
		forkedAt.set(worker.id, Date.now());
	};

	logger.info(
		{ name: opts.name, workers: count, pid: process.pid },
		`Primary forking ${count} ${opts.name} workers`,
	);
	for (let i = 0; i < count; i++) fork();

	cluster.on("exit", (worker, code, signal) => {
		const uptime = Date.now() - (forkedAt.get(worker.id) ?? 0);
		forkedAt.delete(worker.id);

		if (!shuttingDown && uptime >= MIN_WORKER_UPTIME_MS) {
			logger.warn(
				{ pid: worker.process.pid, code, signal, name: opts.name },
				"Cluster worker exited unexpectedly, respawning",
			);
			fork();
			return;
		}

		if (!shuttingDown) {
			logger.error(
				{ pid: worker.process.pid, code, signal, name: opts.name, uptime },
				"Cluster worker failed during startup, not respawning",
			);
			shuttingDown = true;
			exitCode = 1;
			for (const other of Object.values(cluster.workers ?? {})) other?.kill("SIGTERM");
		}

		if (Object.keys(cluster.workers ?? {}).length === 0) process.exit(exitCode);
	});

	const shutdown = (signal: NodeJS.Signals): void => {
		if (shuttingDown) return;
		shuttingDown = true;
		logger.info({ name: opts.name, signal }, "Primary received signal, terminating workers");
		for (const worker of Object.values(cluster.workers ?? {})) worker?.kill(signal);
	};

	process.on("SIGTERM", () => shutdown("SIGTERM"));
	process.on("SIGINT", () => shutdown("SIGINT"));
}
