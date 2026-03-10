import {
	BadRequestResponseSchema,
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
	ChangeUserPasswordSchema,
	CreateUserSchema,
	UpdateUserSchema,
	UserDetailResponseSchema,
	UserResponseSchema,
} from "./schema";
import { UserService } from "./service";

export default function (fastify: FastifyInstance) {
	fastify.addHook("onRequest", async (request, reply) => {
		await request.authenticate(reply);
	});

	// GET /settings/users
	fastify.get(
		"/",
		{
			schema: {
				tags: ["Settings/Users"],
				summary: "Get list of users",
				security: [{ BearerAuth: [] }],
				querystring: buildDatatableQueryParamsSchema(
					["id", "name", "email", "created_at", "updated_at"],
					["name", "email", "created_at", "updated_at"],
				),
				response: {
					200: createSuccessPaginationResponseSchema(UserResponseSchema),
					400: BadRequestResponseSchema,
					401: UnauthorizedResponseSchema,
					403: ForbiddenResponseSchema,
					500: ServerErrorResponseSchema,
				},
			},
		},
		async (request, reply) => {
			const queryParams = DatatableToolkit.parseFilter(request);
			const service = fastify.di.resolve(UserService);
			const data = await service.findAll(queryParams);

			return ResponseToolkit.success(reply, data, "Users fetched", 200);
		},
	);

	// POST /settings/users
	fastify.post(
		"/",
		{
			schema: {
				tags: ["Settings/Users"],
				summary: "Create a new user",
				security: [{ BearerAuth: [] }],
				body: CreateUserSchema,
				response: {
					201: createSuccessResponseSchema(z.object({}), 201),
					401: UnauthorizedResponseSchema,
					403: ForbiddenResponseSchema,
					422: BadRequestResponseSchema,
					500: ServerErrorResponseSchema,
				},
			},
		},
		async (request, reply) => {
			const service = fastify.di.resolve(UserService);
			await service.create(request.body as z.infer<typeof CreateUserSchema>);

			return ResponseToolkit.success(reply, {}, "User created", 201);
		},
	);

	// GET /settings/users/:userId
	fastify.get(
		"/:userId",
		{
			schema: {
				tags: ["Settings/Users"],
				summary: "Get user detail",
				security: [{ BearerAuth: [] }],
				params: z.object({ userId: z.string().uuid() }),
				response: {
					200: createSuccessResponseSchema(UserDetailResponseSchema),
					401: UnauthorizedResponseSchema,
					403: ForbiddenResponseSchema,
					404: NotFoundResponseSchema,
					500: ServerErrorResponseSchema,
				},
			},
		},
		async (request, reply) => {
			const { userId } = request.params as { userId: string };
			const service = fastify.di.resolve(UserService);
			const data = await service.detail(userId);

			return ResponseToolkit.success(reply, data, "User detail fetched");
		},
	);

	// PUT /settings/users/:userId
	fastify.put(
		"/:userId",
		{
			schema: {
				tags: ["Settings/Users"],
				summary: "Update user",
				security: [{ BearerAuth: [] }],
				params: z.object({ userId: z.string().uuid() }),
				body: UpdateUserSchema,
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
			const { userId } = request.params as { userId: string };
			const service = fastify.di.resolve(UserService);
			await service.update(userId, request.body as z.infer<typeof UpdateUserSchema>);

			return ResponseToolkit.success(reply, {}, "User updated");
		},
	);

	// DELETE /settings/users/:userId
	fastify.delete(
		"/:userId",
		{
			schema: {
				tags: ["Settings/Users"],
				summary: "Delete user",
				security: [{ BearerAuth: [] }],
				params: z.object({ userId: z.string().uuid() }),
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
			const { userId } = request.params as { userId: string };
			const service = fastify.di.resolve(UserService);
			await service.delete(userId);

			return ResponseToolkit.success(reply, {}, "User deleted");
		},
	);

	// PATCH /settings/users/:userId/change-password
	fastify.patch(
		"/:userId/change-password",
		{
			schema: {
				tags: ["Settings/Users"],
				summary: "Change user password",
				security: [{ BearerAuth: [] }],
				params: z.object({ userId: z.string().uuid() }),
				body: ChangeUserPasswordSchema,
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
			const { userId } = request.params as { userId: string };
			const body = request.body as z.infer<typeof ChangeUserPasswordSchema>;
			const service = fastify.di.resolve(UserService);
			await service.resetPassword(userId, { password: body.password });

			return ResponseToolkit.success(reply, {}, "Password changed");
		},
	);
}
