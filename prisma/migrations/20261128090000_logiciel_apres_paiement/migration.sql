-- Le logiciel n'est donné qu'après le paiement (fondateur, 5 nov. 2026). Les officines existantes ne sont pas bloquées.
ALTER TABLE "pharmacies" ADD COLUMN "softwareGate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "pharmacies" ADD COLUMN "softwareUnlockedAt" TIMESTAMP(3);
