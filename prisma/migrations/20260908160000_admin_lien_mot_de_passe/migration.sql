-- AlterTable
ALTER TABLE "platform_admins" ADD COLUMN     "passwordResetExpiresAt" TIMESTAMP(3),
ADD COLUMN     "passwordResetTokenHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "platform_admins_passwordResetTokenHash_key" ON "platform_admins"("passwordResetTokenHash");

