-- CreateEnum
CREATE TYPE "DrugStockSource" AS ENUM ('SCAN', 'IMPORT', 'MANUAL');

-- AlterEnum
ALTER TYPE "ImportKind" ADD VALUE 'DRUG_STOCK';

-- CreateTable
CREATE TABLE "pharmacy_drug_stocks" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "presentationId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "alertThreshold" INTEGER NOT NULL DEFAULT 0,
    "location" TEXT,
    "source" "DrugStockSource" NOT NULL DEFAULT 'MANUAL',
    "lastCountedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pharmacy_drug_stocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pharmacy_drug_stocks_pharmacyId_quantity_idx" ON "pharmacy_drug_stocks"("pharmacyId", "quantity");

-- CreateIndex
CREATE UNIQUE INDEX "pharmacy_drug_stocks_pharmacyId_presentationId_key" ON "pharmacy_drug_stocks"("pharmacyId", "presentationId");

-- AddForeignKey
ALTER TABLE "pharmacy_drug_stocks" ADD CONSTRAINT "pharmacy_drug_stocks_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pharmacy_drug_stocks" ADD CONSTRAINT "pharmacy_drug_stocks_presentationId_fkey" FOREIGN KEY ("presentationId") REFERENCES "drug_presentations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

