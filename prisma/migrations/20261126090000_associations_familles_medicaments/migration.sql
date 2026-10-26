-- Une association peut partir d'une famille de médicaments (préfixe ATC : « J01C » = pénicillines).
ALTER TABLE "product_associations" ADD COLUMN "triggerAtcCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "product_associations_trigger_atc_advice_product_key" ON "product_associations"("pharmacyId", "triggerAtcCode", "adviceProductId");

-- CreateIndex
CREATE UNIQUE INDEX "product_associations_trigger_atc_advice_specialty_key" ON "product_associations"("pharmacyId", "triggerAtcCode", "adviceSpecialtyId");

-- Un déclencheur, un seul : un produit du stock, un médicament du catalogue national OU une famille de médicaments.
ALTER TABLE "product_associations" DROP CONSTRAINT "product_associations_one_trigger";
ALTER TABLE "product_associations" ADD CONSTRAINT "product_associations_one_trigger" CHECK ((("triggerProductId" IS NOT NULL)::int + ("triggerSpecialtyId" IS NOT NULL)::int + ("triggerAtcCode" IS NOT NULL)::int) = 1);
