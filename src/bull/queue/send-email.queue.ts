import { RedisClient } from "@database";
import { Queue } from "bullmq";

export const sendEmailQueue = new Queue("send-email", {
	connection: RedisClient.getQueueConnectionOptions(),
});
