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
        // ── Phase 2 Schemas ───────────────────────────────────────────────
        Address: {
          type: 'object',
          properties: {
            id:          { type: 'string', format: 'uuid' },
            label:       { type: 'string', example: 'Home' },
            fullAddress: { type: 'string', example: 'Flat 302, Sunrise Apts, Kothrud' },
            city:        { type: 'string', example: 'Pune' },
            state:       { type: 'string', example: 'Maharashtra' },
            pincode:     { type: 'string', example: '411038' },
            lat:         { type: 'number', example: 18.5074 },
            lng:         { type: 'number', example: 73.8077 },
            isDefault:   { type: 'boolean' },
          },
        },
        MessProvider: {
          type: 'object',
          properties: {
            id:           { type: 'string', format: 'uuid' },
            name:         { type: 'string', example: 'Sunita Tiffin Center' },
            dietaryType:  { type: 'string', enum: ['veg', 'non_veg', 'both'] },
            avgRating:    { type: 'number', example: 4.3 },
            totalReviews: { type: 'integer', example: 87 },
            coverImage:   { type: 'string', nullable: true },
            city:         { type: 'string', example: 'Pune' },
            status:       { type: 'string', enum: ['pending', 'active', 'suspended', 'closed'] },
            opensAt:      { type: 'string', example: '07:00' },
            closesAt:     { type: 'string', example: '21:00' },
          },
        },
        MessWithDistance: {
          allOf: [
            { '$ref': '#/components/schemas/MessProvider' },
            { type: 'object', properties: {
                distanceKm:   { type: 'number', example: 1.2 },
                cheapestPlan: {
                  type: 'object', nullable: true,
                  properties: {
                    mealSlot:     { type: 'string', example: 'lunch' },
                    durationType: { type: 'string', example: 'monthly' },
                    price:        { type: 'number', example: 2200 },
                  },
                },
            }},
          ],
        },
        PricingPlan: {
          type: 'object',
          properties: {
            id:           { type: 'string', format: 'uuid' },
            mealSlot:     { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'full_day'] },
            durationType: { type: 'string', enum: ['daily', 'weekly', 'monthly'] },
            price:        { type: 'number', example: 2200 },
            isActive:     { type: 'boolean' },
          },
        },
        MenuItem: {
          type: 'object',
          properties: {
            name:        { type: 'string', example: 'Dal Tadka' },
            description: { type: 'string', example: 'Yellow lentils with ghee' },
            isSpecial:   { type: 'boolean', example: false },
          },
        },
        Menu: {
          type: 'object',
          properties: {
            mealSlot:  { type: 'string', enum: ['breakfast', 'lunch', 'dinner'] },
            isHoliday: { type: 'boolean' },
            items:     { type: 'array', items: { '$ref': '#/components/schemas/MenuItem' } },
            photoUrl:  { type: 'string', nullable: true },
          },
        },
      },
    },
  },
  // Glob pattern — swagger-jsdoc scans these files for @openapi JSDoc blocks
  apis: ['./src/modules/**/*.routes.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
