/*
  Warnings:

  - You are about to drop the column `location` on the `mess_providers` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "SubStatus" AS ENUM ('pending_payment', 'active', 'paused', 'cancelled', 'expired');

-- CreateEnum
CREATE TYPE "MealSlotStatus" AS ENUM ('scheduled', 'delivered', 'cancelled', 'skipped');

-- CreateEnum
CREATE TYPE "WalletTxType" AS ENUM ('credit', 'debit');

-- DropIndex
DROP INDEX "idx_mess_location";

-- AlterTable
ALTER TABLE "mess_providers" DROP COLUMN "location";

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "mess_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "meal_slot" "MealSlot" NOT NULL,
    "duration_type" "DurationType" NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "SubStatus" NOT NULL DEFAULT 'active',
    "auto_renew" BOOLEAN NOT NULL DEFAULT true,
    "total_amount" DECIMAL(10,2) NOT NULL,
    "pause_start" DATE,
    "pause_end" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_slots" (
    "id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "meal_slot" "MealSlot" NOT NULL,
    "status" "MealSlotStatus" NOT NULL DEFAULT 'scheduled',
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "credit_issued" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meal_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_wallet" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "balance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "type" "WalletTxType" NOT NULL,
    "reason" TEXT,
    "reference_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subscriptions_user_id_idx" ON "subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "subscriptions_mess_id_idx" ON "subscriptions"("mess_id");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE INDEX "meal_slots_subscription_id_idx" ON "meal_slots"("subscription_id");

-- CreateIndex
CREATE INDEX "meal_slots_date_idx" ON "meal_slots"("date");

-- CreateIndex
CREATE INDEX "meal_slots_status_idx" ON "meal_slots"("status");

-- CreateIndex
CREATE UNIQUE INDEX "credit_wallet_user_id_key" ON "credit_wallet"("user_id");

-- CreateIndex
CREATE INDEX "wallet_transactions_user_id_idx" ON "wallet_transactions"("user_id");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_mess_id_fkey" FOREIGN KEY ("mess_id") REFERENCES "mess_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "pricing_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_slots" ADD CONSTRAINT "meal_slots_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_wallet" ADD CONSTRAINT "credit_wallet_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_user_id_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_user_id_wallet_fkey" FOREIGN KEY ("user_id") REFERENCES "credit_wallet"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Custom additions for Phase 3
-- Partial unique index: one ACTIVE subscription per user+mess+slot
CREATE UNIQUE INDEX idx_subs_active_unique
  ON subscriptions(user_id, mess_id, meal_slot)
  WHERE status = 'active';

-- Wallet balance never negative
ALTER TABLE credit_wallet
  ADD CONSTRAINT balance_non_negative CHECK (balance >= 0);

