-- AlterTable
ALTER TABLE "counter_posts" ADD COLUMN     "pairedAt" TIMESTAMP(3),
ADD COLUMN     "pairingCodeHash" TEXT,
ADD COLUMN     "pairingExpiresAt" TIMESTAMP(3),
ALTER COLUMN "keyHash" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "counter_posts_pairingCodeHash_key" ON "counter_posts"("pairingCodeHash");

