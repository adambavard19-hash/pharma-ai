-- AlterTable
ALTER TABLE "analysis_runs" ADD COLUMN     "outcome" TEXT;

-- AlterTable
ALTER TABLE "pharmacies" ADD COLUMN     "onboardingCompletedAt" TIMESTAMP(3),
ADD COLUMN     "stockSyncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "classificationSource" TEXT,
ADD COLUMN     "classifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "product_classifications" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "confidence" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
    "providerId" TEXT,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_classifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_classifications_key_key" ON "product_classifications"("key");

