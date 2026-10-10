-- AlterTable
ALTER TABLE "counter_posts" ADD COLUMN     "assignedUserId" TEXT;

-- AlterTable
ALTER TABLE "prescriptions" ADD COLUMN     "counterPostId" TEXT,
ADD COLUMN     "handledByUserId" TEXT;

-- CreateIndex
CREATE INDEX "counter_posts_assignedUserId_idx" ON "counter_posts"("assignedUserId");

-- CreateIndex
CREATE INDEX "prescriptions_pharmacyId_counterPostId_idx" ON "prescriptions"("pharmacyId", "counterPostId");

-- CreateIndex
CREATE INDEX "prescriptions_pharmacyId_handledByUserId_createdAt_idx" ON "prescriptions"("pharmacyId", "handledByUserId", "createdAt");


-- Historique : une ordonnance saisie ou déposée appartient à la personne qui l'a créée.
UPDATE "prescriptions" SET "handledByUserId" = "createdByUserId" WHERE "source" <> 'COUNTER_SCAN' AND "handledByUserId" IS NULL AND "createdByUserId" IS NOT NULL;

-- Historique : une vente de la douchette retrouve son comptoir par le nom qu'il portait (étiquette, à défaut nom de machine).
UPDATE "prescriptions" p SET "counterPostId" = cp."id"
FROM "counter_posts" cp
WHERE p."source" = 'COUNTER_SCAN' AND p."counterPostId" IS NULL AND p."pharmacyId" = cp."pharmacyId" AND p."counterPost" IS NOT NULL AND (p."counterPost" = cp."label" OR p."counterPost" = cp."hostname");
