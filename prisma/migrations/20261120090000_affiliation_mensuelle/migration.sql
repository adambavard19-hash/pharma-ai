-- Affiliation mensuelle (18 oct. 2026) : strictement additive, et rejouable (IF NOT EXISTS).
-- Deux nouvelles valeurs de type de commission, une colonne facultative, un index unique (les lignes existantes ont
-- toutes "periodMonth" vide : PostgreSQL ne compare jamais deux NULL, aucune n'est touchée), une table neuve.

ALTER TYPE "SalesCommissionType" ADD VALUE IF NOT EXISTS 'AFFILIATE';
ALTER TYPE "SalesCommissionType" ADD VALUE IF NOT EXISTS 'AFFILIATE_SIGNUP';

ALTER TABLE "commissions" ADD COLUMN IF NOT EXISTS "periodMonth" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "commissions_prospectId_periodMonth_key" ON "commissions"("prospectId", "periodMonth");

-- La prime unique du directeur commercial, une par pharmacie.
CREATE TABLE IF NOT EXISTS "director_bonuses" (
    "id" TEXT NOT NULL,
    "salesDirectorId" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "CommissionStatus" NOT NULL DEFAULT 'EARNED',
    "earnedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "director_bonuses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "director_bonuses_prospectId_key" ON "director_bonuses"("prospectId");
CREATE INDEX IF NOT EXISTS "director_bonuses_salesDirectorId_status_idx" ON "director_bonuses"("salesDirectorId", "status");

DO $$ BEGIN
  ALTER TABLE "director_bonuses" ADD CONSTRAINT "director_bonuses_salesDirectorId_fkey" FOREIGN KEY ("salesDirectorId") REFERENCES "sales_directors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "director_bonuses" ADD CONSTRAINT "director_bonuses_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "prospects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
