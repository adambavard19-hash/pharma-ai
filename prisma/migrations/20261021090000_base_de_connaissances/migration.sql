
-- CreateTable
CREATE TABLE "knowledge_documents" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "fileName" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "textContent" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DEPOSITED',
    "analysisError" TEXT,
    "analysedAt" TIMESTAMP(3),
    "analysisModel" TEXT,
    "discardedCount" INTEGER NOT NULL DEFAULT 0,
    "createdByAdminId" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_proposals" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "sourceQuote" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "problem" TEXT,
    "resultRef" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decidedByAdminId" TEXT,
    "decidedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "knowledge_documents_createdAt_idx" ON "knowledge_documents"("createdAt");

-- CreateIndex
CREATE INDEX "knowledge_proposals_documentId_status_idx" ON "knowledge_proposals"("documentId", "status");

-- AddForeignKey
ALTER TABLE "knowledge_proposals" ADD CONSTRAINT "knowledge_proposals_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "knowledge_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

