-- CreateTable
CREATE TABLE "stock_connections" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "lgo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "pairingCodeHash" TEXT,
    "pairingExpiresAt" TIMESTAMP(3),
    "agentKeyHash" TEXT,
    "agentVersion" TEXT,
    "hostname" TEXT,
    "exportPath" TEXT,
    "scansPath" TEXT,
    "intervalSeconds" INTEGER NOT NULL DEFAULT 300,
    "lastSeenAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncLines" INTEGER,
    "lastError" TEXT,
    "pairedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stock_connections_pharmacyId_key" ON "stock_connections"("pharmacyId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_connections_pairingCodeHash_key" ON "stock_connections"("pairingCodeHash");

-- CreateIndex
CREATE UNIQUE INDEX "stock_connections_agentKeyHash_key" ON "stock_connections"("agentKeyHash");

-- AddForeignKey
ALTER TABLE "stock_connections" ADD CONSTRAINT "stock_connections_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

