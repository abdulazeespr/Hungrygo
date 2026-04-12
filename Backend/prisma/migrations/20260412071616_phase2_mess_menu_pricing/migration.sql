-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('customer', 'mess_owner', 'admin');

-- CreateEnum
CREATE TYPE "DietaryPref" AS ENUM ('veg', 'non_veg', 'egg');

-- CreateEnum
CREATE TYPE "DietaryType" AS ENUM ('veg', 'non_veg', 'both');

-- CreateEnum
CREATE TYPE "MessStatus" AS ENUM ('pending', 'active', 'suspended', 'closed');

-- CreateEnum
CREATE TYPE "MealSlot" AS ENUM ('breakfast', 'lunch', 'dinner', 'full_day');

-- CreateEnum
CREATE TYPE "DurationType" AS ENUM ('daily', 'weekly', 'monthly');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "phone" VARCHAR(15) NOT NULL,
    "email" VARCHAR(255),
    "name" VARCHAR(100),
    "role" "UserRole" NOT NULL DEFAULT 'customer',
    "dietary_pref" "DietaryPref" NOT NULL DEFAULT 'veg',
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addresses" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "label" VARCHAR(50) NOT NULL DEFAULT 'Home',
    "full_address" TEXT NOT NULL,
    "city" VARCHAR(100) NOT NULL,
    "state" VARCHAR(100) NOT NULL,
    "pincode" VARCHAR(10) NOT NULL,
    "lat" DECIMAL(10,7) NOT NULL,
    "lng" DECIMAL(10,7) NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mess_providers" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "fssai_number" VARCHAR(20),
    "phone" VARCHAR(15),
    "address" TEXT NOT NULL,
    "city" VARCHAR(100) NOT NULL,
    "pincode" VARCHAR(10),
    "lat" DECIMAL(10,7) NOT NULL,
    "lng" DECIMAL(10,7) NOT NULL,
    "dietary_type" "DietaryType" NOT NULL DEFAULT 'veg',
    "status" "MessStatus" NOT NULL DEFAULT 'pending',
    "avg_rating" DECIMAL(3,2) NOT NULL DEFAULT 0.00,
    "total_reviews" INTEGER NOT NULL DEFAULT 0,
    "cover_image" TEXT,
    "opens_at" VARCHAR(5) NOT NULL DEFAULT '07:00',
    "closes_at" VARCHAR(5) NOT NULL DEFAULT '22:00',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mess_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_plans" (
    "id" UUID NOT NULL,
    "mess_id" UUID NOT NULL,
    "meal_slot" "MealSlot" NOT NULL,
    "duration_type" "DurationType" NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menus" (
    "id" UUID NOT NULL,
    "mess_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "meal_slot" "MealSlot" NOT NULL,
    "items" JSONB NOT NULL DEFAULT '[]',
    "photo_url" TEXT,
    "is_holiday" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_phone_idx" ON "users"("phone");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "addresses_user_id_idx" ON "addresses"("user_id");

-- CreateIndex
CREATE INDEX "mess_providers_owner_id_idx" ON "mess_providers"("owner_id");

-- CreateIndex
CREATE INDEX "mess_providers_status_idx" ON "mess_providers"("status");

-- CreateIndex
CREATE INDEX "mess_providers_city_idx" ON "mess_providers"("city");

-- CreateIndex
CREATE INDEX "pricing_plans_mess_id_idx" ON "pricing_plans"("mess_id");

-- CreateIndex
CREATE UNIQUE INDEX "pricing_plans_mess_id_meal_slot_duration_type_key" ON "pricing_plans"("mess_id", "meal_slot", "duration_type");

-- CreateIndex
CREATE INDEX "menus_mess_id_date_idx" ON "menus"("mess_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "menus_mess_id_date_meal_slot_key" ON "menus"("mess_id", "date", "meal_slot");

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mess_providers" ADD CONSTRAINT "mess_providers_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_plans" ADD CONSTRAINT "pricing_plans_mess_id_fkey" FOREIGN KEY ("mess_id") REFERENCES "mess_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menus" ADD CONSTRAINT "menus_mess_id_fkey" FOREIGN KEY ("mess_id") REFERENCES "mess_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enable PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- Add GEOGRAPHY column to mess_providers (generated from lat/lng)
ALTER TABLE mess_providers
  ADD COLUMN location GEOGRAPHY(POINT, 4326)
  GENERATED ALWAYS AS (
    ST_SetSRID(ST_MakePoint(lng::float8, lat::float8), 4326)::geography
  ) STORED;

-- GIST index for radius queries
CREATE INDEX idx_mess_location ON mess_providers USING GIST(location);
