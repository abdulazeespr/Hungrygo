import { Router } from 'express';
import { walletController } from './wallet.controller.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { validate } from '../../middlewares/validate.js';
import { getTransactionsSchema } from './wallet.schema.js';

const router = Router();

// All wallet routes require authentication
router.use(authenticate);

/**
 * @openapi
 * /wallet:
 *   get:
 *     tags: [Wallet]
 *     summary: Get wallet balance
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Wallet balance
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     balance:   { type: number, example: 146.66 }
 *                     updatedAt: { type: string, format: date-time }
 */
router.get('/', asyncHandler(walletController.getBalance));

/**
 * @openapi
 * /wallet/transactions:
 *   get:
 *     tags: [Wallet]
 *     summary: Get wallet transaction history
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [credit, debit, all], default: all }
 *       - in: query
 *         name: cursor
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Transaction list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/WalletTransaction' }
 *                 meta:
 *                   type: object
 *                   properties:
 *                     cursor:   { type: string, nullable: true }
 *                     has_more: { type: boolean }
 */
router.get('/transactions', validate(getTransactionsSchema), asyncHandler(walletController.getTransactions));

export default router;

