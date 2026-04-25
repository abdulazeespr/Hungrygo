import { Queue } from 'bullmq';
import { config } from '../config/index.js';
import IORedis from 'ioredis';

export const connection = new IORedis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export const notificationQueue = new Queue('notificationQueue', {
  connection,
  prefix: 'hungrygo:',
});

export const renewalQueue = new Queue('renewalQueue', {
  connection,
  prefix: 'hungrygo:',
});
