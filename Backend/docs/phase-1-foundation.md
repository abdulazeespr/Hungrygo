# Hungrygo — Phase 1: Foundation
> **LLM Instruction:** Use this document as the single source of truth to implement Phase 1 of the Hungrygo backend. Use **Prisma 7** with the new `prisma-client` generator, `prisma.config.ts`, and `@prisma/adapter-pg` driver adapter. Repository files use the `prisma` singleton internally. Follow folder structure, Prisma schema, API contracts, and task checklist exactly. Do not add features beyond what is listed here.

---

## 1. PRD Summary

### Goal
Set up the complete project foundation for **Hungrygo** — a mess discovery and subscription platform. This phase delivers: infrastructure, Prisma 7 setup, Redis, logging, error handling, and OTP-based phone authentication.

### Scope (Phase 1 only)
- Project scaffold: TypeScript (ESM), ESLint, Prettier, Jest
- `package.json` with `"type": "module"` (Prisma 7 requires ESM)
- Prisma 7 setup: `prisma-client` generator, `prisma.config.ts`, `@prisma/adapter-pg`
- Environment config validation with Zod (fail-fast on startup)
- Redis client (ioredis)
- Winston structured logging
- Global error handling including Prisma-specific errors
- JWT access + refresh token flow (HttpOnly cookie for refresh)
- OTP phone login: send OTP → verify OTP → issue tokens
- Token refresh and logout
- `authenticate`, `authorize`, `validate` middlewares
- Docker Compose: app + postgres + redis

### Out of Scope
Mess discovery, subscriptions, payments — Phases 2–5.

### Success Criteria
- Server starts and rejects startup on missing env vars
- `POST /api/v1/auth/send-otp` stores OTP in Redis 5-min TTL
- `POST /api/v1/auth/verify-otp` upserts user via Prisma 7, returns JWT
- `POST /api/v1/auth/refresh-token` issues new access token from HttpOnly cookie
- `POST /api/v1/auth/logout` deletes refresh token from Redis
- All errors return `{ success, error: { code, message, details? } }`
- Prisma client imported from `src/generated/prisma/client`

---

## 2. Prisma 7 Setup

### Key Prisma 7 Breaking Changes (from v6)
| What | v6 | v7 |
|---|---|---|
| Generator provider | `prisma-client-js` | `prisma-client` |
| Client output | `node_modules/@prisma/client` | Custom path required |
| `DATABASE_URL` location | `datasource` block in schema | `prisma.config.ts` |
| `PrismaClient()` constructor | No adapter needed | `new PrismaClient({ adapter })` required |
| Client import | `from '@prisma/client'` | `from './generated/prisma/client'` |
| Config file | None | `prisma.config.ts` at project root |
| Module format | CJS | ESM (`"type": "module"`) |
| Node.js minimum | 18 | 20.19 |

---

### File: `prisma/schema.prisma`
> This file will be extended in every subsequent phase. Never recreate it — only append.

```prisma
generator client {
  provider             = "prisma-client"
  output               = "../src/generated/prisma"
  importFileExtension  = "ts"
  // importFileExtension = "ts" is required when using tsx as the TypeScript runner
}

datasource db {
  provider = "postgresql"
  // NOTE: No `url` here in Prisma 7 — connection URL lives in prisma.config.ts
}

// ─────────────────────────────────────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────────────────────────────────────

enum UserRole {
  customer
  mess_owner
  admin
}

enum DietaryPref {
  veg
  non_veg
  egg
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 1 MODELS
// ─────────────────────────────────────────────────────────────────────────────

model User {
  id          String      @id @default(uuid()) @db.Uuid
  phone       String      @unique @db.VarChar(15)
  email       String?     @unique @db.VarChar(255)
  name        String?     @db.VarChar(100)
  role        UserRole    @default(customer)
  dietaryPref DietaryPref @default(veg)   @map("dietary_pref")
  isVerified  Boolean     @default(false) @map("is_verified")
  isActive    Boolean     @default(true)  @map("is_active")
  createdAt   DateTime    @default(now()) @map("created_at")
  updatedAt   DateTime    @updatedAt      @map("updated_at")

  @@index([phone])
  @@index([role])
  @@map("users")
}
```

