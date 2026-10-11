-- Grille progressive des commerciaux (1/2) : ajouts seulement, rien n'est supprimé.
-- Les deux nouvelles valeurs ne peuvent servir qu'une fois cette migration validée :
-- leur premier emploi (valeur par défaut, bascule des commerciaux) est dans la suivante.

-- AlterEnum
ALTER TYPE "SalesCommissionType" ADD VALUE 'PROGRESSIVE';
ALTER TYPE "SalesCommissionType" ADD VALUE 'BONUS';

-- AlterTable : le palier d'un bonus (10, 25, 50, 100), vide pour une commission ordinaire.
ALTER TABLE "commissions" ADD COLUMN "bonusTier" INTEGER;

-- CreateIndex : un bonus par palier et par commercial, jamais deux (les lignes sans palier ne se gênent pas).
CREATE UNIQUE INDEX "commissions_salesRepId_bonusTier_key" ON "commissions"("salesRepId", "bonusTier");
