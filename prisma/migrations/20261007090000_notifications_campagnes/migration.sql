-- Notifications et campagnes (octobre 2026) — migration ADDITIVE.
--
-- Ajoute uniquement : deux colonnes sur "pharmacies", les abonnements des
-- patients aux nouveautés de leur officine (adresse chiffrée, aucune donnée de
-- santé), les annonces et leurs envois, les campagnes de la console, la liste
-- de désinscription des offres et les offres de parrainage.
-- Ne supprime, ne renomme et ne modifie aucune colonne ni aucune table existante.

-- CreateEnum
CREATE TYPE "PatientNewsStatus" AS ENUM ('ACTIVE', 'UNSUBSCRIBED');

-- CreateEnum
CREATE TYPE "CampaignKind" AS ENUM ('BONUS_OFFER', 'REFERRAL_OFFER', 'PARTNER_INVITATION', 'ANNOUNCEMENT');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELED');

-- AlterTable
ALTER TABLE "pharmacies" ADD COLUMN     "patientNewsEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "referralAmountCents" INTEGER;

-- CreateTable
CREATE TABLE "patient_news_subscriptions" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "emailHash" TEXT NOT NULL,
    "emailCipher" TEXT,
    "emailMasked" TEXT,
    "status" "PatientNewsStatus" NOT NULL DEFAULT 'ACTIVE',
    "consentSource" TEXT NOT NULL DEFAULT 'PLAN_EMAIL',
    "consentAt" TIMESTAMP(3) NOT NULL,
    "noticeVersion" TEXT NOT NULL DEFAULT 'v1',
    "unsubscribedAt" TIMESTAMP(3),
    "lastNewsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_news_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_news_announcements" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "rangeLabel" TEXT,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SENDING',
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "simulated" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "patient_news_announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_news_deliveries" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CLAIMED',
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_news_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "kind" "CampaignKind" NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "subject" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "buttonLabel" TEXT,
    "buttonTarget" TEXT,
    "audience" TEXT NOT NULL,
    "audienceParams" JSONB NOT NULL DEFAULT '{}',
    "alsoInApp" BOOLEAN NOT NULL DEFAULT false,
    "offerAmountCents" INTEGER,
    "offerEndsAt" TIMESTAMP(3),
    "offerConditions" TEXT,
    "scheduledFor" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "simulated" BOOLEAN NOT NULL DEFAULT false,
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_recipients" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "pharmacyId" TEXT,
    "partnerId" TEXT,
    "emailKey" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "detail" TEXT,
    "emailDispatchId" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_opt_outs" (
    "id" TEXT NOT NULL,
    "emailHash" TEXT NOT NULL,
    "emailMasked" TEXT,
    "source" TEXT NOT NULL DEFAULT 'LINK',
    "campaignId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketing_opt_outs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_offers" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "campaignId" TEXT,
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "patient_news_subscriptions_pharmacyId_status_idx" ON "patient_news_subscriptions"("pharmacyId", "status");

-- CreateIndex
CREATE INDEX "patient_news_subscriptions_consentAt_idx" ON "patient_news_subscriptions"("consentAt");

-- CreateIndex
CREATE UNIQUE INDEX "patient_news_subscriptions_pharmacyId_emailHash_key" ON "patient_news_subscriptions"("pharmacyId", "emailHash");

-- CreateIndex
CREATE INDEX "patient_news_announcements_pharmacyId_createdAt_idx" ON "patient_news_announcements"("pharmacyId", "createdAt");

-- CreateIndex
CREATE INDEX "patient_news_deliveries_subscriptionId_idx" ON "patient_news_deliveries"("subscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "patient_news_deliveries_announcementId_subscriptionId_key" ON "patient_news_deliveries"("announcementId", "subscriptionId");

-- CreateIndex
CREATE INDEX "campaigns_status_scheduledFor_idx" ON "campaigns"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "campaigns_createdAt_idx" ON "campaigns"("createdAt");

-- CreateIndex
CREATE INDEX "campaign_recipients_campaignId_status_idx" ON "campaign_recipients"("campaignId", "status");

-- CreateIndex
CREATE INDEX "campaign_recipients_pharmacyId_idx" ON "campaign_recipients"("pharmacyId");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_recipients_campaignId_emailKey_key" ON "campaign_recipients"("campaignId", "emailKey");

-- CreateIndex
CREATE UNIQUE INDEX "marketing_opt_outs_emailHash_key" ON "marketing_opt_outs"("emailHash");

-- CreateIndex
CREATE UNIQUE INDEX "referral_offers_campaignId_key" ON "referral_offers"("campaignId");

-- CreateIndex
CREATE INDEX "referral_offers_startsAt_endsAt_idx" ON "referral_offers"("startsAt", "endsAt");

-- AddForeignKey
ALTER TABLE "patient_news_subscriptions" ADD CONSTRAINT "patient_news_subscriptions_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_news_announcements" ADD CONSTRAINT "patient_news_announcements_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_news_deliveries" ADD CONSTRAINT "patient_news_deliveries_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "patient_news_announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_news_deliveries" ADD CONSTRAINT "patient_news_deliveries_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "patient_news_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_offers" ADD CONSTRAINT "referral_offers_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
