-- CreateTable
CREATE TABLE "counter_question_answers" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "treeKey" TEXT NOT NULL,
    "nodeKey" TEXT NOT NULL,
    "choices" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" TEXT NOT NULL DEFAULT 'POSTE',
    "answeredByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "counter_question_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "counter_question_answers_pharmacyId_idx" ON "counter_question_answers"("pharmacyId");

-- CreateIndex
CREATE UNIQUE INDEX "counter_question_answers_prescriptionId_treeKey_nodeKey_key" ON "counter_question_answers"("prescriptionId", "treeKey", "nodeKey");

-- AddForeignKey
ALTER TABLE "counter_question_answers" ADD CONSTRAINT "counter_question_answers_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counter_question_answers" ADD CONSTRAINT "counter_question_answers_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "prescriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
