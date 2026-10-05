-- Parrainage : les confrères proposés à l'inscription (octobre 2026) — migration ADDITIVE.
--
-- Une table, rien d'autre. Ne supprime, ne renomme et ne modifie aucune colonne ni
-- aucune table existante.

-- CreateTable
CREATE TABLE "referral_leads" (
    "id" TEXT NOT NULL,
    "referrerProspectId" TEXT NOT NULL,
    "contactName" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "referredProspectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "referral_leads_referredProspectId_key" ON "referral_leads"("referredProspectId");

-- CreateIndex
CREATE INDEX "referral_leads_referrerProspectId_idx" ON "referral_leads"("referrerProspectId");

-- CreateIndex
CREATE INDEX "referral_leads_email_idx" ON "referral_leads"("email");

-- AddForeignKey
ALTER TABLE "referral_leads" ADD CONSTRAINT "referral_leads_referrerProspectId_fkey" FOREIGN KEY ("referrerProspectId") REFERENCES "prospects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_leads" ADD CONSTRAINT "referral_leads_referredProspectId_fkey" FOREIGN KEY ("referredProspectId") REFERENCES "prospects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
