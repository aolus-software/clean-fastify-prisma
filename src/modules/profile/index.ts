import { UserInformation } from "@types";
import { ResponseToolkit } from "@utils";
import { FastifyInstance } from "fastify";

import {
	ProfileResponseSchema,
	ServerErrorResponseSchema,
	SuccessResponseSchema,
	UnauthorizedResponseSchema,
	UpdatePasswordBodySchema,
	UpdateProfileBodySchema,
	ValidationErrorResponseSchema,
} from "./schema";
import { ProfileService } from "./service";

export default function (fastify: FastifyInstance) {
	fastify.addHook("onRequest", async (request, reply) => {
		await request.authenticate(reply);
	});

	// GET /profile
	fastify.get(
		"",
		{
			schema: {
				tags: ["Profile"],
				description: "Get authenticated user's profile information.",
				security: [{ BearerAuth: [] }],
				response: {
					200: ProfileResponseSchema,
					401: UnauthorizedResponseSchema,
					500: ServerErrorResponseSchema,
				},
			},
		},
		async (request, reply) => {
			return ResponseToolkit.success<UserInformation>(
				reply,
				request.userInformation,
				"Profile retrieved successfully",
			);
		},
	);

	// PUT /profile
	fastify.put(
		"",
		{
			schema: {
				tags: ["Profile"],
				description: "Update authenticated user's profile information.",
				security: [{ BearerAuth: [] }],
				body: UpdateProfileBodySchema,
				response: {
					200: ProfileResponseSchema,
					401: UnauthorizedResponseSchema,
					422: ValidationErrorResponseSchema,
					500: ServerErrorResponseSchema,
				},
			},
		},
		async (request, reply) => {
			const userId = request.userInformation.id;
			const { name, email, remarks } = request.body as {
				name: string;
				email: string;
				remarks?: string;
			};
			const service = fastify.di.resolve(ProfileService);
			const updatedUser = await service.updateProfile(userId, { name, email, remarks });

			return ResponseToolkit.success<UserInformation>(
				reply,
				updatedUser,
				"Profile updated successfully",
			);
		},
	);

	// PATCH /profile/password
	fastify.patch(
		"/password",
		{
			schema: {
				tags: ["Profile"],
				description: "Update authenticated user's password.",
				security: [{ BearerAuth: [] }],
				body: UpdatePasswordBodySchema,
				response: {
					200: SuccessResponseSchema,
					401: UnauthorizedResponseSchema,
					422: ValidationErrorResponseSchema,
					500: ServerErrorResponseSchema,
				},
			},
		},
		async (request, reply) => {
			const userId = request.userInformation.id;
			const { currentPassword, password } = request.body as {
				currentPassword: string;
				password: string;
			};
			const service = fastify.di.resolve(ProfileService);
			await service.updatePassword(userId, { currentPassword, password });

			return ResponseToolkit.success(reply, {}, "Password updated successfully");
		},
	);
}
