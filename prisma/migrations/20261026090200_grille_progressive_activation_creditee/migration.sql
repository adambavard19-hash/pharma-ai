-- Grille progressive des commerciaux (3/3) : ajouts seulement, rien n'est supprimé.
--
-- 1. L'activation d'un dossier est datée et créditée UNE fois, au moment où elle a lieu :
--    `activatedAt` (la première activation) et `activationSalesRepId` (le commercial qui
--    suivait le dossier à cet instant). Le rang dans la grille, le montant et les bonus en
--    découlent ; une réaffectation ou un dossier perdu ensuite n'y changent plus rien.
-- 2. `progressiveSince` : depuis quand un commercial est à la grille. Un bonus de palier
--    atteint avant cette date n'est pas créé d'office (rattrapage explicite seulement).
-- 3. `earnedAt` : quand une commission est devenue acquise (« Ce mois » de l'extranet).

-- AlterTable
ALTER TABLE "prospects" ADD COLUMN "activatedAt" TIMESTAMP(3),
ADD COLUMN "activationSalesRepId" TEXT;

-- AlterTable
ALTER TABLE "sales_reps" ADD COLUMN "progressiveSince" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "commissions" ADD COLUMN "earnedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "prospects_activationSalesRepId_activatedAt_idx" ON "prospects"("activationSalesRepId", "activatedAt");

-- Reprise des activations existantes. Date : le premier événement « → Activé » du dossier ;
-- à défaut (donnée ancienne, ou dossier activé puis perdu sans cet événement), la création de
-- son officine, sinon celle du dossier. Crédit : le commercial qui suit le dossier aujourd'hui,
-- seule information disponible pour le passé.
UPDATE "prospects" AS p
SET "activatedAt" = COALESCE(
      (SELECT MIN(e."createdAt") FROM "prospect_events" AS e
        WHERE e."prospectId" = p."id" AND e."type" = 'STATUS_CHANGED' AND e."metadata"->>'to' = 'ACTIVATED'),
      (SELECT ph."createdAt" FROM "pharmacies" AS ph WHERE ph."id" = p."pharmacyId"),
      p."createdAt"),
    "activationSalesRepId" = p."salesRepId"
WHERE p."activatedAt" IS NULL
  AND (p."status" = 'ACTIVATED'
       OR EXISTS (SELECT 1 FROM "prospect_events" AS e
                   WHERE e."prospectId" = p."id" AND e."type" = 'STATUS_CHANGED'
                     AND (e."metadata"->>'to' = 'ACTIVATED' OR e."metadata"->>'from' = 'ACTIVATED')));

-- Les commerciaux déjà à la grille (bascule de la migration précédente) : la grille commence maintenant.
-- En UTC explicitement, comme toutes les dates écrites par l'application (une base réglée sur l'heure de
-- Paris décalerait sinon la date de deux heures).
UPDATE "sales_reps" SET "progressiveSince" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
WHERE "commissionType" = 'PROGRESSIVE' AND "progressiveSince" IS NULL;

-- Reprise de la date d'acquisition des commissions déjà acquises : la finalisation du contrat
-- du dossier (le moment où la commission devient acquise), à défaut le paiement ou la création.
UPDATE "commissions" AS c
SET "earnedAt" = CASE WHEN c."type" = 'BONUS' THEN c."updatedAt" ELSE COALESCE(
      (SELECT MAX(ct."finalizedAt") FROM "contracts" AS ct WHERE ct."prospectId" = c."prospectId"),
      c."paidAt",
      c."createdAt") END
WHERE c."status" IN ('EARNED', 'PAYABLE', 'PAID') AND c."earnedAt" IS NULL;
