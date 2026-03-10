import { corsConfig } from "@config";
import fastifyCors from "@fastify/cors";
import fp from "fastify-plugin";

export default fp(
	async function (fastify) {
		await fastify.register(fastifyCors, {
			origin: (origin, cb) => {
				if (!origin) return cb(null, true);

				const hostname = new URL(origin).hostname;
				const allowedOrigins = corsConfig.origin;

				if (allowedOrigins === "*") {
					cb(null, true);
					return;
				}

				if (allowedOrigins.includes(hostname)) {
					cb(null, true);
				} else {
					fastify.log.warn({ msg: "CORS rejected", origin, hostname });
					cb(new Error("Not allowed by CORS"), false);
				}
			},
			methods: corsConfig.methods,
			allowedHeaders: corsConfig.allowedHeaders,
			exposedHeaders: corsConfig.exposedHeaders,
			credentials: corsConfig.credentials,
			maxAge: corsConfig.maxAge,
		});
	},
	{ name: "cors-plugin", dependencies: [] },
);
