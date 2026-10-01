-- AlterTable
ALTER TABLE "pharmacies" ADD COLUMN     "referralCode" TEXT,
ADD COLUMN     "referredById" TEXT;

-- AlterTable
ALTER TABLE "prospects" ADD COLUMN     "referralCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "pharmacies_referralCode_key" ON "pharmacies"("referralCode");

-- AddForeignKey
ALTER TABLE "pharmacies" ADD CONSTRAINT "pharmacies_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "pharmacies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

