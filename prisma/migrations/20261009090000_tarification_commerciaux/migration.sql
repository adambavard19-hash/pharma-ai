-- Tarification officielle et candidatures commerciales (octobre 2026) — migration ADDITIVE.
--
-- Ajoute uniquement : la mise en service au catalogue des offres (deux colonnes
-- nullables sur "plans"), la formule choisie par le visiteur sur le site (une
-- colonne nullable sur "prospects"), et les candidatures commerciales avec leur
-- historique (deux tables). Ne supprime, ne renomme et ne modifie aucune colonne
-- ni aucune table existante. Le prix contractuel des abonnements existants
-- (subscriptions.contractPriceCents) n'est pas touché.

-- CreateEnum
CREATE TYPE "SalesApplicationStatus" AS ENUM ('NEW', 'TO_CONTACT', 'INTERVIEW', 'ACCEPTED', 'REFUSED');

-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "annualSetupFeeCents" INTEGER,
ADD COLUMN     "setupFeeCents" INTEGER;

-- AlterTable
ALTER TABLE "prospects" ADD COLUMN     "subscriptionFormula" TEXT;

-- CreateTable
CREATE TABLE "sales_applications" (
    "id" TEXT NOT NULL,
    "status" "SalesApplicationStatus" NOT NULL DEFAULT 'NEW',
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "salesExperience" TEXT NOT NULL,
    "healthExperience" TEXT,
    "currentStatus" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "cvKey" TEXT,
    "cvFileName" TEXT,
    "cvSizeBytes" INTEGER,
    "salesRepId" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_application_events" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fromStatus" "SalesApplicationStatus",
    "toStatus" "SalesApplicationStatus",
    "note" TEXT,
    "platformAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_application_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_applications_salesRepId_key" ON "sales_applications"("salesRepId");

-- CreateIndex
CREATE INDEX "sales_applications_status_createdAt_idx" ON "sales_applications"("status", "createdAt");

-- CreateIndex
CREATE INDEX "sales_applications_email_idx" ON "sales_applications"("email");

-- CreateIndex
CREATE INDEX "sales_application_events_applicationId_createdAt_idx" ON "sales_application_events"("applicationId", "createdAt");

-- AddForeignKey
ALTER TABLE "sales_applications" ADD CONSTRAINT "sales_applications_salesRepId_fkey" FOREIGN KEY ("salesRepId") REFERENCES "sales_reps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_application_events" ADD CONSTRAINT "sales_application_events_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "sales_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
