-- AlterTable
ALTER TABLE "safety_findings" ADD COLUMN     "acknowledgedAt" TIMESTAMP(3),
ADD COLUMN     "acknowledgedByUserId" TEXT;

