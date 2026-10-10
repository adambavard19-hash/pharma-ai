-- CreateTable
CREATE TABLE "knowledge_gaps" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "guess" JSONB,
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "pharmacyIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "answer" JSONB,
    "answeredByAdminId" TEXT,
    "answeredByName" TEXT,
    "answeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_gaps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "knowledge_gaps_status_createdAt_idx" ON "knowledge_gaps"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_gaps_kind_key_key" ON "knowledge_gaps"("kind", "key");

