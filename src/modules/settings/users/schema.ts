import { StrongPassword } from "@fastify-libs";
import { z } from "zod";

export const UserResponseSchema = z.object({
	id: z.string().uuid(),
	name: z.string(),
	email: z.string().email(),
	status: z.enum(["active", "inactive", "suspended", "blocked"]).nullable(),
	roles: z.array(z.string()).nullable(),
	created_at: z.date(),
	updated_at: z.date(),
});

export const UserDetailResponseSchema = UserResponseSchema.extend({
	roles: z
		.array(z.object({ id: z.string().uuid(), name: z.string() }))
		.nullable(),
	remark: z.string().nullable(),
});

export const CreateUserSchema = z.object({
	name: z.string().min(1).max(255),
	email: z.string().email().max(255),
	password: z.string().regex(StrongPassword),
	status: z.enum(["active", "inactive", "suspended", "blocked"]).optional(),
	remark: z.string().max(255).optional(),
	role_ids: z.array(z.string().uuid()),
});

export const UpdateUserSchema = z.object({
	name: z.string().min(1).max(255),
	email: z.string().email().max(255),
	status: z.enum(["active", "inactive", "suspended", "blocked"]),
	remark: z.string().max(255).optional(),
	role_ids: z.array(z.string().uuid()),
});

export const ChangeUserPasswordSchema = z.object({
	password: z.string().regex(StrongPassword),
});
