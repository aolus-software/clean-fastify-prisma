import { t } from "@i18n";
import { FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";

declare module "fastify" {
	interface FastifyRequest {
		requireSuperuser(reply: FastifyReply): void;
	}
}

function requireSuperuser(this: FastifyRequest, reply: FastifyReply) {
	const userInformation = this.userInformation;
	if (!userInformation) {
		reply.status(401).send({ message: t("errors.unauthorized") });
		return;
	}

	if (!userInformation.roles.some((role) => role === "superuser")) {
		reply.status(403).send({ message: t("auth.accessDeniedSuperuser") });
		return;
	}
}

// eslint-disable-next-line @typescript-eslint/require-await
export default fp(async function (fastify) {
	fastify.decorateRequest("requireSuperuser", requireSuperuser);
});
