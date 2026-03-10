import { HttpError, UnprocessableEntityError } from "@fastify-libs";
import { ResponseToolkit } from "@utils";
import Fastify, { FastifyError } from "fastify";
import fp from "fastify-plugin";

interface ValidationError {
	instancePath: string;
	schemaPath?: string;
	message?: string;
}

interface ErrorWithStatusCode {
	statusCode?: number;
	message: string;
}

// eslint-disable-next-line @typescript-eslint/require-await
export default fp(async function (fastify) {
	fastify.setErrorHandler(function (error: FastifyError, request, reply) {
		if (error instanceof UnprocessableEntityError) {
			ResponseToolkit.validationError(reply, error.validationErrors || []);
			return;
		}

		if (error.validation) {
			const errors = error.validation.map((err: ValidationError) => ({
				[err.instancePath.replace(/^\//, "") || err.schemaPath || "body"]:
					err.message || "Invalid value",
			}));

			ResponseToolkit.validationError(reply, errors);
			return;
		}

		if (error instanceof HttpError) {
			ResponseToolkit.error(reply, error.message, error._statusCode);
			return;
		}

		if (error instanceof Fastify.errorCodes.FST_ERR_NOT_FOUND) {
			ResponseToolkit.notFound(reply, error.message);
			return;
		}

		if (error instanceof Fastify.errorCodes.FST_ERR_BAD_STATUS_CODE) {
			ResponseToolkit.error(reply, error.message, 400);
			return;
		}

		if (error instanceof Fastify.errorCodes.FST_ERR_VALIDATION) {
			ResponseToolkit.error(reply, error.message, 400);
			return;
		}

		if (error instanceof Fastify.errorCodes.FST_ERR_CTP_INVALID_MEDIA_TYPE) {
			ResponseToolkit.error(reply, error.message, 415);
			return;
		}

		if (error instanceof Fastify.errorCodes.FST_ERR_CTP_BODY_TOO_LARGE) {
			ResponseToolkit.error(reply, error.message, 413);
			return;
		}

		if (
			(error as ErrorWithStatusCode).statusCode &&
			(error as ErrorWithStatusCode).statusCode! >= 400 &&
			(error as ErrorWithStatusCode).statusCode! < 500
		) {
			ResponseToolkit.error(reply, error.message, error.statusCode ?? 400);
			return;
		}

		request.log.error({
			message: "APP Error",
			error: error.message,
			stack: error.stack,
			name: error.name || "undefined",
		});

		ResponseToolkit.error(reply, "Internal Server Error", 500);
	});
});
