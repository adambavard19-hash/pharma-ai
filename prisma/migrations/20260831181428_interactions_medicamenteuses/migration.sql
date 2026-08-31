-- CreateEnum
CREATE TYPE "InteractionSeverity" AS ENUM ('CONTRAINDICATION', 'NOT_RECOMMENDED', 'PRECAUTION', 'TO_CONSIDER');

-- CreateEnum
CREATE TYPE "InteractionSideKind" AS ENUM ('SUBSTANCE', 'CLASS');

-- AlterEnum
ALTER TYPE "ReferenceSource" ADD VALUE 'INTERACTIONS';

-- CreateTable
CREATE TABLE "drug_interaction_rules" (
    "id" TEXT NOT NULL,
    "leftLabel" TEXT NOT NULL,
    "rightLabel" TEXT NOT NULL,
    "leftKey" TEXT NOT NULL,
    "rightKey" TEXT NOT NULL,
    "leftKind" "InteractionSideKind" NOT NULL,
    "rightKind" "InteractionSideKind" NOT NULL,
    "severity" "InteractionSeverity" NOT NULL,
    "risk" TEXT NOT NULL,
    "guidance" TEXT,
    "sourceName" TEXT NOT NULL,
    "sourceVersion" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceUpdatedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drug_interaction_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drug_interaction_class_members" (
    "id" TEXT NOT NULL,
    "classLabel" TEXT NOT NULL,
    "classKey" TEXT NOT NULL,
    "substanceLabel" TEXT NOT NULL,
    "substanceKey" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drug_interaction_class_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "drug_interaction_rules_leftKey_idx" ON "drug_interaction_rules"("leftKey");

-- CreateIndex
CREATE INDEX "drug_interaction_rules_rightKey_idx" ON "drug_interaction_rules"("rightKey");

-- CreateIndex
CREATE UNIQUE INDEX "drug_interaction_rules_leftKey_rightKey_severity_sourceName_key" ON "drug_interaction_rules"("leftKey", "rightKey", "severity", "sourceName");

-- CreateIndex
CREATE INDEX "drug_interaction_class_members_substanceKey_idx" ON "drug_interaction_class_members"("substanceKey");

-- CreateIndex
CREATE UNIQUE INDEX "drug_interaction_class_members_classKey_substanceKey_source_key" ON "drug_interaction_class_members"("classKey", "substanceKey", "sourceName");

