import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import logger from './logger.js';

const createPrismaClient = () => {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  });

  const client = new PrismaClient({
    adapter,
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'warn' },
    ],
  });

  if (process.env.NODE_ENV === 'development') {
    client.$on('query', (e) => {
      if (e.duration > 200) {
        logger.warn('Slow Prisma query', { query: e.query, duration: `${e.duration}ms` });
      }
    });
  }

  client.$on('error', (e) => logger.error('Prisma error', { message: e.message }));

  return client;
};

// Singleton pattern — prevent multiple instances in dev hot-reload
const globalForPrisma = globalThis as unknown as { prisma: ReturnType<typeof createPrismaClient> };
const prisma = globalForPrisma.prisma ?? createPrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
