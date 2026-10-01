-- AlterTable
ALTER TABLE "counter_posts" ADD COLUMN     "exportPath" TEXT,
ADD COLUMN     "lastExportAt" TIMESTAMP(3),
ADD COLUMN     "lastExportError" TEXT,
ADD COLUMN     "syncRequestedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "counter_requests" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "ageYears" INTEGER,
    "isPregnant" BOOLEAN,
    "isBreastfeeding" BOOLEAN,
    "treatments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "needs" JSONB NOT NULL DEFAULT '[]',
    "questions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "referToDoctor" BOOLEAN NOT NULL DEFAULT false,
    "referReason" TEXT,
    "summary" TEXT,
    "proposals" JSONB NOT NULL DEFAULT '[]',
    "proposalCount" INTEGER NOT NULL DEFAULT 0,
    "providerId" TEXT NOT NULL,
    "model" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "counter_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "counter_requests_pharmacyId_createdAt_idx" ON "counter_requests"("pharmacyId", "createdAt");

-- AddForeignKey
ALTER TABLE "counter_requests" ADD CONSTRAINT "counter_requests_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

