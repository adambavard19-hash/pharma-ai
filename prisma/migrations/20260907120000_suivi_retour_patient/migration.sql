-- CreateEnum
CREATE TYPE "FollowUpAnswer" AS ENUM ('BETTER', 'SAME', 'NEED_ADVICE');

-- AlterEnum
ALTER TYPE "InteractionType" ADD VALUE 'FOLLOW_UP_ANSWERED';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'FOLLOW_UP_RESPONSE';

-- AlterTable
ALTER TABLE "reminders" ADD COLUMN     "answer" "FollowUpAnswer",
ADD COLUMN     "answeredAt" TIMESTAMP(3),
ADD COLUMN     "handledAt" TIMESTAMP(3),
ADD COLUMN     "handledByUserId" TEXT,
ADD COLUMN     "responseToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "reminders_responseToken_key" ON "reminders"("responseToken");

