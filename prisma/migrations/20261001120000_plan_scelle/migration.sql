-- CreateTable
CREATE TABLE "sealed_documents" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "ciphertext" BYTEA NOT NULL,
    "iv" BYTEA NOT NULL,
    "tag" BYTEA NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "lastViewedAt" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sealed_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sealed_documents_pharmacyId_createdAt_idx" ON "sealed_documents"("pharmacyId", "createdAt");

-- CreateIndex
CREATE INDEX "sealed_documents_prescriptionId_idx" ON "sealed_documents"("prescriptionId");

-- CreateIndex
CREATE INDEX "sealed_documents_expiresAt_idx" ON "sealed_documents"("expiresAt");

-- AddForeignKey
ALTER TABLE "sealed_documents" ADD CONSTRAINT "sealed_documents_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sealed_documents" ADD CONSTRAINT "sealed_documents_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "prescriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