---

### File: `prisma.config.ts` (project root)
```typescript
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
```

---

### File: `src/config/database.ts` — Prisma 7 Singleton
```typescript
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
```

> **Important:** In Prisma 7 with ESM, all local imports in generated files use `.js` extensions. Import as `'../generated/prisma/client.js'` even though the physical file is `.ts`.

---

### Redis Keys (Phase 1)

| Key Pattern | TTL | Type | Purpose |
|---|---|---|---|
| `otp:{phone}` | 300s | String | OTP value during phone verification |
| `otp_attempts:{phone}` | 3600s | Counter | Max 5 OTP requests/hr per phone |
| `rt:{userId}:{tokenId}` | 2592000s | String | Refresh token store for revocation |

---

## 3. Folder & File Structure

```
hungrygo-backend/
│
├── prisma/
│   ├── schema.prisma               # All phases append models here — never recreate
│   └── migrations/                 # Auto-generated by `prisma migrate dev`
│
├── prisma.config.ts                # Prisma 7 config — DB URL, schema path, migrations
│
├── src/
│   ├── generated/
│   │   └── prisma/                 # Auto-generated by `prisma generate` — DO NOT EDIT
│   │       ├── client.ts           # Import PrismaClient from here
│   │       ├── enums.ts
│   │       └── ...
│   │
│   ├── app.ts                      # Express app: middleware + route registration
│   ├── server.ts                   # HTTP server entry point + graceful shutdown
│   │
│   ├── config/
│   │   ├── index.ts                # Zod-validated env config (fail-fast)
│   │   ├── database.ts             # Prisma 7 singleton with PrismaPg adapter
│   │   ├── redis.ts                # ioredis client singleton
│   │   └── logger.ts               # Winston logger instance
│   │
│   ├── modules/
│   │   └── auth/
│   │       ├── auth.routes.ts
│   │       ├── auth.controller.ts
│   │       ├── auth.service.ts
│   │       ├── auth.repository.ts  # Only file that imports prisma from config/database
│   │       ├── auth.schema.ts      # Zod schemas
│   │       └── auth.types.ts
│   │
│   ├── middlewares/
│   │   ├── authenticate.ts
│   │   ├── authorize.ts
│   │   ├── validate.ts
│   │   ├── rateLimiter.ts
│   │   ├── requestLogger.ts
│   │   └── errorHandler.ts
│   │
│   └── shared/
│       ├── errors/
│       │   ├── AppError.ts
│       │   ├── HttpError.ts
│       │   └── errorCodes.ts
│       ├── types/
│       │   ├── express.d.ts        # Augments Express.Request with req.user
│       │   └── pagination.types.ts
│       └── utils/
│           ├── asyncHandler.ts
│           ├── response.ts
│           ├── jwt.ts
│           └── otp.ts
│
├── tests/
│   ├── unit/auth/
│   │   ├── auth.service.test.ts
│   │   └── auth.repository.test.ts
│   ├── integration/
│   │   └── auth.routes.test.ts
│   └── fixtures/
│       └── userFactory.ts
│
├── .env
├── .env.example
├── .eslintrc.json
├── .prettierrc
├── jest.config.ts
├── tsconfig.json
├── Dockerfile
├── docker-compose.yml
└── package.json
```

### Architecture Rules
- **Controller** → calls service only. No Prisma. No business logic.
- **Service** → calls repository only. All business logic lives here.
- **Repository** → only file that imports `prisma` from `config/database.ts`.
- **Transactions** → `prisma.$transaction(async (tx) => { ... })` in service layer; pass `tx` to repository methods as optional param.
- `asyncHandler` wraps every async controller. No try/catch in controllers.
- All errors thrown as `HttpError`. Caught by `errorHandler`.
- Generated client in `src/generated/prisma/` — never edit, never commit generated files in `.gitignore`.

