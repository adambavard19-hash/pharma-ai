-- CreateTable
CREATE TABLE "product_leaflets" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "indications" TEXT,
    "posology" TEXT,
    "duration" TEXT,
    "quotes" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceKind" TEXT,
    "status" TEXT NOT NULL,
    "model" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_leaflets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_leaflets_key_key" ON "product_leaflets"("key");

-- CreateIndex
CREATE INDEX "product_leaflets_status_idx" ON "product_leaflets"("status");

