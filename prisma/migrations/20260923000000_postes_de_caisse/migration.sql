-- AlterEnum
ALTER TYPE "PrescriptionSource" ADD VALUE 'COUNTER_SCAN';

-- AlterTable
ALTER TABLE "prescriptions" ADD COLUMN     "counterPost" TEXT;

-- CreateTable
CREATE TABLE "counter_posts" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "label" TEXT,
    "keyHash" TEXT NOT NULL,
    "version" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "lastScanAt" TIMESTAMP(3),
    "scanCount" INTEGER NOT NULL DEFAULT 0,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "counter_posts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "counter_posts_keyHash_key" ON "counter_posts"("keyHash");

-- CreateIndex
CREATE INDEX "counter_posts_pharmacyId_idx" ON "counter_posts"("pharmacyId");

-- AddForeignKey
ALTER TABLE "counter_posts" ADD CONSTRAINT "counter_posts_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

