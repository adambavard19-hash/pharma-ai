-- AlterEnum
ALTER TYPE "RecommendationEventType" ADD VALUE 'IGNORED';

-- AlterEnum
ALTER TYPE "RecommendationStatus" ADD VALUE 'IGNORED';

-- AlterTable
ALTER TABLE "recommendations" ADD COLUMN     "presentationId" TEXT,
ADD COLUMN     "shortReason" TEXT;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_presentationId_fkey" FOREIGN KEY ("presentationId") REFERENCES "drug_presentations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

