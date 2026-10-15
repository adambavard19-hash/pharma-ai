-- Les visiteurs du site public, un par adresse IP (empreinte seulement, jamais l'adresse en clair). Ajout seulement.
CREATE TABLE IF NOT EXISTS "site_visitors" (
    "id" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "visits" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "site_visitors_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "site_visitors_ipHash_key" ON "site_visitors"("ipHash");
CREATE INDEX IF NOT EXISTS "site_visitors_firstSeenAt_idx" ON "site_visitors"("firstSeenAt");
