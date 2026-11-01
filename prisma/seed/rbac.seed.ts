import { db } from "@database/postgres/client";

export const PERMISSION_GROUPS = ["user", "role", "permission"] as const;
export const PERMISSION_ACTIONS = ["list", "create", "detail", "edit", "delete"] as const;
export const SEEDED_ROLES = ["superuser", "admin"] as const;

export const permissionCatalogue = PERMISSION_GROUPS.flatMap((group) =>
	PERMISSION_ACTIONS.map((action) => ({ name: `${group} ${action}`, group })),
);

/**
 * Idempotent: rows that exist are left alone, missing grants are added. The
 * grant read is scoped to the catalogue names, so a permission an operator
 * created later is never granted automatically.
 */
export const RBACSeeder = async (): Promise<void> => {
	await db.permission.createMany({
		data: permissionCatalogue,
		skipDuplicates: true,
	});
	await db.role.createMany({
		data: SEEDED_ROLES.map((name) => ({ name })),
		skipDuplicates: true,
	});

	const [permissions, roles] = await Promise.all([
		db.permission.findMany({
			where: { name: { in: permissionCatalogue.map((p) => p.name) } },
			select: { id: true },
		}),
		db.role.findMany({
			where: { name: { in: [...SEEDED_ROLES] } },
			select: { id: true },
		}),
	]);

	await db.rolePermission.createMany({
		data: roles.flatMap((role) =>
			permissions.map((permission) => ({
				roleId: role.id,
				permissionId: permission.id,
			})),
		),
		skipDuplicates: true,
	});
};
