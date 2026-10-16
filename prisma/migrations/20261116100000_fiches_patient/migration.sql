-- Fiches patient des produits conseillés, pour le bilan e-mail (17 oct. 2026)
CREATE TABLE "patient_card_cache" (
    "key" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "providerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "patient_card_cache_pkey" PRIMARY KEY ("key")
);
