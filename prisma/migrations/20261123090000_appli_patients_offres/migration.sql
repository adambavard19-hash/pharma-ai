-- L'appli des patients (fondateur, 22 oct. 2026) : inscrits, offres des pharmacies et des laboratoires, codes bipés au
-- comptoir, pharmacies réclamées. Strictement additive et rejouable : aucune ligne existante n'est modifiée ni supprimée.

DO $$ BEGIN
  CREATE TYPE "AppMemberPlan" AS ENUM ('FREE', 'PLUS');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PatientOfferAudience" AS ENUM ('ALL', 'SUBSCRIBERS');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PatientOfferStatus" AS ENUM ('ACTIVE', 'CANCELED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PatientOfferFunding" AS ENUM ('PHARMACY', 'LAB');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "app_members" (
    "id" TEXT NOT NULL,
    "emailHash" TEXT NOT NULL,
    "emailCipher" TEXT NOT NULL,
    "emailMasked" TEXT NOT NULL,
    "homePharmacyId" TEXT,
    "plan" "AppMemberPlan" NOT NULL DEFAULT 'FREE',
    "plusSince" TIMESTAMP(3),
    "offersConsentAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "patient_offers" (
    "id" TEXT NOT NULL,
    "funding" "PatientOfferFunding" NOT NULL DEFAULT 'PHARMACY',
    "pharmacyId" TEXT,
    "partnerId" TEXT,
    "title" TEXT NOT NULL,
    "rangeLabel" TEXT NOT NULL,
    "discountPercent" INTEGER NOT NULL,
    "details" TEXT,
    "audience" "PatientOfferAudience" NOT NULL DEFAULT 'SUBSCRIBERS',
    "status" "PatientOfferStatus" NOT NULL DEFAULT 'ACTIVE',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "labFeeCents" INTEGER,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "patient_offer_codes" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "redeemedAt" TIMESTAMP(3),
    "redeemedPharmacyId" TEXT,
    "redeemedPost" TEXT,

    CONSTRAINT "patient_offer_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "pharmacy_join_requests" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "pharmacyName" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "wantsJoin" BOOLEAN NOT NULL DEFAULT true,
    "handledAt" TIMESTAMP(3),
    "handledNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pharmacy_join_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "app_members_emailHash_key" ON "app_members"("emailHash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "app_members_homePharmacyId_idx" ON "app_members"("homePharmacyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "patient_offers_pharmacyId_status_endsAt_idx" ON "patient_offers"("pharmacyId", "status", "endsAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "patient_offers_funding_status_endsAt_idx" ON "patient_offers"("funding", "status", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "patient_offer_codes_code_key" ON "patient_offer_codes"("code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "patient_offer_codes_redeemedPharmacyId_redeemedAt_idx" ON "patient_offer_codes"("redeemedPharmacyId", "redeemedAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "patient_offer_codes_offerId_memberId_key" ON "patient_offer_codes"("offerId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "pharmacy_join_requests_memberId_key" ON "pharmacy_join_requests"("memberId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "pharmacy_join_requests_key_idx" ON "pharmacy_join_requests"("key");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "app_members" ADD CONSTRAINT "app_members_homePharmacyId_fkey" FOREIGN KEY ("homePharmacyId") REFERENCES "pharmacies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "patient_offers" ADD CONSTRAINT "patient_offers_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "patient_offers" ADD CONSTRAINT "patient_offers_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "patient_offer_codes" ADD CONSTRAINT "patient_offer_codes_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "patient_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "patient_offer_codes" ADD CONSTRAINT "patient_offer_codes_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "app_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "pharmacy_join_requests" ADD CONSTRAINT "pharmacy_join_requests_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "app_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

