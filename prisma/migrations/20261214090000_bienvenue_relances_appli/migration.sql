-- E-mail de bienvenue et relances des inscrits de l'appli des patients
ALTER TABLE "app_members" ADD COLUMN "welcomeSentAt" TIMESTAMP(3),
ADD COLUMN "nurtureStep" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "nurtureLastAt" TIMESTAMP(3),
ADD COLUMN "nurtureOffAt" TIMESTAMP(3);
CREATE INDEX "app_members_createdAt_idx" ON "app_members"("createdAt");
