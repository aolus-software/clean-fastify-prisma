import { AppConfig } from "@config/app.config";
import { JwtConfig } from "@config/jwt.config";
import { RedisConfig } from "@config/redis.config";
import fastifyJwt from "@fastify/jwt";
import fastifyRedis from "@fastify/redis";
import { createLogger } from "@utils";
import fastify from "fastify";
import {
	serializerCompiler,
	validatorCompiler,
	type ZodTypeProvider,
} from "fastify-type-provider-zod";

import authPlugin from "./libs/fastify/plugins/app/auth.plugin";
import diPlugin from "./libs/fastify/plugins/app/di.plugin";
import errorPlugin from "./libs/fastify/plugins/app/error.plugin";
import corsPlugin from "./libs/fastify/plugins/externals/cors.plugin";
import helmetPlugin from "./libs/fastify/plugins/externals/helmet.plugin";
import i18nPlugin from "./libs/fastify/plugins/externals/i18n.plugin";
import rateLimitingPlugin from "./libs/fastify/plugins/externals/rate-limiting.plugin";
import swaggerPlugin from "./libs/fastify/plugins/externals/swagger.plugin";
import authRoutes from "./modules/auth";
import healthRoutes from "./modules/health";
import homeRoutes from "./modules/index";
import profileRoutes from "./modules/profile";
import permissionRoutes from "./modules/settings/permissions";
import roleRoutes from "./modules/settings/roles";
import selectOptionRoutes from "./modules/settings/select-options";
import userRoutes from "./modules/settings/users";

/**
 * Plugins and route modules are registered explicitly rather than autoloaded from the file
 * system, so the same app runs from source, from the `dist/` bundle and from a compiled binary.
 * A new module is added to `routes` with its URL prefix.
 */
const routes = [
	{ plugin: homeRoutes, prefix: "" },
	{ plugin: healthRoutes, prefix: "/health" },
	{ plugin: authRoutes, prefix: "/auth" },
	{ plugin: profileRoutes, prefix: "/profile" },
	{ plugin: userRoutes, prefix: "/settings/users" },
	{ plugin: roleRoutes, prefix: "/settings/roles" },
	{ plugin: permissionRoutes, prefix: "/settings/permissions" },
	{ plugin: selectOptionRoutes, prefix: "/settings/select-options" },
];

export function createAppInstance() {
	const app = fastify({
		loggerInstance: createLogger({ level: AppConfig.LOG_LEVEL }),
		bodyLimit: 100 * 1024,
	}).withTypeProvider<ZodTypeProvider>();

	// INFRASTRUCTURE PLUGINS (JWT, Redis) ===================================
	app.register(fastifyJwt, {
		secret: JwtConfig.ACCESS_SECRET,
	});

	// @fastify/redis (ioredis) is registered solely so @fastify/rate-limit can use its Redis
	// store, which relies on ioredis' defineCommand (Lua); Bun's native RedisClient does not expose
	// it. Application code goes through the Cache wrapper / RedisClient (Bun native) instead.
	app.register(fastifyRedis, {
		host: RedisConfig.REDIS_HOST,
		port: RedisConfig.REDIS_PORT,
		password: RedisConfig.REDIS_PASSWORD,
		db: RedisConfig.REDIS_DB,
	});

	// SCHEMA VALIDATORS =====================================================
	app.setValidatorCompiler(validatorCompiler);
	app.setSerializerCompiler(serializerCompiler);

	// EXTERNAL PLUGINS (Helmet, CORS, i18n, Rate Limiting, Swagger) ========
	app.register(helmetPlugin);
	app.register(corsPlugin);
	app.register(i18nPlugin);
	app.register(rateLimitingPlugin);
	app.register(swaggerPlugin);

	// APPLICATION PLUGINS (Auth, DI, Error Handling) =======================
	app.register(authPlugin);
	app.register(diPlugin);
	app.register(errorPlugin);

	// APPLICATION ROUTES ====================================================
	for (const { plugin, prefix } of routes) {
		app.register(plugin, { prefix });
	}

	return app;
}
