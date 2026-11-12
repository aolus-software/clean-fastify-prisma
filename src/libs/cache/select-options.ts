import { Cache } from "./cache";
import { PermissionSelectOptionsCacheKey, RoleSelectOptionsCacheKey } from "./const";

/**
 * Drops both cached select-option lists. Every role or permission create, update or delete calls it
 * after its write, so the next read rebuilds them instead of serving the old list for up to an hour.
 */
export const forgetSelectOptions = async (): Promise<void> => {
	await Cache.deleteMany([PermissionSelectOptionsCacheKey(), RoleSelectOptionsCacheKey()]);
};
