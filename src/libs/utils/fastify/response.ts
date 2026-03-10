import { FastifyReply } from "fastify";

export class ResponseToolkit {
	static success<T>(
		reply: FastifyReply,
		data: T | null,
		message: string = "Success",
		statusCode: number = 200,
	) {
		return reply.status(statusCode).send({
			status: statusCode,
			success: true,
			message,
			data,
		});
	}

	static error<T>(
		reply: FastifyReply,
		message: string,
		statusCode: number = 400,
		data?: T,
	) {
		return reply.status(statusCode).send({
			status: statusCode,
			success: false,
			message,
			data,
		});
	}

	static notFound(reply: FastifyReply, message: string = "Resource not found") {
		return this.error(reply, message, 404);
	}

	static unauthorized(reply: FastifyReply, message: string = "Unauthorized") {
		return this.error(reply, message, 401);
	}

	static validationError(
		reply: FastifyReply,
		errors: Array<{ field: string; message: string } | { [key: string]: string }>,
		message: string = "Validation failed",
		statusCode: number = 422,
	) {
		return reply.status(statusCode).send({
			status: statusCode,
			success: false,
			message,
			errors,
		});
	}
}
