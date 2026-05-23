import fastifyI18n from "fastify-i18n";
import fp from "fastify-plugin";
import path from "path";

export default fp(
	async function (fastify) {
		// Register fastify-i18n plugin with basic configuration
		await fastify.register(fastifyI18n, {
			localeDir: path.resolve(__dirname, "../../../locales"), // Resolve to src/locales
			defaultLocale: "en",
			fallbackLocale: "en",
			// Optional: expose a simple translate helper on request
			// The plugin already decorates request with `request.t(key, ...args)`
		});
	},
	{ name: "i18n-plugin", dependencies: [] },
);
