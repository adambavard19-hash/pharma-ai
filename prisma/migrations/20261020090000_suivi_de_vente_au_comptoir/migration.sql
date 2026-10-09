-- AlterTable
ALTER TABLE "recommendations" ADD COLUMN     "outcomePost" TEXT,
ADD COLUMN     "outcomeSource" TEXT;

-- CreateTable
CREATE TABLE "counter_sale_follow_ups" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "emailEncrypted" TEXT,
    "consentAt" TIMESTAMP(3),
    "consentPost" TEXT,
    "closedAt" TIMESTAMP(3),
    "closedPost" TEXT,
    "proposedCount" INTEGER NOT NULL DEFAULT 0,
    "soldCount" INTEGER NOT NULL DEFAULT 0,
    "notSoldCount" INTEGER NOT NULL DEFAULT 0,
    "unansweredCount" INTEGER NOT NULL DEFAULT 0,
    "reportStatus" TEXT,
    "reportSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "counter_sale_follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "counter_sale_follow_ups_prescriptionId_key" ON "counter_sale_follow_ups"("prescriptionId");

-- CreateIndex
CREATE INDEX "counter_sale_follow_ups_pharmacyId_closedAt_idx" ON "counter_sale_follow_ups"("pharmacyId", "closedAt");

-- AddForeignKey
ALTER TABLE "counter_sale_follow_ups" ADD CONSTRAINT "counter_sale_follow_ups_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counter_sale_follow_ups" ADD CONSTRAINT "counter_sale_follow_ups_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "prescriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

