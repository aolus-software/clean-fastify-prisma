import { PermissionRepository, RoleRepository } from "@database";
import { t } from "@i18n";
import {
	createSuccessResponseSchema,
	ForbiddenResponseSchema,
	ResponseToolkit,
	ServerErrorResponseSchema,
	UnauthorizedResponseSchema,
} from "@utils";
import { FastifyInstance } from "fastify";

import { SelectPermissionResponseSchema, SelectRoleResponseSchema } from "./schema";

export default function (fastify: FastifyInstance) {
	fastify.addHook("onRequest", async (request, reply) => {
		await request.authenticate(reply);
	});

	// GET /settings/select/permissions
	fastify.get(
		"/permissions",
		{
			schema: {
				tags: ["Settings/Select"],
				description: "Get list of permissions for select inputs.",
				security: [{ BearerAuth: [] }],
				response: {
					200: createSuccessResponseSchema(SelectPermissionResponseSchema),
					401: UnauthorizedResponseSchema,
					403: ForbiddenResponseSchema,
					500: ServerErrorResponseSchema,
				},
			},
		},
		async (request, reply) => {
			request.requireSuperuser(reply);
			const permissions = await PermissionRepository().getSelectOptions();

			return ResponseToolkit.success(reply, permissions, t("settings.select.permissionsFetched"));
		},
	);

	// GET /settings/select/roles
	fastify.get(
		"/roles",
		{
			schema: {
				tags: ["Settings/Select"],
				description: "Get list of roles for select inputs.",
				security: [{ BearerAuth: [] }],
				response: {
					200: createSuccessResponseSchema(SelectRoleResponseSchema),
					401: UnauthorizedResponseSchema,
					403: ForbiddenResponseSchema,
					500: ServerErrorResponseSchema,
				},
			},
		},
		async (request, reply) => {
			request.requireSuperuser(reply);
			const roles = await RoleRepository().getSelectOptions();

			return ResponseToolkit.success(reply, roles, t("settings.select.rolesFetched"));
		},
	);
}
