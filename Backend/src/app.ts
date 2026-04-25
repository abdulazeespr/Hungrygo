import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import { config } from './config/index.js';
import { swaggerSpec } from './config/swagger.js';
import logger from './config/logger.js';
import { requestLogger } from './middlewares/requestLogger.js';
import { errorHandler } from './middlewares/errorHandler.js';
import authRoutes from './modules/auth/auth.routes.js';
import userRoutes from './modules/user/user.routes.js';
import messRoutes from './modules/mess/mess.routes.js';
import menuRoutes from './modules/menu/menu.routes.js';
import subscriptionRoutes from './modules/subscription/subscription.routes.js';
import mealSlotRoutes from './modules/meal-slot/meal-slot.routes.js';
import walletRoutes from './modules/wallet/wallet.routes.js';

const app = express();

// ─── Global Middleware (order matters) ───────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: config.NODE_ENV === 'production'
    ? ['https://hungrygo.in']
    : ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true,
}));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(requestLogger);

// ─── API Routes ──────────────────────────────────────────────────────────────
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/mess-providers', messRoutes);
app.use('/api/v1/mess-providers', menuRoutes); // mergeParams handles /:id/menus
app.use('/api/v1/subscriptions', subscriptionRoutes);
app.use('/api/v1/meal-slots', mealSlotRoutes);
app.use('/api/v1/wallet', walletRoutes);

// ─── Health Check ────────────────────────────────────────────────────────────
app.get('/api/v1/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } });
});

// ─── Swagger Docs (non-production only) ──────────────────────────────────────
if (config.NODE_ENV !== 'production') {
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'Hungrygo API Docs',
    swaggerOptions: { persistAuthorization: true },
  }));
  app.get('/api/docs.json', (_req, res) => res.json(swaggerSpec));
  logger.info('[Hungrygo] API docs available at /api/docs');
}

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'The requested resource was not found.' },
  });
});

// ─── Global Error Handler ────────────────────────────────────────────────────
app.use(errorHandler);

export default app;
