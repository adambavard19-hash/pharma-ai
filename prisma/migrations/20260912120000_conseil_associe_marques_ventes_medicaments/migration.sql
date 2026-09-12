-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PharmacyRuleType" ADD VALUE 'PREFER_BRAND';
ALTER TYPE "PharmacyRuleType" ADD VALUE 'EXCLUDE_BRAND';

-- AlterTable
ALTER TABLE "pharmacy_rules" ADD COLUMN     "brand" TEXT;

-- AlterTable
ALTER TABLE "recommendations" ADD COLUMN     "companion" JSONB;

-- AlterTable
ALTER TABLE "sale_lines" ADD COLUMN     "presentationId" TEXT;

