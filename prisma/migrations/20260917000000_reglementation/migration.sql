-- CreateEnum
CREATE TYPE "RegulationChangeKind" AS ENUM ('EXCEPTION_STATUS', 'COVERAGE_END', 'CONDITION_ADDED', 'CONDITION_REMOVED');

-- CreateTable
CREATE TABLE "drug_coverage_statuses" (
    "id" TEXT NOT NULL,
    "presentationId" TEXT NOT NULL,
    "cip13" TEXT NOT NULL,
    "isException" BOOLEAN NOT NULL,
    "isSpecific" BOOLEAN NOT NULL,
    "nature" TEXT,
    "designation" TEXT NOT NULL,
    "notReimbursable" BOOLEAN NOT NULL DEFAULT false,
    "coverageStartsAt" TIMESTAMP(3),
    "coverageEndsAt" TIMESTAMP(3),
    "coverageEndReason" TEXT,
    "sourceName" TEXT NOT NULL,
    "sourceVersion" TEXT,
    "sourceUpdatedAt" TIMESTAMP(3),
    "checkedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drug_coverage_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drug_regulation_changes" (
    "id" TEXT NOT NULL,
    "kind" "RegulationChangeKind" NOT NULL,
    "drugName" TEXT NOT NULL,
    "cisCode" TEXT,
    "cip13" TEXT,
    "before" TEXT,
    "after" TEXT,
    "sourceName" TEXT NOT NULL,
    "sourceDate" TIMESTAMP(3),
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drug_regulation_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescription_regulation_checks" (
    "id" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "checkedByUserId" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prescription_regulation_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "drug_coverage_statuses_presentationId_key" ON "drug_coverage_statuses"("presentationId");

-- CreateIndex
CREATE UNIQUE INDEX "drug_coverage_statuses_cip13_key" ON "drug_coverage_statuses"("cip13");

-- CreateIndex
CREATE INDEX "drug_coverage_statuses_isException_idx" ON "drug_coverage_statuses"("isException");

-- CreateIndex
CREATE INDEX "drug_regulation_changes_detectedAt_idx" ON "drug_regulation_changes"("detectedAt");

-- CreateIndex
CREATE INDEX "drug_regulation_changes_cisCode_idx" ON "drug_regulation_changes"("cisCode");

-- CreateIndex
CREATE INDEX "prescription_regulation_checks_prescriptionId_idx" ON "prescription_regulation_checks"("prescriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "prescription_regulation_checks_lineId_code_key" ON "prescription_regulation_checks"("lineId", "code");

-- AddForeignKey
ALTER TABLE "drug_coverage_statuses" ADD CONSTRAINT "drug_coverage_statuses_presentationId_fkey" FOREIGN KEY ("presentationId") REFERENCES "drug_presentations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription_regulation_checks" ADD CONSTRAINT "prescription_regulation_checks_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "prescription_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

