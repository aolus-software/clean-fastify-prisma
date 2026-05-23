import { Cache, UserInformationCacheKey } from "@cache";
import { UserRepository } from "@database";
import { t } from "@i18n";
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
		const cacheUser = await Cache.get<UserInformation>(cacheKey);

		if (!cacheUser) {
			const userInfo = (await UserRepository().findUserInformation(userJwt.id)) as UserInformation;
			await Cache.set(cacheKey, userInfo, 3600 * 24);
			this.userInformation = userInfo;
		} else {
			this.userInformation = cacheUser;
		}
	} catch {
		reply.status(401).send({ message: t("errors.unauthorized") });
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
