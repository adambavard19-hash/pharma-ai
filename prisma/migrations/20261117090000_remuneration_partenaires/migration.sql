-- Rémunération reçue des partenaires (17 oct. 2026)
CREATE TABLE "partner_earnings" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "receivedOn" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "partner_earnings_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "partner_earnings_partnerId_receivedOn_idx" ON "partner_earnings"("partnerId", "receivedOn");
ALTER TABLE "partner_earnings" ADD CONSTRAINT "partner_earnings_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;
