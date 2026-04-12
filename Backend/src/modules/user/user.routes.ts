import { Router } from 'express';
import { userController } from './user.controller.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { updateUserSchema, createAddressSchema, updateAddressSchema, addressParamsSchema } from './user.schema.js';

const router = Router();

// All user routes require authentication
router.use(authenticate);

/**
 * @openapi
 * /users/me:
 *   get:
 *     tags: [Users]
 *     summary: Get current user profile
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Current user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: 'boolean', example: true }
 *                 data: { $ref: '#/components/schemas/User' }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *   patch:
 *     tags: [Users]
 *     summary: Update current user profile
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:        { type: 'string', example: 'Ananya Sharma' }
 *               email:       { type: 'string', format: 'email' }
 *               dietaryPref: { type: 'string', enum: ['veg', 'non_veg', 'egg'] }
 *     responses:
 *       200:
 *         description: Updated user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: 'boolean', example: true }
 *                 data: { $ref: '#/components/schemas/User' }
 */
router.get('/me', asyncHandler(userController.getMe));
router.patch('/me', validate(updateUserSchema), asyncHandler(userController.updateMe));

/**
 * @openapi
 * /users/me/addresses:
 *   get:
 *     tags: [Users]
 *     summary: List user addresses
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Address list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: 'boolean', example: true }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Address' }
 *   post:
 *     tags: [Users]
 *     summary: Add a delivery address
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fullAddress, city, state, pincode, lat, lng]
 *             properties:
 *               label:       { type: 'string', example: 'Home' }
 *               fullAddress: { type: 'string', example: 'Flat 302, Sunrise Apts' }
 *               city:        { type: 'string', example: 'Pune' }
 *               state:       { type: 'string', example: 'Maharashtra' }
 *               pincode:     { type: 'string', example: '411038' }
 *               lat:         { type: 'number', example: 18.5074 }
 *               lng:         { type: 'number', example: 73.8077 }
 *               isDefault:   { type: 'boolean', example: true }
 *     responses:
 *       201:
 *         description: Address created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: 'boolean', example: true }
 *                 data: { $ref: '#/components/schemas/Address' }
 */
router.post('/me/addresses', validate(createAddressSchema), asyncHandler(userController.createAddress));
router.get('/me/addresses', asyncHandler(userController.getAddresses));

router.patch(
  '/me/addresses/:id',
  validate({ ...addressParamsSchema, ...updateAddressSchema }),
  asyncHandler(userController.updateAddress),
);

router.delete(
  '/me/addresses/:id',
  validate(addressParamsSchema),
  asyncHandler(userController.deleteAddress),
);

export default router;
