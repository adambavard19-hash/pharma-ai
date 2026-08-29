-- CreateEnum
CREATE TYPE "ReminderReason" AS ENUM ('COURSE_END', 'RENEWAL', 'TOLERANCE_CHECK', 'SEASONAL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('SCHEDULED', 'SENT', 'SNOOZED', 'CANCELLED', 'DONE');

-- AlterEnum
ALTER TYPE "ConsentType" ADD VALUE 'FOLLOW_UP_MESSAGE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InteractionType" ADD VALUE 'FOLLOW_UP_SCHEDULED';
ALTER TYPE "InteractionType" ADD VALUE 'FOLLOW_UP_SENT';
ALTER TYPE "InteractionType" ADD VALUE 'FOLLOW_UP_OPTED_OUT';

-- AlterTable
ALTER TABLE "patients" ADD COLUMN     "followUpOptOutAt" TIMESTAMP(3),
ADD COLUMN     "followUpOptOutToken" TEXT;

-- AlterTable
ALTER TABLE "pharmacies" ADD COLUMN     "followUpMinIntervalDays" INTEGER NOT NULL DEFAULT 30;

-- CreateTable
CREATE TABLE "reminders" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "saleId" TEXT,
    "prescriptionId" TEXT,
    "recommendationId" TEXT,
    "reason" "ReminderReason" NOT NULL,
    "templateKey" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'SCHEDULED',
    "channel" "DeliveryChannel" NOT NULL DEFAULT 'EMAIL',
    "deliveryStatus" "DeliveryStatus" NOT NULL DEFAULT 'SIMULATED',
    "targetMasked" TEXT,
    "provider" TEXT,
    "detail" TEXT,
    "sentAt" TIMESTAMP(3),
    "sentByUserId" TEXT,
    "createdByUserId" TEXT,
    "note" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reminders_pharmacyId_status_dueAt_idx" ON "reminders"("pharmacyId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "reminders_patientId_dueAt_idx" ON "reminders"("patientId", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "patients_followUpOptOutToken_key" ON "patients"("followUpOptOutToken");

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

