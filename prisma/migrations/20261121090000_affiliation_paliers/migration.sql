-- Paliers d'affiliation (18 oct. 2026) : strictement additive, et rejouable (IF NOT EXISTS).
-- Une colonne facultative : le taux du palier appliqué à une commission mensuelle d'affiliation (10, 12, 15 ou 20).
-- Les lignes existantes gardent une valeur vide ; aucune n'est modifiée.

ALTER TABLE "commissions" ADD COLUMN IF NOT EXISTS "ratePercent" INTEGER;
