-- Contact support (octobre 2026) — migration ADDITIVE.
--
-- Les discussions entre une officine et l'équipe PharmaBoost : trois types, deux tables. Ne supprime, ne renomme
-- et ne modifie aucune colonne ni aucune table existante. Une discussion suit son officine (supprimée avec elle).

-- CreateEnum
CREATE TYPE "SupportTopic" AS ENUM ('QUESTION', 'TECHNICAL', 'BILLING', 'SUGGESTION');

-- CreateEnum
CREATE TYPE "SupportThreadStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "SupportAuthor" AS ENUM ('PHARMACY', 'SUPPORT');

-- CreateTable
CREATE TABLE "support_threads" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "subject" TEXT NOT NULL,
    "topic" "SupportTopic" NOT NULL DEFAULT 'QUESTION',
    "status" "SupportThreadStatus" NOT NULL DEFAULT 'OPEN',
    "lastMessageFrom" "SupportAuthor" NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL,
    "unreadForSupport" BOOLEAN NOT NULL DEFAULT false,
    "unreadForPharmacy" BOOLEAN NOT NULL DEFAULT false,
    "supportAlertedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_messages" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "author" "SupportAuthor" NOT NULL,
    "authorUserId" TEXT,
    "authorAdminId" TEXT,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "support_threads_pharmacyId_lastMessageAt_idx" ON "support_threads"("pharmacyId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "support_threads_status_lastMessageFrom_lastMessageAt_idx" ON "support_threads"("status", "lastMessageFrom", "lastMessageAt");

-- CreateIndex
CREATE INDEX "support_messages_threadId_createdAt_idx" ON "support_messages"("threadId", "createdAt");

-- AddForeignKey
ALTER TABLE "support_threads" ADD CONSTRAINT "support_threads_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "support_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

