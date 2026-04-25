import cron from 'node-cron';
import logger from '../config/logger.js';
import { renewalQueue } from './queue.js';
import prisma from '../config/database.js';

export function startCronJobs() {
  // Meal reminders - Every day at 7:00 AM
  cron.schedule('0 7 * * *', async () => {
    logger.info('[Cron] Running meal reminder job...');
    // Demo implementation for sending reminders
  });

  // Subscription auto-renew crawler - Every day at 11:00 PM
  cron.schedule('0 23 * * *', async () => {
    logger.info('[Cron] Running subscription auto-renew crawler...');
    
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const expiringSubs = await prisma.subscription.findMany({
      where: {
        status: 'active',
        autoRenew: true,
        endDate: {
          gte: todayStart,
          lte: todayEnd,
        },
      },
    });

    for (const sub of expiringSubs) {
      await renewalQueue.add('renew_subscription', { subscriptionId: sub.id });
    }
    
    logger.info(`[Cron] Enqueued ${expiringSubs.length} subscriptions for auto-renewal.`);
  });

  logger.info('[Cron] Cron jobs started.');
}
