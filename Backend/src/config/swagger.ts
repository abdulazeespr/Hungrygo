import swaggerJsdoc from 'swagger-jsdoc';
import { config } from './index.js';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Hungrygo API',
      version: '1.0.0',
      description:
        'Hungrygo — Mess Discovery & Subscription Platform. ' +
        'OTP-based phone authentication, nearby mess search, ' +
        'meal subscriptions, and cancellation with wallet credits.',
      contact: { name: 'Hungrygo Team', email: 'dev@hungrygo.in' },
    },
    servers: [
      { url: `http://localhost:${config.PORT}/api/v1`, description: 'Local' },
      { url: 'https://api.hungrygo.in/api/v1',          description: 'Production' },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Access token from POST /auth/verify-otp',
        },
      },
      schemas: {
        // ── Shared response wrappers ───────────────────────────────────────
        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data:    { type: 'object' },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code:    { type: 'string', example: 'AUTH_INVALID_OTP' },
                message: { type: 'string', example: 'The OTP entered is incorrect.' },
                details: { type: 'array', items: { type: 'object' } },
              },
            },
          },
        },
        // ── User ──────────────────────────────────────────────────────────
        User: {
          type: 'object',
          properties: {
            id:          { type: 'string', format: 'uuid' },
            phone:       { type: 'string', example: '9876543210' },
            name:        { type: 'string', nullable: true, example: 'Ananya Sharma' },
            email:       { type: 'string', nullable: true, example: 'ananya@example.com' },
            role:        { type: 'string', enum: ['customer', 'mess_owner', 'admin'] },
            dietaryPref: { type: 'string', enum: ['veg', 'non_veg', 'egg'] },
            isVerified:  { type: 'boolean' },
            createdAt:   { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  },
  // Glob pattern — swagger-jsdoc scans these files for @openapi JSDoc blocks
  apis: ['./src/modules/**/*.routes.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
