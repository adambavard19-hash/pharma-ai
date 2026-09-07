-- AlterTable
ALTER TABLE "import_jobs" ADD COLUMN "mapping" JSONB, ADD COLUMN "payload" JSONB, ADD COLUMN "summary" JSONB;

-- AlterTable
ALTER TABLE "pharmacy_drug_stocks" ADD COLUMN "priceCents" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_saleId_productId_key" ON "stock_movements"("saleId", "productId");
