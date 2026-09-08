-- CreateEnum
CREATE TYPE "SalesCommissionType" AS ENUM ('FIXED', 'PERCENT', 'RECURRING');

-- CreateEnum
CREATE TYPE "ProspectStatus" AS ENUM ('PROSPECT', 'CONTACTED', 'INTERESTED', 'PROPOSAL_SENT', 'CONTRACT_SENT', 'CONTRACT_SIGNED', 'PHARMACY_CREATED', 'ACTIVATED', 'LOST');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'SENT', 'OPENED', 'SIGNED_PHARMACY', 'SIGNED_COMPANY', 'FINALIZED', 'REFUSED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('FORECAST', 'EARNED', 'PAYABLE', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProspectEventType" AS ENUM ('CREATED', 'STATUS_CHANGED', 'NOTE', 'EMAIL_SENT', 'CONTRACT_GENERATED', 'CONTRACT_SENT', 'CONTRACT_OPENED', 'CONTRACT_SIGNED', 'CONTRACT_REFUSED', 'CONTRACT_EXPIRED', 'PHARMACY_CREATED', 'COMMISSION_CREATED', 'COMMISSION_UPDATED', 'COMMISSION_PAID', 'TASK_CREATED', 'TASK_DONE', 'ASSIGNED', 'BLOCKED', 'UNBLOCKED');

-- CreateEnum
CREATE TYPE "ExtranetAudience" AS ENUM ('SALES', 'ADMIN');

-- CreateTable
CREATE TABLE "sales_reps" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "zone" TEXT,
    "commissionType" "SalesCommissionType" NOT NULL DEFAULT 'FIXED',
    "commissionValue" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "invitedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "passwordResetTokenHash" TEXT,
    "passwordResetExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_reps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_rep_sessions" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "salesRepId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "ipAddress" TEXT,

    CONSTRAINT "sales_rep_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prospects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "addressLine1" TEXT,
    "postalCode" TEXT,
    "city" TEXT,
    "finessNumber" TEXT,
    "siret" TEXT,
    "outletCount" INTEGER,
    "salesRepId" TEXT NOT NULL,
    "status" "ProspectStatus" NOT NULL DEFAULT 'PROSPECT',
    "lastContactAt" TIMESTAMP(3),
    "nextActionAt" TIMESTAMP(3),
    "nextActionLabel" TEXT,
    "notes" TEXT,
    "monthlyPriceCents" INTEGER,
    "pharmacyId" TEXT,
    "blockedAt" TIMESTAMP(3),
    "blockedReason" TEXT,
    "lostReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prospects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prospect_events" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "type" "ProspectEventType" NOT NULL,
    "summary" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "actorLabel" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prospect_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_tasks" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "salesRepId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "templateKey" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "accessTokenHash" TEXT NOT NULL,
    "monthlyPriceCents" INTEGER NOT NULL,
    "durationMonths" INTEGER NOT NULL,
    "pharmacySignerName" TEXT NOT NULL,
    "pharmacySignerEmail" TEXT NOT NULL,
    "companySignerName" TEXT NOT NULL,
    "companySignerEmail" TEXT NOT NULL,
    "signatureProvider" TEXT NOT NULL DEFAULT 'none',
    "providerEnvelopeId" TEXT,
    "sentAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "pharmacySignedAt" TIMESTAMP(3),
    "companySignedAt" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),
    "refusedAt" TIMESTAMP(3),
    "refusalReason" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commissions" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "salesRepId" TEXT NOT NULL,
    "type" "SalesCommissionType" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "CommissionStatus" NOT NULL DEFAULT 'FORECAST',
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extranet_notifications" (
    "id" TEXT NOT NULL,
    "audience" "ExtranetAudience" NOT NULL,
    "salesRepId" TEXT,
    "type" TEXT NOT NULL,
    "severity" "NotificationSeverity" NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "linkUrl" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "extranet_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_profile" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "legalName" TEXT NOT NULL,
    "legalForm" TEXT,
    "addressLine1" TEXT,
    "postalCode" TEXT,
    "city" TEXT,
    "siren" TEXT,
    "representativeName" TEXT NOT NULL,
    "representativeTitle" TEXT,
    "representativeEmail" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_profile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_reps_email_key" ON "sales_reps"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sales_reps_passwordResetTokenHash_key" ON "sales_reps"("passwordResetTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "sales_rep_sessions_tokenHash_key" ON "sales_rep_sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sales_rep_sessions_salesRepId_idx" ON "sales_rep_sessions"("salesRepId");

-- CreateIndex
CREATE UNIQUE INDEX "prospects_pharmacyId_key" ON "prospects"("pharmacyId");

-- CreateIndex
CREATE INDEX "prospects_salesRepId_status_idx" ON "prospects"("salesRepId", "status");

-- CreateIndex
CREATE INDEX "prospects_status_idx" ON "prospects"("status");

-- CreateIndex
CREATE INDEX "prospect_events_prospectId_createdAt_idx" ON "prospect_events"("prospectId", "createdAt");

-- CreateIndex
CREATE INDEX "sales_tasks_salesRepId_dueAt_idx" ON "sales_tasks"("salesRepId", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_accessTokenHash_key" ON "contracts"("accessTokenHash");

-- CreateIndex
CREATE INDEX "contracts_prospectId_idx" ON "contracts"("prospectId");

-- CreateIndex
CREATE INDEX "contracts_status_idx" ON "contracts"("status");

-- CreateIndex
CREATE INDEX "commissions_salesRepId_status_idx" ON "commissions"("salesRepId", "status");

-- CreateIndex
CREATE INDEX "extranet_notifications_audience_salesRepId_readAt_idx" ON "extranet_notifications"("audience", "salesRepId", "readAt");

-- AddForeignKey
ALTER TABLE "sales_rep_sessions" ADD CONSTRAINT "sales_rep_sessions_salesRepId_fkey" FOREIGN KEY ("salesRepId") REFERENCES "sales_reps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_salesRepId_fkey" FOREIGN KEY ("salesRepId") REFERENCES "sales_reps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospect_events" ADD CONSTRAINT "prospect_events_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "prospects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_tasks" ADD CONSTRAINT "sales_tasks_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "prospects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_tasks" ADD CONSTRAINT "sales_tasks_salesRepId_fkey" FOREIGN KEY ("salesRepId") REFERENCES "sales_reps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "prospects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "prospects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_salesRepId_fkey" FOREIGN KEY ("salesRepId") REFERENCES "sales_reps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extranet_notifications" ADD CONSTRAINT "extranet_notifications_salesRepId_fkey" FOREIGN KEY ("salesRepId") REFERENCES "sales_reps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

