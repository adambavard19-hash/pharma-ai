-- Contrats en double signature (18 oct. 2026) : strictement additive, et rejouable (IF NOT EXISTS).
-- 1. Contrat de la pharmacie : le lien de contresignature de PharmaBoost et la mise en service imprimée.
-- 2. Le contrat d'affiliation : signé par l'affilié, puis contresigné par PharmaBoost.
-- Aucune ligne existante n'est modifiée ni supprimée.

ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "companySigningUrl" TEXT;
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "setupFeeCents" INTEGER;

CREATE TABLE IF NOT EXISTS "affiliate_contracts" (
    "id" TEXT NOT NULL,
    "salesRepId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "templateKey" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "termsSnapshot" JSONB NOT NULL,
    "affiliateSignerName" TEXT NOT NULL,
    "affiliateSignerEmail" TEXT NOT NULL,
    "companySignerName" TEXT NOT NULL,
    "companySignerEmail" TEXT NOT NULL,
    "signatureProvider" TEXT NOT NULL DEFAULT 'none',
    "providerEnvelopeId" TEXT,
    "affiliateSigningUrl" TEXT,
    "companySigningUrl" TEXT,
    "sendLockedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "affiliateSignedAt" TIMESTAMP(3),
    "companySignedAt" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),
    "refusedAt" TIMESTAMP(3),
    "refusalReason" TEXT,
    "expiresAt" TIMESTAMP(3),
    "signedArchivedAt" TIMESTAMP(3),
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "affiliate_contracts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "affiliate_contracts_providerEnvelopeId_key" ON "affiliate_contracts"("providerEnvelopeId");
CREATE UNIQUE INDEX IF NOT EXISTS "affiliate_contracts_salesRepId_version_key" ON "affiliate_contracts"("salesRepId", "version");
CREATE INDEX IF NOT EXISTS "affiliate_contracts_status_idx" ON "affiliate_contracts"("status");

DO $$ BEGIN
  ALTER TABLE "affiliate_contracts" ADD CONSTRAINT "affiliate_contracts_salesRepId_fkey" FOREIGN KEY ("salesRepId") REFERENCES "sales_reps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
