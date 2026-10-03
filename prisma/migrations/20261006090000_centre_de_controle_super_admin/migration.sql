-- Centre de contrôle Super Admin : ajouts uniquement (aucune colonne ni table supprimée).

-- CreateEnum
CREATE TYPE "CancellationStatus" AS ENUM ('RECEIVED', 'IN_PROGRESS', 'CONFIRMED', 'CANCELED', 'COMPLETED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ProspectStatus" ADD VALUE 'DEMO_SCHEDULED';
ALTER TYPE "ProspectStatus" ADD VALUE 'DEMO_DONE';

-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "annualPriceCents" INTEGER,
ADD COLUMN     "discountLabel" TEXT,
ADD COLUMN     "discountPercent" INTEGER,
ADD COLUMN     "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "foundingPriceCents" INTEGER,
ADD COLUMN     "maxUsers" INTEGER,
ADD COLUMN     "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "contractPriceCents" INTEGER;

-- AlterTable
ALTER TABLE "prospects" ADD COLUMN     "demoAt" TIMESTAMP(3),
ADD COLUMN     "demoDoneAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "contracts" ADD COLUMN     "companySnapshot" JSONB,
ADD COLUMN     "pharmacySnapshot" JSONB,
ADD COLUMN     "reference" TEXT;

-- AlterTable
ALTER TABLE "email_dispatches" ADD COLUMN     "contractId" TEXT,
ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "ruleKey" TEXT,
ADD COLUMN     "sentByAdminId" TEXT,
ADD COLUMN     "subject" TEXT,
ADD COLUMN     "templateKey" TEXT,
ADD COLUMN     "trigger" TEXT;

-- CreateTable
CREATE TABLE "subscription_price_changes" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "previousCents" INTEGER,
    "nextCents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "appliedToStripe" BOOLEAN NOT NULL DEFAULT false,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_price_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_notes" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT,
    "prospectId" TEXT,
    "body" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "authorAdminId" TEXT NOT NULL,
    "authorLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cancellation_requests" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "status" "CancellationStatus" NOT NULL DEFAULT 'RECEIVED',
    "reason" TEXT NOT NULL,
    "reasonDetail" TEXT,
    "channel" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL,
    "plannedEndAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "lastContactAt" TIMESTAMP(3),
    "stripeScheduled" BOOLEAN NOT NULL DEFAULT false,
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cancellation_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cancellation_events" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "actorAdminId" TEXT,
    "actorLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cancellation_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_templates" (
    "key" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "updatedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "automation_rules" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "offsetDays" INTEGER NOT NULL,
    "updatedByAdminId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "automation_dispatches" (
    "id" TEXT NOT NULL,
    "ruleKey" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "pharmacyId" TEXT,
    "status" TEXT NOT NULL,
    "recipient" TEXT,
    "detail" TEXT,
    "emailDispatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_dispatches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subscription_price_changes_subscriptionId_createdAt_idx" ON "subscription_price_changes"("subscriptionId", "createdAt");

-- CreateIndex
CREATE INDEX "admin_notes_pharmacyId_createdAt_idx" ON "admin_notes"("pharmacyId", "createdAt");

-- CreateIndex
CREATE INDEX "admin_notes_prospectId_createdAt_idx" ON "admin_notes"("prospectId", "createdAt");

-- CreateIndex
CREATE INDEX "cancellation_requests_status_idx" ON "cancellation_requests"("status");

-- CreateIndex
CREATE INDEX "cancellation_requests_pharmacyId_createdAt_idx" ON "cancellation_requests"("pharmacyId", "createdAt");

-- CreateIndex
CREATE INDEX "cancellation_events_requestId_createdAt_idx" ON "cancellation_events"("requestId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "automation_dispatches_dedupeKey_key" ON "automation_dispatches"("dedupeKey");

-- CreateIndex
CREATE INDEX "automation_dispatches_ruleKey_createdAt_idx" ON "automation_dispatches"("ruleKey", "createdAt");

-- CreateIndex
CREATE INDEX "automation_dispatches_pharmacyId_createdAt_idx" ON "automation_dispatches"("pharmacyId", "createdAt");

-- CreateIndex
CREATE INDEX "prospects_demoAt_idx" ON "prospects"("demoAt");

-- CreateIndex
CREATE INDEX "email_dispatches_createdAt_idx" ON "email_dispatches"("createdAt");

-- CreateIndex
CREATE INDEX "email_dispatches_ruleKey_createdAt_idx" ON "email_dispatches"("ruleKey", "createdAt");

-- AddForeignKey
ALTER TABLE "subscription_price_changes" ADD CONSTRAINT "subscription_price_changes_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_notes" ADD CONSTRAINT "admin_notes_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_notes" ADD CONSTRAINT "admin_notes_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "prospects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cancellation_requests" ADD CONSTRAINT "cancellation_requests_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cancellation_requests" ADD CONSTRAINT "cancellation_requests_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cancellation_events" ADD CONSTRAINT "cancellation_events_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "cancellation_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Tarif contractuel des abonnements existants : le prix du contrat qui les
-- fonde, sinon celui de leur offre au moment de cette migration. Ensuite, le
-- catalogue ne le modifie plus jamais.
UPDATE "subscriptions" s
SET "contractPriceCents" = COALESCE(
  (SELECT c."monthlyPriceCents" FROM "contracts" c WHERE c."id" = s."contractId"),
  (SELECT p."monthlyPriceCents" FROM "plans" p WHERE p."id" = s."planId")
)
WHERE s."contractPriceCents" IS NULL;
