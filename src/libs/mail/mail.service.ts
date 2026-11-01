import { AppConfig, MailConfig } from "@config";
import { logger } from "@utils";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { transporter } from "./transport.mail";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface EmailOptions {
	to: string;
	subject: string;
	template?: string;
	variables?: Record<string, string>;
	html?: string;
	text?: string;
}

export const EmailService = {
	async sendEmail(options: EmailOptions) {
		let htmlContent = options.html;

		if (options.template) {
			try {
				const templatePath = path.join(__dirname, "templates", `${options.template}.html`);
				htmlContent = fs.readFileSync(templatePath, "utf-8");

				if (options.variables) {
					Object.entries(options.variables).forEach(([key, value]) => {
						htmlContent = htmlContent?.replace(new RegExp(`{{${key}}}`, "g"), value);
					});
				}
			} catch (error) {
				throw new Error("Error when parsing the template file", { cause: error });
			}
		}

		if (AppConfig.APP_ENV !== "production") {
			options.subject = `[${AppConfig.APP_ENV.toUpperCase()}] ${options.subject}`;
		}

		const mailOptions = {
			from: MailConfig.from || "noreply@yourapp.com",
			to: options.to,
			subject: options.subject,
			html: htmlContent,
			text: options.text,
		};

		logger.info({ template: options.template }, "Sending email");

		return await transporter
			.sendMail({ ...mailOptions })
			.then(() => {
				logger.info({ template: options.template }, "Email sent");
			})
			.catch((error: unknown) => {
				/**
				 * SMTP error messages can quote the recipient address, so only the error code
				 * and the SMTP response code are logged or passed on.
				 */
				const { code, responseCode } = (error ?? {}) as {
					code?: string;
					responseCode?: number;
				};
				logger.error({ template: options.template, code, responseCode }, "Failed to send email");
				throw new Error(
					`Failed to send email (${code ?? "unknown"}${responseCode ? ` ${responseCode}` : ""})`,
				);
			});
	},
};
