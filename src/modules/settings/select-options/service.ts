import { PermissionRepository, RoleRepository } from "@database";
import { injectable } from "@fastify-libs";
import { PermissionSelectOptions } from "@types";

@injectable()
export class SelectOptionService {
	async permissions(): Promise<PermissionSelectOptions[]> {
		return await PermissionRepository().getSelectOptions();
	}

	async roles(): Promise<{ id: string; name: string }[]> {
		return await RoleRepository().getSelectOptions();
	}
}
