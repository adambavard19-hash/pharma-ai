-- Espace du directeur commercial (octobre 2026) — migration ADDITIVE.
--
-- Quatre tables (directeur commercial et ses sessions, challenges commerciaux, factures des
-- commerciaux), deux types et une colonne nullable sur les commissions (la facture qui les
-- réclame). Ne supprime, ne renomme et ne modifie aucune colonne ni aucune table existante.

-- CreateEnum
CREATE TYPE "SalesChallengeMetric" AS ENUM ('PROSPECTS_CREATED', 'DEMOS_DONE', 'CONTRACTS_SIGNED', 'ACTIVATIONS');

-- CreateEnum
CREATE TYPE "SalesInvoiceStatus" AS ENUM ('RECEIVED', 'APPROVED', 'PAID', 'REJECTED');

-- AlterTable
ALTER TABLE "commissions" ADD COLUMN     "invoiceId" TEXT;

-- CreateTable
CREATE TABLE "sales_directors" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "invitedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "passwordResetTokenHash" TEXT,
    "passwordResetExpiresAt" TIMESTAMP(3),
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_directors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_director_sessions" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "salesDirectorId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "ipAddress" TEXT,

    CONSTRAINT "sales_director_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_challenges" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "metric" "SalesChallengeMetric" NOT NULL,
    "target" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "rewardLabel" TEXT,
    "rewardCents" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByType" TEXT NOT NULL,
    "createdById" TEXT,
    "createdByLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_invoices" (
    "id" TEXT NOT NULL,
    "salesRepId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "periodLabel" TEXT,
    "status" "SalesInvoiceStatus" NOT NULL DEFAULT 'RECEIVED',
    "fileKey" TEXT,
    "fileName" TEXT,
    "note" TEXT,
    "rejectionReason" TEXT,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdByType" TEXT NOT NULL,
    "createdById" TEXT,
    "createdByLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_directors_email_key" ON "sales_directors"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sales_directors_passwordResetTokenHash_key" ON "sales_directors"("passwordResetTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "sales_director_sessions_tokenHash_key" ON "sales_director_sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sales_director_sessions_salesDirectorId_idx" ON "sales_director_sessions"("salesDirectorId");

-- CreateIndex
CREATE INDEX "sales_challenges_startsAt_endsAt_idx" ON "sales_challenges"("startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "sales_invoices_status_issuedAt_idx" ON "sales_invoices"("status", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoices_salesRepId_number_key" ON "sales_invoices"("salesRepId", "number");

-- CreateIndex
CREATE INDEX "commissions_invoiceId_idx" ON "commissions"("invoiceId");

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "sales_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_director_sessions" ADD CONSTRAINT "sales_director_sessions_salesDirectorId_fkey" FOREIGN KEY ("salesDirectorId") REFERENCES "sales_directors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_salesRepId_fkey" FOREIGN KEY ("salesRepId") REFERENCES "sales_reps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
