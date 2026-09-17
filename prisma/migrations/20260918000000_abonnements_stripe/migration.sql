-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SubscriptionStatus" ADD VALUE 'INCOMPLETE';
ALTER TYPE "SubscriptionStatus" ADD VALUE 'INCOMPLETE_EXPIRED';
ALTER TYPE "SubscriptionStatus" ADD VALUE 'UNPAID';
ALTER TYPE "SubscriptionStatus" ADD VALUE 'PAUSED';

-- DropForeignKey
ALTER TABLE "prospects" DROP CONSTRAINT "prospects_salesRepId_fkey";

-- AlterTable
ALTER TABLE "contracts" ADD COLUMN     "pharmacyId" TEXT,
ADD COLUMN     "planId" TEXT,
ADD COLUMN     "trialDays" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'eur',
ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stripePriceId" TEXT,
ADD COLUMN     "stripeProductId" TEXT,
ADD COLUMN     "trialDays" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
-- Le code d'offre passe d'une énumération à un texte libre, SANS perdre les
-- valeurs existantes (« ESSENTIEL », « PRO », « GROUPE »).
ALTER TABLE "plans" ALTER COLUMN "code" TYPE TEXT USING "code"::text;

-- AlterTable
ALTER TABLE "prospects" ALTER COLUMN "salesRepId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "cancelAt" TIMESTAMP(3),
ADD COLUMN     "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "contractId" TEXT,
ADD COLUMN     "endedAt" TIMESTAMP(3),
ADD COLUMN     "lastPaymentAt" TIMESTAMP(3),
ADD COLUMN     "lastPaymentCents" INTEGER,
ADD COLUMN     "lastPaymentFailedAt" TIMESTAMP(3),
ADD COLUMN     "nextInvoiceAt" TIMESTAMP(3),
ADD COLUMN     "stripePriceId" TEXT,
ADD COLUMN     "stripeSubscriptionId" TEXT,
ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "suspendedReason" TEXT,
ADD COLUMN     "trialStartsAt" TIMESTAMP(3);

-- DropEnum
DROP TYPE "PlanCode";

-- CreateTable
CREATE TABLE "subscription_invites" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "contractId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "sentTo" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "openedAt" TIMESTAMP(3),
    "stripeCustomerId" TEXT,
    "checkoutSessionId" TEXT,
    "checkoutCreatedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_payments" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "stripeInvoiceId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'eur',
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "hostedInvoiceUrl" TEXT,
    "invoicePdfUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_events" (
    "id" TEXT NOT NULL,
    "stripeEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "organizationId" TEXT,
    "pharmacyId" TEXT,
    "summary" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "billing_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_invites_tokenHash_key" ON "subscription_invites"("tokenHash");

-- CreateIndex
CREATE INDEX "subscription_invites_pharmacyId_idx" ON "subscription_invites"("pharmacyId");

-- CreateIndex
CREATE UNIQUE INDEX "billing_payments_stripeInvoiceId_key" ON "billing_payments"("stripeInvoiceId");

-- CreateIndex
CREATE INDEX "billing_payments_organizationId_createdAt_idx" ON "billing_payments"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "billing_events_stripeEventId_key" ON "billing_events"("stripeEventId");

-- CreateIndex
CREATE INDEX "billing_events_organizationId_receivedAt_idx" ON "billing_events"("organizationId", "receivedAt");

-- CreateIndex
CREATE INDEX "billing_events_receivedAt_idx" ON "billing_events"("receivedAt");

-- CreateIndex
CREATE INDEX "contracts_pharmacyId_idx" ON "contracts"("pharmacyId");

-- CreateIndex
CREATE UNIQUE INDEX "plans_stripePriceId_key" ON "plans"("stripePriceId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_externalCustomerId_key" ON "subscriptions"("externalCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripeSubscriptionId_key" ON "subscriptions"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- AddForeignKey
ALTER TABLE "subscription_invites" ADD CONSTRAINT "subscription_invites_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_invites" ADD CONSTRAINT "subscription_invites_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_invites" ADD CONSTRAINT "subscription_invites_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_payments" ADD CONSTRAINT "billing_payments_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_salesRepId_fkey" FOREIGN KEY ("salesRepId") REFERENCES "sales_reps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