---

## 4. Environment Variables

```bash
# .env.example

NODE_ENV=development
PORT=4000

# PostgreSQL — used by Prisma 7 via prisma.config.ts AND src/config/database.ts
DATABASE_URL=postgresql://hungrygo:password@localhost:5432/hungrygo_db

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_ACCESS_SECRET=minimum-32-character-access-secret-here
JWT_REFRESH_SECRET=different-minimum-32-character-refresh-secret
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d

# OTP
OTP_EXPIRES_IN_SECONDS=300
OTP_LENGTH=6

# Logging
LOG_LEVEL=info
```

---

## 5. Key Code Patterns

### 5.1 Config (src/config/index.ts)
```typescript
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV:               z.enum(['development', 'production', 'test']).default('development'),
  PORT:                   z.coerce.number().default(4000),
  DATABASE_URL:           z.string().url(),
  REDIS_URL:              z.string().url(),
  JWT_ACCESS_SECRET:      z.string().min(32),
  JWT_REFRESH_SECRET:     z.string().min(32),
  JWT_ACCESS_EXPIRES_IN:  z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  OTP_EXPIRES_IN_SECONDS: z.coerce.number().default(300),
  OTP_LENGTH:             z.coerce.number().default(6),
  LOG_LEVEL:              z.string().default('info'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('[Hungrygo] Invalid environment variables:', parsed.error.flatten());
  process.exit(1);
}

export const config = parsed.data;
```

### 5.2 Auth Repository (Prisma 7)
```typescript
// src/modules/auth/auth.repository.ts
import prisma from '../../config/database.js';
import type { User } from '../../generated/prisma/client.js';

export const authRepository = {
  async findByPhone(phone: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { phone } });
  },

  async upsertByPhone(phone: string): Promise<User> {
    return prisma.user.upsert({
      where:  { phone },
      update: { updatedAt: new Date() },
      create: { phone, isVerified: true },
    });
  },
};
```

### 5.3 Prisma Transaction Pattern
```typescript
// Use prisma.$transaction in service layer; pass tx to repository methods
const result = await prisma.$transaction(async (tx) => {
  const user = await tx.user.update({ where: { id }, data: { ... } });
  // pass tx into repo helpers that accept an optional client param
  return user;
});
```

### 5.4 errorHandler — Prisma 7 Error Handling
```typescript
import { Prisma } from '../generated/prisma/client.js';

// In errorHandler.ts — handle Prisma 7 known errors:
if (err instanceof Prisma.PrismaClientKnownRequestError) {
  if (err.code === 'P2002') {
    return res.status(409).json({ success: false,
      error: { code: 'CONFLICT', message: 'Resource already exists.' } });
  }
  if (err.code === 'P2025') {
    return res.status(404).json({ success: false,
      error: { code: 'NOT_FOUND', message: 'Record not found.' } });
  }
}
```

### 5.5 package.json (critical fields)
```json
{
  "name": "hungrygo-backend",
  "version": "1.0.0",
  "type": "module",
  "engines": { "node": ">=20.19.0" },
  "scripts": {
    "dev":             "tsx --env-file=.env watch src/server.ts",
    "build":           "tsc",
    "start":           "node dist/server.js",
    "db:migrate":      "prisma migrate dev",
    "db:migrate:prod": "prisma migrate deploy",
    "db:generate":     "prisma generate",
    "db:studio":       "prisma studio",
    "db:seed":         "tsx prisma/seed.ts",
    "test":            "node --experimental-vm-modules node_modules/.bin/jest",
    "lint":            "eslint src/**/*.ts"
  }
}
```

> **Note:** With `"type": "module"`, Jest needs `--experimental-vm-modules`. Use `ts-jest` with ESM config.

