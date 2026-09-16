-- AlterTable
ALTER TABLE "advice_opportunities" ADD COLUMN     "benefits" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "recommendations" ADD COLUMN     "routine" JSONB;

-- AlterTable
ALTER TABLE "safety_findings" ADD COLUMN     "details" JSONB;

