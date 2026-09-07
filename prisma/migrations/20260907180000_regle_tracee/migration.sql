-- AlterTable
ALTER TABLE "advice_opportunities"
  ADD COLUMN "ruleKey" TEXT,
  ADD COLUMN "ruleVersion" TEXT,
  ADD COLUMN "confirmedReason" TEXT;
