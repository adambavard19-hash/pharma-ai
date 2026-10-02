-- CreateEnum
CREATE TYPE "LabChallengeStatus" AS ENUM ('ACTIVE', 'ENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "LabChallengeCountMode" AS ENUM ('ALL_SALES', 'ATTRIBUTED');

-- CreateEnum
CREATE TYPE "StockLotSource" AS ENUM ('MANUAL', 'IMPORT', 'SCAN');

-- CreateEnum
CREATE TYPE "VigilanceLevel" AS ENUM ('INFO', 'CAUTION', 'CONTRAINDICATION', 'PHARMACIST_VALIDATION');

-- CreateEnum
CREATE TYPE "TrainingKind" AS ENUM ('VIDEO', 'SHEET', 'DOCUMENT', 'EXTERNAL_LINK', 'QUIZ');

-- CreateEnum
CREATE TYPE "TrainingStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE');

-- AlterTable
ALTER TABLE "pharmacies" ADD COLUMN     "shortDateSoonDays" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN     "shortDateUrgentDays" INTEGER NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE "recommendations" ADD COLUMN     "vigilances" JSONB;

-- CreateTable
CREATE TABLE "preferred_ranges" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "universe" TEXT NOT NULL,
    "laboratory" TEXT NOT NULL,
    "brandKey" TEXT NOT NULL,
    "rangeName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "discountPercent" DECIMAL(5,2),
    "notes" TEXT,
    "productIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "preferred_ranges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_challenges" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "laboratory" TEXT NOT NULL,
    "brandKey" TEXT,
    "universe" TEXT,
    "productIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startsAt" DATE NOT NULL,
    "endsAt" DATE NOT NULL,
    "targetUnits" INTEGER,
    "bonusPerUnitCents" INTEGER,
    "tiers" JSONB,
    "status" "LabChallengeStatus" NOT NULL DEFAULT 'ACTIVE',
    "countMode" "LabChallengeCountMode" NOT NULL DEFAULT 'ALL_SALES',
    "dataSource" TEXT NOT NULL DEFAULT 'PHARMABOOST',
    "externalRef" TEXT,
    "notes" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lab_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_challenge_entries" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "units" INTEGER NOT NULL,
    "occurredOn" DATE NOT NULL,
    "note" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_challenge_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_lots" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "productId" TEXT,
    "presentationId" TEXT,
    "label" TEXT NOT NULL,
    "lotNumber" TEXT,
    "expiresOn" DATE NOT NULL,
    "expiryPrecision" TEXT NOT NULL DEFAULT 'DAY',
    "quantity" INTEGER,
    "source" "StockLotSource" NOT NULL DEFAULT 'MANUAL',
    "importJobId" TEXT,
    "note" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_vigilances" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "population" TEXT NOT NULL,
    "level" "VigilanceLevel" NOT NULL,
    "note" TEXT,
    "source" TEXT NOT NULL DEFAULT 'PHARMACIST',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_vigilances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_contents" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "kind" "TrainingKind" NOT NULL,
    "url" TEXT,
    "body" TEXT,
    "laboratory" TEXT,
    "brandKey" TEXT,
    "rangeName" TEXT,
    "universe" TEXT,
    "productCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "productIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "durationMinutes" INTEGER,
    "sourceLabel" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByAdminId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_contents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_progress" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "status" "TrainingStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "preferred_ranges_pharmacyId_universe_idx" ON "preferred_ranges"("pharmacyId", "universe");

-- CreateIndex
CREATE INDEX "preferred_ranges_pharmacyId_brandKey_idx" ON "preferred_ranges"("pharmacyId", "brandKey");

-- CreateIndex
CREATE INDEX "lab_challenges_pharmacyId_status_idx" ON "lab_challenges"("pharmacyId", "status");

-- CreateIndex
CREATE INDEX "lab_challenge_entries_challengeId_idx" ON "lab_challenge_entries"("challengeId");

-- CreateIndex
CREATE INDEX "lab_challenge_entries_pharmacyId_idx" ON "lab_challenge_entries"("pharmacyId");

-- CreateIndex
CREATE INDEX "stock_lots_pharmacyId_expiresOn_idx" ON "stock_lots"("pharmacyId", "expiresOn");

-- CreateIndex
CREATE INDEX "stock_lots_productId_idx" ON "stock_lots"("productId");

-- CreateIndex
CREATE INDEX "stock_lots_presentationId_idx" ON "stock_lots"("presentationId");

-- CreateIndex
CREATE INDEX "product_vigilances_pharmacyId_idx" ON "product_vigilances"("pharmacyId");

-- CreateIndex
CREATE UNIQUE INDEX "product_vigilances_productId_population_key" ON "product_vigilances"("productId", "population");

-- CreateIndex
CREATE INDEX "training_contents_pharmacyId_isActive_idx" ON "training_contents"("pharmacyId", "isActive");

-- CreateIndex
CREATE INDEX "training_contents_brandKey_idx" ON "training_contents"("brandKey");

-- CreateIndex
CREATE INDEX "training_progress_pharmacyId_userId_idx" ON "training_progress"("pharmacyId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "training_progress_contentId_userId_pharmacyId_key" ON "training_progress"("contentId", "userId", "pharmacyId");

-- CreateIndex
CREATE INDEX "sale_lines_productId_idx" ON "sale_lines"("productId");

-- CreateIndex
CREATE INDEX "sale_lines_presentationId_idx" ON "sale_lines"("presentationId");

-- AddForeignKey
ALTER TABLE "preferred_ranges" ADD CONSTRAINT "preferred_ranges_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_challenges" ADD CONSTRAINT "lab_challenges_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_challenge_entries" ADD CONSTRAINT "lab_challenge_entries_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "lab_challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_vigilances" ADD CONSTRAINT "product_vigilances_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_vigilances" ADD CONSTRAINT "product_vigilances_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_contents" ADD CONSTRAINT "training_contents_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_progress" ADD CONSTRAINT "training_progress_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "training_contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

