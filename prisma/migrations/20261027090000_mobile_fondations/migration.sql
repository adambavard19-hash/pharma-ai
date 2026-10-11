-- PharmaBoost Mobile — étape 1 (fondations). Migration ADDITIVE : aucune colonne ni table existante n'est retirée.
--
--  * Organization.kind (CLIENT par défaut) et l'organisation « Communauté PharmaBoost » qui porte les comptes gratuits ;
--  * User : métier, RPPS déclaré (non vérifié), nom d'officine déclaré, fin du parcours « Bienvenue » ;
--  * l'Académie : TrainingContent enrichi (micro-vidéo, relecture, sponsor), parcours, quiz, passeport ;
--  * TrainingProgress.pharmacyId devient facultatif (progression d'un compte gratuit) + index unique partiel ;
--  * Découvertes : favoris, demandes d'information (consentement explicite), nouveautés, campagnes sponsorisées et
--    leurs compteurs agrégés par jour ;
--  * objectifs personnels, primes validées par le titulaire, motif de refus d'un conseil, suggestions du coach,
--    signalements à la validation clinique.

-- CreateEnum
CREATE TYPE "OrganizationKind" AS ENUM ('CLIENT', 'COMMUNITY');

-- CreateEnum
CREATE TYPE "UserProfession" AS ENUM ('OWNER_PHARMACIST', 'ASSISTANT_PHARMACIST', 'TECHNICIAN', 'PHARMACY_STUDENT', 'OTHER');

-- CreateEnum
CREATE TYPE "VideoOrientation" AS ENUM ('VERTICAL', 'HORIZONTAL');

-- CreateEnum
CREATE TYPE "EditorialReviewStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TrainingAudience" AS ENUM ('ALL', 'NEW_STAFF', 'STUDENT', 'TECHNICIAN', 'PHARMACIST', 'OWNER');

-- CreateEnum
CREATE TYPE "SkillBadgeKind" AS ENUM ('CONTENT_COMPLETED', 'MODULE_COMPLETED', 'QUIZ_PASSED', 'STREAK');

-- CreateEnum
CREATE TYPE "UserConsentKind" AS ENUM ('PHARMABOOST_NEWS', 'PARTNER_COMMUNICATIONS', 'PARTNER_INFO_REQUEST');

-- CreateEnum
CREATE TYPE "FavoriteTargetType" AS ENUM ('BRAND', 'TRAINING', 'MODULE', 'PRODUCT', 'LAUNCH');

-- CreateEnum
CREATE TYPE "PartnerInfoRequestStatus" AS ENUM ('NEW', 'TRANSMITTED', 'HANDLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RegulatoryCategory" AS ENUM ('MEDICINE', 'MEDICAL_DEVICE', 'PARAPHARMACY', 'COSMETIC', 'FOOD_SUPPLEMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "SponsoredFormat" AS ENUM ('FICHE_PARTENAIRE', 'MISE_EN_AVANT', 'LANCEMENT', 'PROGRAMME_FORMATION');

-- CreateEnum
CREATE TYPE "SponsoredPlacement" AS ENUM ('HOME_HERO', 'HOME_FEED', 'DISCOVER_TOP', 'DISCOVER_CATEGORY', 'TRAINING_FEED', 'TRAINING_MODULE');

-- CreateEnum
CREATE TYPE "SponsoredCampaignStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'ACTIVE', 'PAUSED', 'ENDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ObjectiveMetric" AS ENUM ('ADVICE_PRESENTED', 'ADVICE_SOLD', 'UNITS_SOLD', 'TRAININGS_COMPLETED', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ObjectivePeriod" AS ENUM ('WEEK', 'MONTH', 'QUARTER', 'CUSTOM');

-- CreateEnum
CREATE TYPE "BonusStatus" AS ENUM ('PROPOSED', 'VALIDATED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CounterRefusalReason" AS ENUM ('PATIENT_REFUSED', 'OUT_OF_STOCK', 'CLINICALLY_INAPPROPRIATE', 'PRICE', 'ALREADY_OWNED', 'OTHER');

-- CreateEnum
CREATE TYPE "TrainingRecommendationReason" AS ENUM ('ONBOARDING', 'REFUSAL_PATTERN', 'LOW_CONVERSION', 'NEW_LAUNCH', 'CHALLENGE', 'MANUAL');

-- CreateEnum
CREATE TYPE "ClinicalReviewFlagStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'CONFIRMED_OK', 'RULE_CHANGED', 'DISMISSED');

-- AlterEnum
ALTER TYPE "TrainingKind" ADD VALUE 'MICRO_VIDEO';

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "kind" "OrganizationKind" NOT NULL DEFAULT 'CLIENT';

-- AlterTable
ALTER TABLE "recommendations" ADD COLUMN     "declineReason" "CounterRefusalReason";

-- AlterTable
ALTER TABLE "training_contents" ADD COLUMN     "authorName" TEXT,
ADD COLUMN     "authorRole" TEXT,
ADD COLUMN     "durationSeconds" INTEGER,
ADD COLUMN     "isFreeAccess" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isSponsored" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "orientation" "VideoOrientation",
ADD COLUMN     "partnerId" TEXT,
ADD COLUMN     "posterUrl" TEXT,
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "reviewStatus" "EditorialReviewStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedBy" TEXT,
ADD COLUMN     "validUntil" TIMESTAMP(3),
ADD COLUMN     "videoAssetKey" TEXT;

-- AlterTable
ALTER TABLE "training_progress" ALTER COLUMN "pharmacyId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "declaredPharmacyName" TEXT,
ADD COLUMN     "mobileOnboardedAt" TIMESTAMP(3),
ADD COLUMN     "profession" "UserProfession",
ADD COLUMN     "rppsDeclared" TEXT;

-- CreateTable
CREATE TABLE "training_modules" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "coverUrl" TEXT,
    "audience" "TrainingAudience" NOT NULL DEFAULT 'ALL',
    "isFreeAccess" BOOLEAN NOT NULL DEFAULT false,
    "partnerId" TEXT,
    "isSponsored" BOOLEAN NOT NULL DEFAULT false,
    "reviewStatus" "EditorialReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_module_items" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "training_module_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_questions" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "choices" JSONB NOT NULL,
    "correctIndexes" INTEGER[],
    "explanation" TEXT,
    "sourceLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quiz_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_attempts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "pharmacyId" TEXT,
    "score" INTEGER NOT NULL,
    "correctCount" INTEGER NOT NULL,
    "totalCount" INTEGER NOT NULL,
    "answers" JSONB NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quiz_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_badges" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "SkillBadgeKind" NOT NULL,
    "contentId" TEXT,
    "moduleId" TEXT,
    "title" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "metadata" JSONB,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skill_badges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_consents" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "UserConsentKind" NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "grantedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "textVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_favorites" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetType" "FavoriteTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_favorites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_info_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "launchId" TEXT,
    "pharmacyId" TEXT,
    "message" TEXT,
    "consentText" TEXT NOT NULL,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "status" "PartnerInfoRequestStatus" NOT NULL DEFAULT 'NEW',
    "transmittedAt" TIMESTAMP(3),
    "handledAt" TIMESTAMP(3),
    "handledByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_info_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_launches" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "body" TEXT NOT NULL,
    "mediaAssetKey" TEXT,
    "mediaUrl" TEXT,
    "posterUrl" TEXT,
    "orientation" "VideoOrientation",
    "productCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "universe" TEXT,
    "regulatoryCategory" "RegulatoryCategory" NOT NULL,
    "regulatoryMentions" TEXT,
    "regulatoryValidatedBy" TEXT,
    "regulatoryValidatedAt" TIMESTAMP(3),
    "reviewStatus" "EditorialReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_launches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sponsored_campaigns" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "brandId" TEXT,
    "launchId" TEXT,
    "moduleId" TEXT,
    "name" TEXT NOT NULL,
    "format" "SponsoredFormat" NOT NULL,
    "placements" "SponsoredPlacement"[],
    "audiences" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "SponsoredCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "regulatoryCategory" "RegulatoryCategory",
    "regulatoryReviewedBy" TEXT,
    "regulatoryReviewedAt" TIMESTAMP(3),
    "regulatoryNotes" TEXT,
    "priceNote" TEXT,
    "budgetCents" INTEGER,
    "billedCents" INTEGER,
    "billingReference" TEXT,
    "contractReference" TEXT,
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sponsored_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sponsored_campaign_daily_stats" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "placement" "SponsoredPlacement" NOT NULL,
    "day" DATE NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "trainingsStarted" INTEGER NOT NULL DEFAULT 0,
    "trainingsCompleted" INTEGER NOT NULL DEFAULT 0,
    "infoRequests" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sponsored_campaign_daily_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personal_objectives" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "metric" "ObjectiveMetric" NOT NULL,
    "target" INTEGER NOT NULL,
    "period" "ObjectivePeriod" NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "challengeId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personal_objectives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bonus_authorizations" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "challengeId" TEXT,
    "objectiveId" TEXT,
    "label" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "BonusStatus" NOT NULL DEFAULT 'PROPOSED',
    "proposedByUserId" TEXT,
    "validatedByUserId" TEXT,
    "validatedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bonus_authorizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_recommendations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pharmacyId" TEXT,
    "contentId" TEXT,
    "moduleId" TEXT,
    "reason" "TrainingRecommendationReason" NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seenAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "training_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_review_flags" (
    "id" TEXT NOT NULL,
    "ruleKey" TEXT NOT NULL,
    "pharmacyId" TEXT,
    "count" INTEGER NOT NULL DEFAULT 1,
    "reasonCode" "CounterRefusalReason",
    "reason" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "status" "ClinicalReviewFlagStatus" NOT NULL DEFAULT 'OPEN',
    "reviewedByAdminId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinical_review_flags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "training_modules_slug_key" ON "training_modules"("slug");

-- CreateIndex
CREATE INDEX "training_modules_reviewStatus_isActive_sortOrder_idx" ON "training_modules"("reviewStatus", "isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "training_module_items_moduleId_position_idx" ON "training_module_items"("moduleId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "training_module_items_moduleId_contentId_key" ON "training_module_items"("moduleId", "contentId");

-- CreateIndex
CREATE INDEX "quiz_questions_contentId_position_idx" ON "quiz_questions"("contentId", "position");

-- CreateIndex
CREATE INDEX "quiz_attempts_userId_contentId_createdAt_idx" ON "quiz_attempts"("userId", "contentId", "createdAt");

-- CreateIndex
CREATE INDEX "quiz_attempts_contentId_createdAt_idx" ON "quiz_attempts"("contentId", "createdAt");

-- CreateIndex
CREATE INDEX "skill_badges_userId_earnedAt_idx" ON "skill_badges"("userId", "earnedAt");

-- CreateIndex
CREATE UNIQUE INDEX "skill_badges_userId_dedupeKey_key" ON "skill_badges"("userId", "dedupeKey");

-- CreateIndex
CREATE INDEX "user_consents_userId_kind_createdAt_idx" ON "user_consents"("userId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "user_favorites_targetType_targetId_idx" ON "user_favorites"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "user_favorites_userId_targetType_targetId_key" ON "user_favorites"("userId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "partner_info_requests_partnerId_status_createdAt_idx" ON "partner_info_requests"("partnerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "partner_info_requests_userId_createdAt_idx" ON "partner_info_requests"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "partner_launches_reviewStatus_publishedAt_idx" ON "partner_launches"("reviewStatus", "publishedAt");

-- CreateIndex
CREATE INDEX "partner_launches_brandId_idx" ON "partner_launches"("brandId");

-- CreateIndex
CREATE INDEX "sponsored_campaigns_status_startsAt_endsAt_idx" ON "sponsored_campaigns"("status", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "sponsored_campaigns_partnerId_idx" ON "sponsored_campaigns"("partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "sponsored_campaign_daily_stats_campaignId_placement_day_key" ON "sponsored_campaign_daily_stats"("campaignId", "placement", "day");

-- CreateIndex
CREATE INDEX "personal_objectives_pharmacyId_userId_idx" ON "personal_objectives"("pharmacyId", "userId");

-- CreateIndex
CREATE INDEX "bonus_authorizations_pharmacyId_userId_status_idx" ON "bonus_authorizations"("pharmacyId", "userId", "status");

-- CreateIndex
CREATE INDEX "training_recommendations_userId_dismissedAt_createdAt_idx" ON "training_recommendations"("userId", "dismissedAt", "createdAt");

-- CreateIndex
CREATE INDEX "clinical_review_flags_ruleKey_status_idx" ON "clinical_review_flags"("ruleKey", "status");

-- CreateIndex
CREATE INDEX "clinical_review_flags_status_createdAt_idx" ON "clinical_review_flags"("status", "createdAt");

-- CreateIndex
CREATE INDEX "organizations_kind_idx" ON "organizations"("kind");

-- CreateIndex
CREATE INDEX "training_contents_reviewStatus_isActive_idx" ON "training_contents"("reviewStatus", "isActive");

-- CreateIndex
CREATE INDEX "training_contents_partnerId_idx" ON "training_contents"("partnerId");

-- CreateIndex
CREATE INDEX "training_progress_userId_idx" ON "training_progress"("userId");

-- AddForeignKey
ALTER TABLE "training_contents" ADD CONSTRAINT "training_contents_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_modules" ADD CONSTRAINT "training_modules_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_module_items" ADD CONSTRAINT "training_module_items_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "training_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_module_items" ADD CONSTRAINT "training_module_items_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "training_contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "training_contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "training_contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_badges" ADD CONSTRAINT "skill_badges_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_favorites" ADD CONSTRAINT "user_favorites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_info_requests" ADD CONSTRAINT "partner_info_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_info_requests" ADD CONSTRAINT "partner_info_requests_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_info_requests" ADD CONSTRAINT "partner_info_requests_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "partner_brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_info_requests" ADD CONSTRAINT "partner_info_requests_launchId_fkey" FOREIGN KEY ("launchId") REFERENCES "partner_launches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_info_requests" ADD CONSTRAINT "partner_info_requests_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_launches" ADD CONSTRAINT "partner_launches_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_launches" ADD CONSTRAINT "partner_launches_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "partner_brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsored_campaigns" ADD CONSTRAINT "sponsored_campaigns_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsored_campaigns" ADD CONSTRAINT "sponsored_campaigns_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "partner_brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsored_campaigns" ADD CONSTRAINT "sponsored_campaigns_launchId_fkey" FOREIGN KEY ("launchId") REFERENCES "partner_launches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsored_campaigns" ADD CONSTRAINT "sponsored_campaigns_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "training_modules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsored_campaign_daily_stats" ADD CONSTRAINT "sponsored_campaign_daily_stats_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "sponsored_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_objectives" ADD CONSTRAINT "personal_objectives_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_objectives" ADD CONSTRAINT "personal_objectives_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_objectives" ADD CONSTRAINT "personal_objectives_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "lab_challenges"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bonus_authorizations" ADD CONSTRAINT "bonus_authorizations_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bonus_authorizations" ADD CONSTRAINT "bonus_authorizations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bonus_authorizations" ADD CONSTRAINT "bonus_authorizations_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "lab_challenges"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bonus_authorizations" ADD CONSTRAINT "bonus_authorizations_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "personal_objectives"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_recommendations" ADD CONSTRAINT "training_recommendations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_recommendations" ADD CONSTRAINT "training_recommendations_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_recommendations" ADD CONSTRAINT "training_recommendations_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "training_contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_recommendations" ADD CONSTRAINT "training_recommendations_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "training_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_review_flags" ADD CONSTRAINT "clinical_review_flags_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Les contenus de formation d'avant PharmaBoost Mobile étaient déjà en ligne (publiés par la console ou par une
-- officine) : ils passent « APPROVED », datés de leur création. Les nouveaux contenus naissent DRAFT.
UPDATE "training_contents" SET "reviewStatus" = 'APPROVED', "publishedAt" = COALESCE("publishedAt", "createdAt") WHERE "reviewStatus" = 'DRAFT';

-- Progression hors officine (compte gratuit) : une seule ligne par contenu et par personne. L'unicité
-- (contentId, userId, pharmacyId) ne la garantit pas, PostgreSQL tenant deux NULL pour distincts.
CREATE UNIQUE INDEX "training_progress_content_user_personal_key" ON "training_progress"("contentId", "userId") WHERE "pharmacyId" IS NULL;

-- La « Communauté PharmaBoost » : l'organisation unique des comptes gratuits. Idempotent (le code la recrée au
-- besoin, cf. src/server/services/mobile/community.ts).
INSERT INTO "organizations" ("id", "name", "slug", "kind", "createdAt", "updatedAt")
VALUES ('org_communaute_pharmaboost', 'Communauté PharmaBoost', 'communaute-pharmaboost', 'COMMUNITY', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO UPDATE SET "kind" = 'COMMUNITY';
