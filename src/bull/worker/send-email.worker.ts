import { RedisClient } from "@database";
import { EmailOptions, EmailService } from "@libs/mail/mail.service";
import { logger } from "@utils";
import { Worker } from "bullmq";

const worker = new Worker<EmailOptions>(
	"send-email",
	async (job) => {
		try {
			await EmailService.sendEmail(job.data);
			logger.info({ jobId: job.id, template: job.data.template }, "Email job processed");
		} catch (error) {
			logger.error(
				{ err: error, jobId: job.id, template: job.data.template },
				"Failed to process email job",
			);
			throw error;
		}
	},
	{
		connection: RedisClient.getQueueRedisClient(),
	},
);

worker.on("failed", (job, err) => {
	logger.error(err, `Job ${job ? job.id : "unknown"} failed`);
});

export { worker };
