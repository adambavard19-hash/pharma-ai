-- AlterTable
ALTER TABLE "advice_opportunities"
  ADD COLUMN "needKey" TEXT,
  ADD COLUMN "question" TEXT,
  ADD COLUMN "requiresConfirmation" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "answer" BOOLEAN,
  ADD COLUMN "answeredAt" TIMESTAMP(3),
  ADD COLUMN "answeredByUserId" TEXT,
  ADD COLUMN "aiJustification" TEXT;

-- AlterTable
ALTER TABLE "analysis_runs" ADD COLUMN "understanding" JSONB;
