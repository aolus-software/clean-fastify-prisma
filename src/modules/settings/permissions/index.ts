import {
	BadRequestResponseSchema,
	buildDatatableQueryParamsSchema,
	createSuccessPaginationResponseSchema,
	createSuccessResponseSchema,
	DatatableToolkit,
	ForbiddenResponseSchema,
	ResponseToolkit,
	ServerErrorResponseSchema,
	UnauthorizedResponseSchema,
} from "@utils";
import { FastifyInstance } from "fastify";
import { z } from "zod";

import {
	CreatePermissionSchema,
	PermissionSchema,
	UpdatePermissionSchema,
} from "./schema";
import { PermissionService } from "./service";

export default function (fastify: FastifyInstance) {
	fastify.addHook("onRequest", async (request, reply) => {
		await request.authenticate(reply);
	});

	// GET /settings/permissions
	fastify.get(
		"/",
		{
			schema: {
				tags: ["Settings/Permissions"],
				security: [{ BearerAuth: [] }],
				querystring: buildDatatableQueryParamsSchema(
					["id", "name", "group", "created_at", "updated_at"],
					["name", "group", "created_at", "updated_at"],
				),
				response: {
					200: createSuccessPaginationResponseSchema(PermissionSchema),
					401: UnauthorizedResponseSchema,
					403: ForbiddenResponseSchema,
					500: ServerErrorResponseSchema,
				},
			},
		},
		async (request, reply) => {
			request.requireSuperuser(reply);
			const queryParams = DatatableToolkit.parseFilter(request);
			const service = fastify.di.resolve(PermissionService);
			const data = await service.findAll(queryParams);

			return ResponseToolkit.success(reply, data, "Permissions fetched");
		},
	);

	// POST /settings/permissions
	fastify.post(
		"/",
		{
			schema: {
				tags: ["Settings/Permissions"],
				security: [{ BearerAuth: [] }],
				body: CreatePermissionSchema,
				response: {
					201: createSuccessResponseSchema(z.object({})),
					401: UnauthorizedResponseSchema,
					403: ForbiddenResponseSchema,
					500: ServerErrorResponseSchema,
				},
			},
		},
		async (request, reply) => {
			request.requireSuperuser(reply);
			const { name, group } = request.body as { name: string[]; group: string };
			const service = fastify.di.resolve(PermissionService);
			await service.create({ name, group });

			return ResponseToolkit.success(reply, {}, "Permission created", 201);
		},
	);

	// GET /settings/permissions/:permissionId
	fastify.get(
		"/:permissionId",
		{
			schema: {
				tags: ["Settings/Permissions"],
				security: [{ BearerAuth: [] }],
				params: z.object({ permissionId: z.string().describe("Permission ID") }),
				response: {
					200: createSuccessResponseSchema(PermissionSchema),
					401: UnauthorizedResponseSchema,
					403: ForbiddenResponseSchema,
					500: ServerErrorResponseSchema,
				},
			},
		},
		async (request, reply) => {
			request.requireSuperuser(reply);
			const { permissionId } = request.params as { permissionId: string };
			const service = fastify.di.resolve(PermissionService);
			const data = await service.detail(permissionId);

			return ResponseToolkit.success(reply, data, "Permission detail fetched");
		},
	);

	// PUT /settings/permissions/:permissionId
	fastify.put(
		"/:permissionId",
		{
			schema: {
				tags: ["Settings/Permissions"],
				security: [{ BearerAuth: [] }],
				params: z.object({ permissionId: z.string().describe("Permission ID") }),
				body: UpdatePermissionSchema,
				response: {
					200: createSuccessResponseSchema(z.object({})),
					400: BadRequestResponseSchema,
					401: UnauthorizedResponseSchema,
					403: ForbiddenResponseSchema,
					500: ServerErrorResponseSchema,
				},
			},
		},
		async (request, reply) => {
			request.requireSuperuser(reply);
			const { permissionId } = request.params as { permissionId: string };
			const { name, group } = request.body as { name: string; group: string };
			const service = fastify.di.resolve(PermissionService);
			await service.update(permissionId, { name, group });

			return ResponseToolkit.success(reply, {}, "Permission updated");
		},
	);

	// DELETE /settings/permissions/:permissionId
	fastify.delete(
		"/:permissionId",
		{
			schema: {
				tags: ["Settings/Permissions"],
				security: [{ BearerAuth: [] }],
				params: z.object({ permissionId: z.string().describe("Permission ID") }),
				response: {
					200: createSuccessResponseSchema(z.object({})),
					401: UnauthorizedResponseSchema,
					403: ForbiddenResponseSchema,
					500: ServerErrorResponseSchema,
				},
			},
		},
		async (request, reply) => {
			request.requireSuperuser(reply);
			const { permissionId } = request.params as { permissionId: string };
			const service = fastify.di.resolve(PermissionService);
			await service.delete(permissionId);

			return ResponseToolkit.success(reply, {}, "Permission deleted");
		},
	);
}
