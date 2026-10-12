-- Stripe branché sur la tarification (additif) : mise en service sur la première facture, engagement de 12 mois,
-- remise de parrainage appliquée chez Stripe, souscription en ligne (conditions acceptées), suivi de la mise en service.
CREATE TYPE "SetupStatus" AS ENUM ('TO_SCHEDULE', 'SCHEDULED', 'DONE');

ALTER TABLE "pharmacies" ADD COLUMN "setupStatus" "SetupStatus";
ALTER TABLE "pharmacies" ADD COLUMN "setupScheduledAt" TIMESTAMP(3);
ALTER TABLE "pharmacies" ADD COLUMN "setupDoneAt" TIMESTAMP(3);

ALTER TABLE "prospects" ADD COLUMN "termsAcceptedAt" TIMESTAMP(3);
ALTER TABLE "prospects" ADD COLUMN "termsVersion" TEXT;
ALTER TABLE "prospects" ADD COLUMN "selfCheckoutSessionId" TEXT;

ALTER TABLE "plans" ADD COLUMN "stripeSetupPriceId" TEXT;
CREATE UNIQUE INDEX "plans_stripeSetupPriceId_key" ON "plans"("stripeSetupPriceId");

ALTER TABLE "subscriptions" ADD COLUMN "commitmentMonths" INTEGER;
ALTER TABLE "subscriptions" ADD COLUMN "commitmentEndsAt" TIMESTAMP(3);
ALTER TABLE "subscriptions" ADD COLUMN "setupFeeCents" INTEGER;
ALTER TABLE "subscriptions" ADD COLUMN "referralDiscountCents" INTEGER;
ALTER TABLE "subscriptions" ADD COLUMN "referralCouponId" TEXT;
ALTER TABLE "subscriptions" ADD COLUMN "referralSyncedAt" TIMESTAMP(3);

ALTER TABLE "subscription_invites" ADD COLUMN "setupFeeCents" INTEGER;
