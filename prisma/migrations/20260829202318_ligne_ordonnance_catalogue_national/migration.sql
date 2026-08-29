-- CreateEnum
CREATE TYPE "DrugIdentificationSource" AS ENUM ('AUTO', 'PHARMACIST', 'SCAN');

-- AlterTable
ALTER TABLE "prescription_lines" ADD COLUMN     "drugSpecialtyId" TEXT,
ADD COLUMN     "identificationScore" DOUBLE PRECISION,
ADD COLUMN     "identifiedBy" "DrugIdentificationSource";

-- AddForeignKey
ALTER TABLE "prescription_lines" ADD CONSTRAINT "prescription_lines_drugSpecialtyId_fkey" FOREIGN KEY ("drugSpecialtyId") REFERENCES "drug_specialties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

