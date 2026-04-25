import { Router } from 'express';
import { adminController } from './admin.controller.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import { listUsersSchema, listMessesSchema, updateMessStatusSchema } from './admin.schema.js';

const router = Router();

router.use(authenticate);
router.use(authorize('admin'));

/**
 * @openapi
 * tags:
 *   name: Admin
 *   description: Administrative operations
 */

/**
 * @openapi
 * /admin/metrics:
 *   get:
 *     tags: [Admin]
 *     summary: Get overall platform metrics
 *     security: [{ BearerAuth: [] }]
 */
router.get('/metrics', asyncHandler(adminController.getPlatformMetrics));

/**
 * @openapi
 * /admin/users:
 *   get:
 *     tags: [Admin]
 *     summary: List all users
 *     security: [{ BearerAuth: [] }]
 */
router.get('/users', validate(listUsersSchema), asyncHandler(adminController.listUsers));

/**
 * @openapi
 * /admin/messes:
 *   get:
 *     tags: [Admin]
 *     summary: List all mess providers
 *     security: [{ BearerAuth: [] }]
 */
router.get('/messes', validate(listMessesSchema), asyncHandler(adminController.listMesses));

/**
 * @openapi
 * /admin/messes/{id}/status:
 *   patch:
 *     tags: [Admin]
 *     summary: Update status of a mess provider
 *     security: [{ BearerAuth: [] }]
 */
router.patch('/messes/:id/status', validate(updateMessStatusSchema), asyncHandler(adminController.updateMessStatus));

export default router;
