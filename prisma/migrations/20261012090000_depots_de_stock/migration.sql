-- Dépôts de stock par le titulaire (octobre 2026) — migration ADDITIVE.
--
-- Une table et un type : chaque fichier de stock envoyé depuis l'espace de l'officine
-- (qui, quand, quel fichier, ce qui a été appliqué ou ce qui attend l'équipe).
-- Ne supprime, ne renomme et ne modifie aucune table ni aucune colonne existante.

-- CreateEnum
CREATE TYPE "StockDepositStatus" AS ENUM ('RECEIVED', 'APPLIED', 'HELD', 'FAILED', 'REJECTED');

-- CreateTable
CREATE TABLE "stock_deposits" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "userId" TEXT,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "fileSha256" TEXT NOT NULL,
    "storageKey" TEXT,
    "status" "StockDepositStatus" NOT NULL DEFAULT 'RECEIVED',
    "lines" INTEGER,
    "created" INTEGER,
    "updated" INTEGER,
    "invalid" INTEGER,
    "zeroed" INTEGER,
    "knownLines" INTEGER,
    "message" TEXT,
    "importJobId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "fileDeletedAt" TIMESTAMP(3),

    CONSTRAINT "stock_deposits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_deposits_pharmacyId_receivedAt_idx" ON "stock_deposits"("pharmacyId", "receivedAt");

-- CreateIndex
CREATE INDEX "stock_deposits_status_receivedAt_idx" ON "stock_deposits"("status", "receivedAt");

-- AddForeignKey
ALTER TABLE "stock_deposits" ADD CONSTRAINT "stock_deposits_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_deposits" ADD CONSTRAINT "stock_deposits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
