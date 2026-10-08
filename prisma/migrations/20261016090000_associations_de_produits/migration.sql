-- CreateTable
CREATE TABLE "product_associations" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "triggerProductId" TEXT NOT NULL,
    "adviceProductId" TEXT NOT NULL,
    "sentence" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_associations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_associations_pharmacyId_isActive_idx" ON "product_associations"("pharmacyId", "isActive");

-- CreateIndex
CREATE INDEX "product_associations_pharmacyId_triggerProductId_idx" ON "product_associations"("pharmacyId", "triggerProductId");

-- CreateIndex
CREATE UNIQUE INDEX "product_associations_pharmacyId_triggerProductId_adviceProd_key" ON "product_associations"("pharmacyId", "triggerProductId", "adviceProductId");

-- AddForeignKey
ALTER TABLE "product_associations" ADD CONSTRAINT "product_associations_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_associations" ADD CONSTRAINT "product_associations_triggerProductId_fkey" FOREIGN KEY ("triggerProductId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_associations" ADD CONSTRAINT "product_associations_adviceProductId_fkey" FOREIGN KEY ("adviceProductId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_associations" ADD CONSTRAINT "product_associations_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

