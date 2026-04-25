import { Router } from 'express';
import { notificationController } from './notification.controller.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { validate } from '../../middlewares/validate.js';
import {
  registerTokenSchema,
  deleteTokenSchema,
  listNotificationsSchema,
  readNotificationSchema,
} from './notification.schema.js';

const router = Router();

router.use(authenticate);

/**
 * @openapi
 * tags:
 *   name: Notifications
 *   description: Push notifications & token management
 */

/**
 * @openapi
 * /notifications/tokens:
 *   post:
 *     tags: [Notifications]
 *     summary: Register a device token for push notifications
 *     security: [{ BearerAuth: [] }]
 */
router.post('/tokens', validate(registerTokenSchema), asyncHandler(notificationController.registerToken));

/**
 * @openapi
 * /notifications/tokens/{token}:
 *   delete:
 *     tags: [Notifications]
 *     summary: Remove a device token
 *     security: [{ BearerAuth: [] }]
 */
router.delete('/tokens/:token', validate(deleteTokenSchema), asyncHandler(notificationController.deleteToken));

/**
 * @openapi
 * /notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: List user notifications
 *     security: [{ BearerAuth: [] }]
 */
router.get('/', validate(listNotificationsSchema), asyncHandler(notificationController.listNotifications));

/**
 * @openapi
 * /notifications/{id}/read:
 *   patch:
 *     tags: [Notifications]
 *     summary: Mark a notification as read
 *     security: [{ BearerAuth: [] }]
 */
router.patch('/:id/read', validate(readNotificationSchema), asyncHandler(notificationController.markAsRead));

export default router;
