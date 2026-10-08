-- AlterTable
ALTER TABLE "product_associations" ADD COLUMN     "triggerSpecialtyId" TEXT,
ALTER COLUMN "triggerProductId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "product_associations_pharmacyId_triggerSpecialtyId_idx" ON "product_associations"("pharmacyId", "triggerSpecialtyId");

-- CreateIndex
CREATE UNIQUE INDEX "product_associations_pharmacyId_triggerSpecialtyId_advicePr_key" ON "product_associations"("pharmacyId", "triggerSpecialtyId", "adviceProductId");

-- AddForeignKey
ALTER TABLE "product_associations" ADD CONSTRAINT "product_associations_triggerSpecialtyId_fkey" FOREIGN KEY ("triggerSpecialtyId") REFERENCES "drug_specialties"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Un déclencheur, un seul : un produit du stock OU un médicament du catalogue national (Prisma ne sait pas écrire cette contrainte).
ALTER TABLE "product_associations" ADD CONSTRAINT "product_associations_one_trigger" CHECK ((("triggerProductId" IS NOT NULL)::int + ("triggerSpecialtyId" IS NOT NULL)::int) = 1);
