-- AlterTable
ALTER TABLE "pharmacies" ADD COLUMN     "postCount" INTEGER;

-- AlterTable
ALTER TABLE "prospects" ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "lgo" TEXT;

-- CreateTable
CREATE TABLE "pharmacy_invitations" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "sendCount" INTEGER NOT NULL DEFAULT 0,
    "lastSendStatus" TEXT,
    "lastSendDetail" TEXT,
    "openedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pharmacy_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pharmacy_post_count_changes" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "previous" INTEGER,
    "next" INTEGER NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pharmacy_post_count_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_dispatches" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "provider" TEXT,
    "providerMessageId" TEXT,
    "status" TEXT NOT NULL,
    "detail" TEXT,
    "prospectId" TEXT,
    "pharmacyId" TEXT,
    "userId" TEXT,
    "invitationId" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_dispatches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pharmacy_invitations_tokenHash_key" ON "pharmacy_invitations"("tokenHash");

-- CreateIndex
CREATE INDEX "pharmacy_invitations_prospectId_idx" ON "pharmacy_invitations"("prospectId");

-- CreateIndex
CREATE INDEX "pharmacy_invitations_email_idx" ON "pharmacy_invitations"("email");

-- CreateIndex
CREATE INDEX "pharmacy_post_count_changes_pharmacyId_createdAt_idx" ON "pharmacy_post_count_changes"("pharmacyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "email_dispatches_providerMessageId_key" ON "email_dispatches"("providerMessageId");

-- CreateIndex
CREATE INDEX "email_dispatches_prospectId_createdAt_idx" ON "email_dispatches"("prospectId", "createdAt");

-- CreateIndex
CREATE INDEX "email_dispatches_pharmacyId_createdAt_idx" ON "email_dispatches"("pharmacyId", "createdAt");

-- CreateIndex
CREATE INDEX "email_dispatches_userId_createdAt_idx" ON "email_dispatches"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "pharmacy_invitations" ADD CONSTRAINT "pharmacy_invitations_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "prospects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pharmacy_post_count_changes" ADD CONSTRAINT "pharmacy_post_count_changes_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

