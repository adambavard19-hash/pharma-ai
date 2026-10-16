-- Rappels de fin de cure (17 oct. 2026)
CREATE TABLE "cure_reminders" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "prescriptionId" TEXT,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "durationSource" TEXT NOT NULL,
    "emailEncrypted" TEXT,
    "emailHash" TEXT NOT NULL,
    "soldAt" TIMESTAMP(3) NOT NULL,
    "sendAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "cure_reminders_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cure_reminders_status_sendAt_idx" ON "cure_reminders"("status", "sendAt");
CREATE INDEX "cure_reminders_pharmacyId_createdAt_idx" ON "cure_reminders"("pharmacyId", "createdAt");
CREATE INDEX "cure_reminders_emailHash_idx" ON "cure_reminders"("emailHash");
ALTER TABLE "cure_reminders" ADD CONSTRAINT "cure_reminders_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "cure_reminder_opt_outs" (
    "emailHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cure_reminder_opt_outs_pkey" PRIMARY KEY ("emailHash")
);

CREATE TABLE "cure_durations" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "updatedByName" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "cure_durations_pkey" PRIMARY KEY ("key")
);