### 5.6 tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "baseUrl": "src",
    "paths": { "@/*": ["./*"] }
  },
  "include": ["src", "prisma.config.ts"],
  "exclude": ["node_modules", "dist", "src/generated"]
}
```

> `module: "NodeNext"` + `moduleResolution: "NodeNext"` required for ESM in Node.js.

---

## 6. API Endpoints

### Base URL: `/api/v1`

---

### POST `/auth/send-otp`
**Auth:** Public

**Request Body**
```json
{ "phone": "9876543210" }
```
**Zod Schema**
```typescript
z.object({ body: z.object({
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Invalid Indian mobile number'),
})})
```
**Success `200`**
```json
{ "success": true, "data": { "message": "OTP sent successfully", "expires_in": 300 } }
```
**Errors**

| Code | HTTP | Condition |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Invalid phone format |
| `AUTH_OTP_RATE_LIMITED` | 429 | > 5 requests/hr for this phone |

**Redis:** `SET otp:{phone} {otp} EX 300` · `INCR otp_attempts:{phone}` + `EXPIRE 3600`

---

### POST `/auth/verify-otp`
**Auth:** Public

**Request Body**
```json
{ "phone": "9876543210", "otp": "482910" }
```
**Success `200`** — sets `HttpOnly; Secure; SameSite=Strict` cookie `refreshToken`
```json
{
  "success": true,
  "data": {
    "access_token": "eyJ...",
    "user": { "id": "uuid", "phone": "9876543210", "name": null, "role": "customer" }
  }
}
```
**Errors**

| Code | HTTP | Condition |
|---|---|---|
| `AUTH_INVALID_OTP` | 400 | OTP mismatch |
| `AUTH_OTP_EXPIRED` | 400 | Redis key missing (TTL elapsed) |

**Redis:** `DEL otp:{phone}` · `SET rt:{userId}:{tokenId} "1" EX 2592000`

---

### POST `/auth/refresh-token`
**Auth:** Public — reads `refreshToken` HttpOnly cookie

**Success `200`**
```json
{ "success": true, "data": { "access_token": "eyJ..." } }
```
**Errors:** `AUTH_MISSING_TOKEN` 401 · `AUTH_INVALID_TOKEN` 401

---

### POST `/auth/logout`
**Auth:** Bearer

**Success `200`**
```json
{ "success": true, "data": { "message": "Logged out successfully" } }
```
**Redis:** `DEL rt:{userId}:{tokenId}` · clears cookie

---

### Standard Error Shape
```json
{
  "success": false,
  "error": { "code": "AUTH_INVALID_OTP", "message": "The OTP entered is incorrect.", "details": [] }
}
```

---

## 7. OpenAPI Documentation

### 7.1 Overview
Hungrygo uses **`swagger-jsdoc`** to generate the OpenAPI 3.0 spec from JSDoc comments in route files, and **`swagger-ui-express`** to serve the interactive docs at `/api/docs`.

- Spec is generated at runtime from JSDoc — no separate YAML file to maintain
- Each phase adds JSDoc comments to its own route files
- The Swagger UI is available only in `development` and `staging` environments

---

### 7.2 New Files (Phase 1)

```
src/
├── config/
│   └── swagger.ts          # swagger-jsdoc options + spec generation
└── app.ts                  # mount swagger-ui-express at /api/docs
```

---

### 7.3 Install Dependencies
```bash
npm install swagger-jsdoc swagger-ui-express
npm install --save-dev @types/swagger-jsdoc @types/swagger-ui-express
```

---

### 7.4 File: `src/config/swagger.ts`
```typescript
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
```

---

### 7.5 Mount in `src/app.ts`
```typescript
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger.js';

