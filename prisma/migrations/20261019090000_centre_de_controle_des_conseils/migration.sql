-- CreateEnum
CREATE TYPE "CentralStatus" AS ENUM ('ACTIVE', 'VALIDATED', 'REMOVED');

-- CreateEnum
CREATE TYPE "CentralRuleSource" AS ENUM ('BUILT_IN', 'CUSTOM');

-- CreateEnum
CREATE TYPE "CentralTriggerKind" AS ENUM ('MEDICINE', 'PRODUCT');

-- DropForeignKey
ALTER TABLE "advice_rule_reviews" DROP CONSTRAINT "advice_rule_reviews_pharmacyId_fkey";

-- DropForeignKey
ALTER TABLE "advice_rule_reviews" DROP CONSTRAINT "advice_rule_reviews_decidedByUserId_fkey";

-- DropTable
DROP TABLE "advice_rule_reviews";

-- DropEnum
DROP TYPE "AdviceRuleDecision";

-- CreateTable
CREATE TABLE "central_advice_rules" (
    "id" TEXT NOT NULL,
    "ruleKey" TEXT NOT NULL,
    "source" "CentralRuleSource" NOT NULL,
    "status" "CentralStatus" NOT NULL DEFAULT 'ACTIVE',
    "ruleVersion" TEXT,
    "definition" JSONB,
    "decidedAt" TIMESTAMP(3),
    "decidedByAdminId" TEXT,
    "decidedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "central_advice_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "central_associations" (
    "id" TEXT NOT NULL,
    "triggerKind" "CentralTriggerKind" NOT NULL,
    "triggerKey" TEXT NOT NULL,
    "triggerLabel" TEXT NOT NULL,
    "adviceEan" TEXT NOT NULL,
    "adviceLabel" TEXT NOT NULL,
    "sentence" TEXT,
    "status" "CentralStatus" NOT NULL DEFAULT 'ACTIVE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "decidedAt" TIMESTAMP(3),
    "decidedByAdminId" TEXT,
    "decidedByName" TEXT,
    "createdByAdminId" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "central_associations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "central_advice_rules_ruleKey_key" ON "central_advice_rules"("ruleKey");

-- CreateIndex
CREATE INDEX "central_advice_rules_status_idx" ON "central_advice_rules"("status");

-- CreateIndex
CREATE INDEX "central_associations_status_idx" ON "central_associations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "central_associations_triggerKey_adviceEan_key" ON "central_associations"("triggerKey", "adviceEan");

