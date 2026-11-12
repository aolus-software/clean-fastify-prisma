import {
	Cache,
	PermissionSelectOptionsCacheKey,
	RoleSelectOptionsCacheKey,
	SelectOptionsCacheTtl,
} from "@cache";
import { PermissionRepository, RoleRepository } from "@database";
import { injectable } from "@fastify-libs";
import { PermissionSelectOptions } from "@types";

/** Both lists are cached in Redis for an hour; role and permission writes call `forgetSelectOptions`. */
@injectable()
export class SelectOptionService {
	async permissions(): Promise<PermissionSelectOptions[]> {
		const options = await Cache.remember(
			PermissionSelectOptionsCacheKey(),
			() => PermissionRepository().getSelectOptions(),
			SelectOptionsCacheTtl,
		);
		return options ?? [];
	}

	async roles(): Promise<{ id: string; name: string }[]> {
		const options = await Cache.remember(
			RoleSelectOptionsCacheKey(),
			() => RoleRepository().getSelectOptions(),
			SelectOptionsCacheTtl,
		);
		return options ?? [];
	}
}
