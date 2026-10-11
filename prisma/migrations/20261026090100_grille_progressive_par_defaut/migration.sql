-- Grille progressive des commerciaux (2/2) : la grille devient la règle par défaut.
-- Les commerciaux au montant fixe passent à la grille ; les accords particuliers
-- (pourcentage, mensuel) restent tels quels. Les commissions déjà créées ne sont pas
-- touchées ici : leur recalcul passe par le service (scripts/commissions-progressives.ts).

-- AlterTable
ALTER TABLE "sales_reps" ALTER COLUMN "commissionType" SET DEFAULT 'PROGRESSIVE';

-- Bascule des commerciaux au montant fixe
UPDATE "sales_reps" SET "commissionType" = 'PROGRESSIVE' WHERE "commissionType" = 'FIXED';
