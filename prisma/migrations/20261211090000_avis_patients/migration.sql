-- Avis des patients sur leur pharmacie, laissés dans l'appli (18 nov. 2026). Aucune donnée de santé : note + mots tout prêts.
CREATE TABLE "patient_reviews" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "appMemberId" TEXT,
    "staffUserId" TEXT,
    "staffFirstName" TEXT,
    "rating" INTEGER NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "publicConsent" BOOLEAN NOT NULL DEFAULT false,
    "publicName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "patient_reviews_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "patient_reviews_pharmacyId_createdAt_idx" ON "patient_reviews"("pharmacyId", "createdAt");
CREATE INDEX "patient_reviews_staffUserId_idx" ON "patient_reviews"("staffUserId");
CREATE INDEX "patient_reviews_appMemberId_createdAt_idx" ON "patient_reviews"("appMemberId", "createdAt");
CREATE INDEX "patient_reviews_publicConsent_createdAt_idx" ON "patient_reviews"("publicConsent", "createdAt");

ALTER TABLE "patient_reviews" ADD CONSTRAINT "patient_reviews_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "patient_reviews" ADD CONSTRAINT "patient_reviews_appMemberId_fkey" FOREIGN KEY ("appMemberId") REFERENCES "app_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "patient_reviews" ADD CONSTRAINT "patient_reviews_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
