-- CreateEnum
CREATE TYPE "AdviceRuleDecision" AS ENUM ('VALIDATED', 'REJECTED');

-- CreateTable
CREATE TABLE "advice_rule_reviews" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "ruleKey" TEXT NOT NULL,
    "ruleVersion" TEXT NOT NULL,
    "decision" "AdviceRuleDecision" NOT NULL,
    "note" TEXT,
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "advice_rule_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "advice_rule_reviews_pharmacyId_idx" ON "advice_rule_reviews"("pharmacyId");

-- CreateIndex
CREATE UNIQUE INDEX "advice_rule_reviews_pharmacyId_ruleKey_key" ON "advice_rule_reviews"("pharmacyId", "ruleKey");

-- AddForeignKey
ALTER TABLE "advice_rule_reviews" ADD CONSTRAINT "advice_rule_reviews_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advice_rule_reviews" ADD CONSTRAINT "advice_rule_reviews_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