// Only expose docs in non-production
if (config.NODE_ENV !== 'production') {
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'Hungrygo API Docs',
    swaggerOptions: { persistAuthorization: true },
  }));
  app.get('/api/docs.json', (_req, res) => res.json(swaggerSpec));
  logger.info('[Hungrygo] API docs available at /api/docs');
}
```

---

### 7.6 Auth Routes — JSDoc OpenAPI Comments

Add these JSDoc blocks directly above each route handler registration in `src/modules/auth/auth.routes.ts`:

```typescript
/**
 * @openapi
 * /auth/send-otp:
 *   post:
 *     tags: [Auth]
 *     summary: Send OTP to phone number
 *     description: >
 *       Generates a 6-digit OTP and stores it in Redis for 5 minutes.
 *       Rate limited to 5 requests per hour per phone number.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone]
 *             properties:
 *               phone:
 *                 type: string
 *                 pattern: '^[6-9]\d{9}$'
 *                 example: '9876543210'
 *     responses:
 *       200:
 *         description: OTP sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:    { type: string, example: 'OTP sent successfully' }
 *                     expires_in: { type: integer, example: 300 }
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example:
 *               success: false
 *               error: { code: 'VALIDATION_ERROR', message: 'Invalid Indian mobile number' }
 *       429:
 *         description: Rate limit exceeded
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example:
 *               success: false
 *               error: { code: 'AUTH_OTP_RATE_LIMITED', message: 'Too many OTP requests. Try again in 1 hour.' }
 */
router.post('/send-otp', validate(sendOtpSchema), asyncHandler(authController.sendOtp));

/**
 * @openapi
 * /auth/verify-otp:
 *   post:
 *     tags: [Auth]
 *     summary: Verify OTP and issue tokens
 *     description: >
 *       Verifies the OTP sent to the phone number. On success,
 *       returns a short-lived access token in the response body
 *       and sets a long-lived refresh token as an HttpOnly cookie.
 *       Creates the user account if it does not exist (upsert).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone, otp]
 *             properties:
 *               phone: { type: string, example: '9876543210' }
 *               otp:   { type: string, minLength: 6, maxLength: 6, example: '482910' }
 *     responses:
 *       200:
 *         description: Authentication successful
 *         headers:
 *           Set-Cookie:
 *             description: HttpOnly refresh token cookie (refreshToken)
 *             schema: { type: string }
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     access_token: { type: string, example: 'eyJhbGci...' }
 *                     user:         { $ref: '#/components/schemas/User' }
 *       400:
 *         description: Invalid or expired OTP
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             examples:
 *               invalid:
 *                 value: { success: false, error: { code: 'AUTH_INVALID_OTP', message: 'The OTP entered is incorrect.' } }
 *               expired:
 *                 value: { success: false, error: { code: 'AUTH_OTP_EXPIRED', message: 'OTP has expired. Please request a new one.' } }
 */
router.post('/verify-otp', validate(verifyOtpSchema), asyncHandler(authController.verifyOtp));

