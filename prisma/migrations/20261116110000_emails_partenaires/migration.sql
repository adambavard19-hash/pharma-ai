-- E-mails partenaires aux patients (17 oct. 2026)
CREATE TABLE "patient_partner_consents" (
    "id" TEXT NOT NULL,
    "emailEncrypted" TEXT,
    "emailHash" TEXT NOT NULL,
    "pharmacyId" TEXT,
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "consentText" TEXT NOT NULL,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "unsubscribedAt" TIMESTAMP(3),
    "lastSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "patient_partner_consents_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "patient_partner_consents_emailHash_key" ON "patient_partner_consents"("emailHash");
CREATE INDEX "patient_partner_consents_unsubscribedAt_idx" ON "patient_partner_consents"("unsubscribedAt");

CREATE TABLE "partner_email_campaigns" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "imageUrl" TEXT,
    "affiliateUrl" TEXT NOT NULL,
    "universes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "sentAt" TIMESTAMP(3),
    "recipients" INTEGER NOT NULL DEFAULT 0,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "partner_email_campaigns_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "partner_email_campaigns_status_idx" ON "partner_email_campaigns"("status");
ALTER TABLE "partner_email_campaigns" ADD CONSTRAINT "partner_email_campaigns_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "partner_brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "partner_email_sends" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "consentId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clickedAt" TIMESTAMP(3),
    "clicks" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "partner_email_sends_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "partner_email_sends_campaignId_consentId_key" ON "partner_email_sends"("campaignId", "consentId");
CREATE INDEX "partner_email_sends_consentId_sentAt_idx" ON "partner_email_sends"("consentId", "sentAt");
ALTER TABLE "partner_email_sends" ADD CONSTRAINT "partner_email_sends_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "partner_email_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "partner_email_sends" ADD CONSTRAINT "partner_email_sends_consentId_fkey" FOREIGN KEY ("consentId") REFERENCES "patient_partner_consents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
