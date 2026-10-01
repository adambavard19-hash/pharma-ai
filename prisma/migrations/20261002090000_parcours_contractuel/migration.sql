-- Parcours contractuel unique : origine du dossier, demande de souscription,
-- verrou d'envoi, relances, archivage du PDF signé, réglages. Ajouts seulement.

-- CreateEnum
CREATE TYPE "ProspectOrigin" AS ENUM ('SELF_SERVICE_SITE', 'SUPER_ADMIN', 'COMMERCIAL');

-- AlterEnum
ALTER TYPE "ProspectEventType" ADD VALUE 'SUBSCRIPTION_REQUESTED';
ALTER TYPE "ProspectEventType" ADD VALUE 'CONTRACT_REMINDER';
ALTER TYPE "ProspectEventType" ADD VALUE 'SIGNED_PDF_ARCHIVED';
ALTER TYPE "ProspectEventType" ADD VALUE 'SUBSCRIPTION_PENDING';
ALTER TYPE "ProspectEventType" ADD VALUE 'DUPLICATE_SUSPECTED';
ALTER TYPE "ProspectEventType" ADD VALUE 'SIGNATURE_ERROR';

-- AlterTable
ALTER TABLE "prospects" ADD COLUMN     "legalName" TEXT,
ADD COLUMN     "ownerTitle" TEXT,
ADD COLUMN     "origin" "ProspectOrigin" NOT NULL DEFAULT 'COMMERCIAL',
ADD COLUMN     "subscriptionRequestedAt" TIMESTAMP(3),
ADD COLUMN     "planId" TEXT,
ADD COLUMN     "duplicateWarning" TEXT;

-- AlterTable
ALTER TABLE "contracts" ADD COLUMN     "pharmacySigningUrl" TEXT,
ADD COLUMN     "sendLockedAt" TIMESTAMP(3),
ADD COLUMN     "startDate" TIMESTAMP(3),
ADD COLUMN     "signedArchivedAt" TIMESTAMP(3),
ADD COLUMN     "reminderCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastReminderAt" TIMESTAMP(3),
ADD COLUMN     "escalatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "platform_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "prospects_siret_idx" ON "prospects"("siret");

-- AddForeignKey
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
