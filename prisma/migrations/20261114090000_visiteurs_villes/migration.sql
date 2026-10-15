-- La ville approximative des visiteurs du site (donnée par Vercel). Ajout seulement.
ALTER TABLE "site_visitors" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "site_visitors" ADD COLUMN IF NOT EXISTS "region" TEXT;
ALTER TABLE "site_visitors" ADD COLUMN IF NOT EXISTS "country" TEXT;
CREATE INDEX IF NOT EXISTS "site_visitors_city_idx" ON "site_visitors"("city");
