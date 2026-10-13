-- Mes associations : le produit proposé peut aussi être un médicament SANS ordonnance du stock de l'officine.
-- Migration additive : une colonne, deux index uniques, une clé étrangère, une contrainte. Rien n'est supprimé.

-- AlterTable
ALTER TABLE "product_associations" ADD COLUMN     "adviceSpecialtyId" TEXT,
ALTER COLUMN "adviceProductId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "product_associations_trigger_product_advice_specialty_key" ON "product_associations"("pharmacyId", "triggerProductId", "adviceSpecialtyId");

-- CreateIndex
CREATE UNIQUE INDEX "product_associations_trigger_specialty_advice_specialty_key" ON "product_associations"("pharmacyId", "triggerSpecialtyId", "adviceSpecialtyId");

-- AddForeignKey
ALTER TABLE "product_associations" ADD CONSTRAINT "product_associations_adviceSpecialtyId_fkey" FOREIGN KEY ("adviceSpecialtyId") REFERENCES "drug_specialties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Un produit proposé, un seul : un produit de l'officine OU un médicament de son stock (Prisma ne sait pas écrire cette contrainte).
ALTER TABLE "product_associations" ADD CONSTRAINT "product_associations_one_advice" CHECK ((("adviceProductId" IS NOT NULL)::int + ("adviceSpecialtyId" IS NOT NULL)::int) = 1);