/**
 * @openapi
 * /auth/refresh-token:
 *   post:
 *     tags: [Auth]
 *     summary: Refresh access token
 *     description: >
 *       Reads the `refreshToken` HttpOnly cookie and returns a new
 *       short-lived access token. The refresh token is validated
 *       against Redis to support revocation.
 *     responses:
 *       200:
 *         description: New access token issued
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     access_token: { type: string, example: 'eyJhbGci...' }
 *       401:
 *         description: Missing or invalid refresh token
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post('/refresh-token', asyncHandler(authController.refreshToken));

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Logout and revoke refresh token
 *     description: >
 *       Deletes the refresh token from Redis, making it immediately invalid.
 *       Clears the `refreshToken` HttpOnly cookie.
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message: { type: string, example: 'Logged out successfully' }
 *       401:
 *         description: Missing or invalid access token
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post('/logout', authenticate, asyncHandler(authController.logout));
```

---

## 8. Frontend Pages (Minimal Reference)

| Page | Route | Description |
|---|---|---|
| Login | `/login` | Phone input form |
| OTP Verify | `/login/verify` | 6-digit OTP input |

---

## 9. Tasks & Subtasks Checklist

### 9.1 Project Scaffold
- [ ] `npm init -y` — set `"name": "hungrygo-backend"`, `"type": "module"`, `"engines": { "node": ">=20.19.0" }`
- [ ] Install prod deps: `express @prisma/client @prisma/adapter-pg pg ioredis zod jsonwebtoken winston helmet cors cookie-parser uuid date-fns dotenv`
- [ ] Install dev deps: `prisma typescript tsx @typescript-eslint/eslint-plugin eslint prettier jest ts-jest @jest/globals supertest @types/express @types/node @types/jsonwebtoken @types/cookie-parser @types/jest @types/supertest @types/pg`
- [ ] `tsconfig.json` — `module: "NodeNext"`, `moduleResolution: "NodeNext"`, `strict: true`, include `prisma.config.ts`
- [ ] `.eslintrc.json` — extends `@typescript-eslint/recommended`, parser `@typescript-eslint/parser`
- [ ] `.prettierrc`
- [ ] `jest.config.ts` — `preset: 'ts-jest/presets/default/jest-preset-esm'`, `extensionsToTreatAsEsm: ['.ts']`
- [ ] `.gitignore` — add `src/generated/` (never commit generated Prisma client)

### 9.2 Prisma 7 Setup
- [ ] `npm install prisma@7 @prisma/client@7 @prisma/adapter-pg@7`
- [ ] `npx prisma init` — generates `prisma/schema.prisma` + `prisma.config.ts`
- [ ] Replace generated `prisma/schema.prisma` with Phase 1 schema above (new `prisma-client` provider, `output`, no `url` in datasource)
- [ ] Replace generated `prisma.config.ts` with config above
- [ ] `npx prisma migrate dev --name init_users` — creates migration + generates client into `src/generated/prisma/`
- [ ] Verify `src/generated/prisma/client.ts` exists and exports `PrismaClient`
- [ ] `src/config/database.ts` — PrismaPg adapter singleton as shown in Section 2
- [ ] Add `"postinstall": "prisma generate"` to `package.json`

### 9.3 Config & Infrastructure
- [ ] `src/config/index.ts` — Zod env schema, `safeParse`, `process.exit(1)` on failure; log `[Hungrygo]` prefix
- [ ] `src/config/redis.ts` — `new Redis(config.REDIS_URL)`, log connect/error events, export `redis`
- [ ] `src/config/logger.ts` — Winston: JSON (prod), colorized simple (dev), file transports `logs/error.log` + `logs/combined.log`

### 9.4 Shared Utilities
- [ ] `AppError.ts` — `class AppError extends Error { statusCode; code; isOperational; }` with `Error.captureStackTrace`
- [ ] `HttpError.ts` — `class HttpError extends AppError { constructor(status, code, message) }`
- [ ] `errorCodes.ts`:
  ```typescript
  export const ErrorCodes = {
    VALIDATION_ERROR:       'VALIDATION_ERROR',
    AUTH_INVALID_OTP:       'AUTH_INVALID_OTP',
    AUTH_OTP_EXPIRED:       'AUTH_OTP_EXPIRED',
    AUTH_OTP_RATE_LIMITED:  'AUTH_OTP_RATE_LIMITED',
    AUTH_MISSING_TOKEN:     'AUTH_MISSING_TOKEN',
    AUTH_INVALID_TOKEN:     'AUTH_INVALID_TOKEN',
    AUTH_FORBIDDEN:         'AUTH_FORBIDDEN',
  } as const;
  ```
- [ ] `express.d.ts` — declare `req.user: { id: string; role: string; phone: string }`
- [ ] `asyncHandler.ts`
- [ ] `response.ts` — `success<T>(data, meta?)` and `paginated<T>(items, cursor, hasMore)`
- [ ] `jwt.ts` — `signAccessToken`, `signRefreshToken`, `verifyAccessToken`, `verifyRefreshToken`
- [ ] `otp.ts` — `generateOtp(length)`, `sendOtp(phone, otp)` (logger.info in dev)

### 9.5 Middlewares
- [ ] `validate.ts` — Zod `parseAsync({ body, query, params, cookies })` → `next(err)` on ZodError
- [ ] `authenticate.ts` — extract Bearer token → `verifyAccessToken` → `req.user`
- [ ] `authorize.ts` — `authorize(...roles)` factory → check `req.user.role`
- [ ] `rateLimiter.ts` — Redis INCR/EXPIRE sliding window
- [ ] `requestLogger.ts` — log `{ method, url, statusCode, responseTimeMs }` on finish
- [ ] `errorHandler.ts` — handle in order:
  1. `ZodError` → 400 `VALIDATION_ERROR`
  2. `Prisma.PrismaClientKnownRequestError P2002` → 409 `CONFLICT`
  3. `Prisma.PrismaClientKnownRequestError P2025` → 404 `NOT_FOUND`
  4. `AppError` (isOperational) → statusCode + code
  5. Unknown → 500, log full stack
  - Import `Prisma` from `'../generated/prisma/client.js'`

### 9.6 Auth Module
- [ ] `auth.types.ts`:
  ```typescript
  export interface JwtPayload    { sub: string; role: string; phone: string; }
  export interface RefreshPayload { sub: string; tokenId: string; }
  export interface AuthTokens    { accessToken: string; refreshToken: string; tokenId: string; }
  ```
- [ ] `auth.schema.ts` — `sendOtpSchema`, `verifyOtpSchema`
- [ ] `auth.repository.ts` — `findByPhone`, `upsertByPhone` using Prisma 7 client
- [ ] `auth.service.ts` — `sendOtp`, `verifyOtp`, `refreshToken`, `logout`
- [ ] `auth.controller.ts` — 4 `asyncHandler`-wrapped handlers; `verifyOtp` sets HttpOnly cookie; `logout` clears it
- [ ] `auth.routes.ts`

### 9.7 App & Server
- [ ] `src/app.ts` — middleware order: `helmet` → `cors` → `express.json` → `cookieParser` → `requestLogger` → routes → 404 → `errorHandler`
- [ ] `src/server.ts`:
  ```typescript
  const server = app.listen(config.PORT, () =>
    logger.info(`[Hungrygo] Server running on port ${config.PORT} (${config.NODE_ENV})`));
  process.on('SIGTERM', async () => {
    await prisma.$disconnect();
    redis.disconnect();
    server.close(() => process.exit(0));
  });
  ```

### 9.8 Docker
- [ ] `Dockerfile` — multi-stage:
  - Stage `builder`: `node:22-alpine`, `npm ci`, `prisma generate`, `tsc`
  - Stage `runner`: `node:22-alpine`, non-root `appuser`, copy `dist/` + `src/generated/` + `prisma/`, run `prisma migrate deploy && node dist/server.js`
- [ ] `docker-compose.yml`:
  ```yaml
  services:
    postgres: image: postgres:16-alpine, volumes: [pgdata]
    redis:    image: redis:7-alpine
    app:      depends_on: [postgres, redis], env_file: .env
  volumes:
    pgdata:
  ```

### 9.8 OpenAPI Setup
- [ ] `npm install swagger-jsdoc swagger-ui-express @types/swagger-jsdoc @types/swagger-ui-express`
- [ ] `src/config/swagger.ts` — `swaggerJsdoc` options with server URLs, `components.schemas` (User, SuccessResponse, ErrorResponse), glob `apis: ["./src/modules/**/*.routes.ts"]`
- [ ] Mount `swagger-ui-express` in `src/app.ts` at `/api/docs` — only when `NODE_ENV !== "production"`
- [ ] Expose raw spec at `GET /api/docs.json`
- [ ] Add JSDoc `@openapi` blocks to `auth.routes.ts` for all 4 auth endpoints (as shown in Section 7.6)
- [ ] Verify docs load at http://localhost:4000/api/docs in dev

### 9.9 Tests
- [ ] `tests/fixtures/userFactory.ts` — `buildUser(overrides?)` returning mock `User` type from `src/generated/prisma/client.ts`
- [ ] `tests/unit/auth/auth.service.test.ts` — mock `authRepository` + `redis`; test rate limit, OTP mismatch, OTP expired
- [ ] `tests/unit/auth/auth.repository.test.ts` — mock `prisma`; test `upsertByPhone` idempotency
- [ ] `tests/integration/auth.routes.test.ts` — supertest full flow: send-otp → verify-otp → refresh → logout
