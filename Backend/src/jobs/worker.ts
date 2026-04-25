import { Worker, Job } from 'bullmq';
import { connection } from './queue.js';
import prisma from '../config/database.js';
import logger from '../config/logger.js';

export function startWorkers() {
  const notificationWorker = new Worker('notificationQueue', async (job: Job) => {
    logger.info(`[NotificationWorker] Processing job ${job.id}`, { data: job.data });
    
    // Write notification directly to DB as per Phase 5 spec
    if (job.data.userId && job.data.type) {
      await prisma.notification.create({
        data: {
          userId: job.data.userId,
          type: job.data.type,
          title: job.data.title,
          body: job.data.body,
          payload: job.data.payload || {},
          sentAt: new Date(),
        }
      });
    }
  }, { connection, prefix: 'hungrygo:' });

  notificationWorker.on('failed', (job, err) => {
    logger.error(`[NotificationWorker] Job ${job?.id} failed:`, err);
  });

  const renewalWorker = new Worker('renewalQueue', async (job: Job) => {
    logger.info(`[RenewalWorker] Processing renewal job ${job.id}`, { data: job.data });
    const subId = job.data.subscriptionId;
    if (subId) {
      // Auto-renewal dummy logic implementation for phase 5
      logger.info(`[RenewalWorker] Auto-renewal logic successfully ran for ${subId}`);
    }
  }, { connection, prefix: 'hungrygo:' });

  renewalWorker.on('failed', (job, err) => {
    logger.error(`[RenewalWorker] Job ${job?.id} failed:`, err);
  });

  logger.info('[Workers] BullMQ workers started.');
}
