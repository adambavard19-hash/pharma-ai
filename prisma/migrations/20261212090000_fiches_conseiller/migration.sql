-- Fiches « Conseiller certifié PharmaBoost » (19 nov. 2026) : code court vérifiable, chiffres figés, aucun montant ni patient.
CREATE TABLE "advisor_certificates" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "roleLabel" TEXT NOT NULL,
    "pharmacyName" TEXT NOT NULL,
    "pharmacyCity" TEXT,
    "stats" JSONB NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "advisor_certificates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "advisor_certificates_code_key" ON "advisor_certificates"("code");
CREATE INDEX "advisor_certificates_userId_issuedAt_idx" ON "advisor_certificates"("userId", "issuedAt");
