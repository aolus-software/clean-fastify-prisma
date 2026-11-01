import { UserRepository } from "@database/postgres/repositories";
import { UserInformation } from "@types";

import { Cache } from "./cache";
import { RefreshTokenCacheKey, UserInformationCacheKey, UserInformationCacheTtl } from "./const";

/**
 * The per-user Redis state the auth plugin and /auth/refresh read: the cached UserInformation and
 * the current refresh-token id. Any write that changes a user's status, roles, permissions,
 * credentials or deletion calls `forgetUsers` or `revokeSessions`, so access is re-evaluated on
 * the next request instead of when the cache entry happens to expire.
 */
export const Session = {
	async getUserInformation(userId: string): Promise<UserInformation | null> {
		const cached = await Cache.get<UserInformation>(UserInformationCacheKey(userId));
		if (cached) return cached;

		const fresh = await UserRepository().findUserInformation(userId);
		if (fresh) {
			await Cache.set(UserInformationCacheKey(userId), fresh, UserInformationCacheTtl);
		}
		return fresh;
	},

	async forgetUsers(userIds: string[]): Promise<void> {
		await Cache.deleteMany(userIds.map(UserInformationCacheKey));
	},

	async revokeSessions(userId: string): Promise<void> {
		await Cache.deleteMany([UserInformationCacheKey(userId), RefreshTokenCacheKey(userId)]);
	},
};
