-- Campagnes de surstock (fondateur, 25 oct. 2026) : additive, une table.
-- CreateTable
CREATE TABLE "overstock_campaigns" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "triggerAtcCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "familyIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sentence" TEXT,
    "startQuantity" INTEGER NOT NULL,
    "targetQuantity" INTEGER NOT NULL DEFAULT 0,
    "endsOn" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "endedAt" TIMESTAMP(3),
    "endedReason" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "overstock_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "overstock_campaigns_pharmacyId_isActive_idx" ON "overstock_campaigns"("pharmacyId", "isActive");

-- CreateIndex
CREATE INDEX "overstock_campaigns_productId_idx" ON "overstock_campaigns"("productId");

-- AddForeignKey
ALTER TABLE "overstock_campaigns" ADD CONSTRAINT "overstock_campaigns_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overstock_campaigns" ADD CONSTRAINT "overstock_campaigns_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overstock_campaigns" ADD CONSTRAINT "overstock_campaigns_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

