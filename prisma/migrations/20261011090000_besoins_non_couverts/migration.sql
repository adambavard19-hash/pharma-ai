-- Besoins que l'assortiment ne couvre pas (octobre 2026) — migration ADDITIVE.
--
-- Une colonne nullable : pour chaque besoin de conseil détecté, le stock de l'officine
-- a-t-il pu y répondre. Ne supprime, ne renomme et ne modifie aucune colonne ni
-- aucune table existante.

-- AlterTable
ALTER TABLE "advice_opportunities" ADD COLUMN     "coverage" TEXT;
