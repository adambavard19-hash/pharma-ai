-- PharmaBoost Mobile, étape Découvertes : suivi de facturation des campagnes sponsorisées (additif).
CREATE TYPE "SponsoredBillingStatus" AS ENUM ('QUOTE', 'SIGNED', 'INVOICED', 'PAID');

ALTER TABLE "sponsored_campaigns" ADD COLUMN "billingStatus" "SponsoredBillingStatus" NOT NULL DEFAULT 'QUOTE';
ALTER TABLE "sponsored_campaigns" ADD COLUMN "paidAt" TIMESTAMP(3);
