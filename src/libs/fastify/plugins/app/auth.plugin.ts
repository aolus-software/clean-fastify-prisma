import { UserInformationCacheKey } from "@cache";
import { UserRepository } from "@database";
import { UserInformation } from "@types";
import { FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";

declare module "fastify" {
	interface FastifyRequest {
		authenticate(_reply: FastifyReply): Promise<void>;
		userInformation: UserInformation;
	}
}

async function authenticate(this: FastifyRequest, reply: FastifyReply) {
	try {
		await this.jwtVerify();
		const userJwt = this.user as { id: string };
		const cacheKey = UserInformationCacheKey(userJwt.id);
		const cacheUser = await this.server.redis.get(cacheKey);

		if (!cacheUser) {
			const userInfo = await UserRepository().findUserInformation(userJwt.id);
			await this.server.redis.set(
				cacheKey,
				JSON.stringify(userInfo),
				"EX",
				3600 * 24,
			);
			this.userInformation = userInfo as UserInformation;
		} else {
			this.userInformation = JSON.parse(cacheUser) as UserInformation;
		}
	} catch {
		reply.status(401).send({ message: "Unauthorized" });
		return;
	}

	return;
}

export default fp(
	// eslint-disable-next-line @typescript-eslint/require-await
	async function (fastify) {
		fastify.decorateRequest("authenticate", authenticate);
	},
	{ name: "auth-plugin" },
);
