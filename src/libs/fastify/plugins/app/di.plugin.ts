import { container } from "@fastify-libs";
import { FastifyInstance } from "fastify";
import fp from "fastify-plugin";

declare module "fastify" {
	interface FastifyInstance {
		di: typeof container;
	}
}

export default fp(
	// eslint-disable-next-line @typescript-eslint/require-await
	async function (fastify: FastifyInstance) {
		fastify.decorate("di", container);
	},
	{ name: "di-plugin" },
);
