-- CreateEnum
CREATE TYPE "JoinRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REFUSED', 'CANCELLED');

-- CreateTable
CREATE TABLE "team_invitations" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "invitedByUserId" TEXT,
    "sentCount" INTEGER NOT NULL DEFAULT 1,
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "acceptedUserId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "join_requests" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "suggestedRole" "UserRole" NOT NULL DEFAULT 'TECHNICIAN',
    "passwordHash" TEXT,
    "status" "JoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedByUserId" TEXT,
    "grantedRole" "UserRole",
    "userId" TEXT,

    CONSTRAINT "join_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "team_invitations_tokenHash_key" ON "team_invitations"("tokenHash");

-- CreateIndex
CREATE INDEX "team_invitations_pharmacyId_email_idx" ON "team_invitations"("pharmacyId", "email");

-- CreateIndex
CREATE INDEX "join_requests_pharmacyId_status_idx" ON "join_requests"("pharmacyId", "status");

-- CreateIndex
CREATE INDEX "join_requests_email_idx" ON "join_requests"("email");

-- AddForeignKey
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

