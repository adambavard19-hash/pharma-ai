-- Conseil sous chaque médicament (octobre 2026) — migration ADDITIVE.
--
-- Deux colonnes, rien d'autre : les lignes d'ordonnance qui ont déclenché un
-- conseil (pour l'afficher sous le médicament concerné) et les autres références
-- du stock adaptées au même besoin (les alternatives). Ne supprime, ne renomme et
-- ne modifie aucune colonne ni aucune table existante.

-- AlterTable
ALTER TABLE "advice_opportunities" ADD COLUMN     "triggeredLineIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "recommendations" ADD COLUMN     "alternatives" JSONB;
