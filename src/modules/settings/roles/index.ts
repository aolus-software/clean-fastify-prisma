import {
	buildDatatableQueryParamsSchema,
	createSuccessPaginationResponseSchema,
	createSuccessResponseSchema,
	DatatableToolkit,
	ForbiddenResponseSchema,
	NotFoundResponseSchema,
	ResponseToolkit,
	ServerErrorResponseSchema,
	UnauthorizedResponseSchema,
} from "@utils";
import { FastifyInstance } from "fastify";
import { z } from "zod";

import {
	CreateRoleSchema,
	RoleDetailResponseSchema,
	RoleResponseSchema,
	UpdateRoleSchema,
} from "./schema";
import { RoleService } from "./service";

export default function (fastify: FastifyInstance) {
	fastify.addHook("onRequest", async (request, reply) => {
		await request.authenticate(reply);
	});

	// GET /settings/roles
	fastify.get(
		"/",
		{
			schema: {
				tags: ["Settings/Roles"],
				security: [{ BearerAuth: [] }],
				querystring: buildDatatableQueryParamsSchema(
					["id", "name", "created_at", "updated_at"],
					["name", "created_at", "updated_at"],
				),
				response: {
					200: createSuccessPaginationResponseSchema(RoleResponseSchema),
					401: UnauthorizedResponseSchema,
					403: ForbiddenResponseSchema,
					500: ServerErrorResponseSchema,
				},
			},
		},
		async (request, reply) => {
			const queryParams = DatatableToolkit.parseFilter(request);
			const service = fastify.di.resolve(RoleService);
			const data = await service.findAll(queryParams);

			return ResponseToolkit.success(reply, data, "Roles fetched");
		},
	);

	// POST /settings/roles
	fastify.post(
		"/",
		{
			schema: {
				tags: ["Settings/Roles"],
				security: [{ BearerAuth: [] }],
				body: CreateRoleSchema,
				response: {
					201: createSuccessResponseSchema(z.object({}), 201),
					401: UnauthorizedResponseSchema,
					403: ForbiddenResponseSchema,
					500: ServerErrorResponseSchema,
				},
			},
		},
		async (request, reply) => {
			const service = fastify.di.resolve(RoleService);
			await service.create(request.body as z.infer<typeof CreateRoleSchema>);

			return ResponseToolkit.success(reply, {}, "Role created", 201);
		},
	);

	// GET /settings/roles/:roleId
	fastify.get(
		"/:roleId",
		{
			schema: {
				tags: ["Settings/Roles"],
				security: [{ BearerAuth: [] }],
				params: z.object({ roleId: z.string().uuid() }),
				response: {
					200: createSuccessResponseSchema(RoleDetailResponseSchema),
					401: UnauthorizedResponseSchema,
					403: ForbiddenResponseSchema,
					404: NotFoundResponseSchema,
					500: ServerErrorResponseSchema,
				},
			},
		},
		async (request, reply) => {
			const { roleId } = request.params as { roleId: string };
			const service = fastify.di.resolve(RoleService);
			const data = await service.detail(roleId);

			return ResponseToolkit.success(reply, data, "Role detail fetched");
		},
	);

	// PUT /settings/roles/:roleId
	fastify.put(
		"/:roleId",
		{
			schema: {
				tags: ["Settings/Roles"],
				security: [{ BearerAuth: [] }],
				params: z.object({ roleId: z.string().uuid() }),
				body: UpdateRoleSchema,
				response: {
					200: createSuccessResponseSchema(z.object({})),
					401: UnauthorizedResponseSchema,
					403: ForbiddenResponseSchema,
					404: NotFoundResponseSchema,
					500: ServerErrorResponseSchema,
				},
			},
		},
		async (request, reply) => {
			const { roleId } = request.params as { roleId: string };
			const service = fastify.di.resolve(RoleService);
			await service.update(roleId, request.body as z.infer<typeof UpdateRoleSchema>);

			return ResponseToolkit.success(reply, {}, "Role updated");
		},
	);

	// DELETE /settings/roles/:roleId
	fastify.delete(
		"/:roleId",
		{
			schema: {
				tags: ["Settings/Roles"],
				security: [{ BearerAuth: [] }],
				params: z.object({ roleId: z.string().uuid() }),
				response: {
					200: createSuccessResponseSchema(z.object({})),
					401: UnauthorizedResponseSchema,
					403: ForbiddenResponseSchema,
					404: NotFoundResponseSchema,
					500: ServerErrorResponseSchema,
				},
			},
		},
		async (request, reply) => {
			const { roleId } = request.params as { roleId: string };
			const service = fastify.di.resolve(RoleService);
			await service.delete(roleId);

			return ResponseToolkit.success(reply, {}, "Role deleted");
		},
	);
}
