-- Dépôts de stock : l'origine du fichier (octobre 2026) — migration ADDITIVE.
--
-- Une colonne avec valeur par défaut sur la table créée par la migration précédente :
-- WEB (espace du titulaire), AGENT (le petit facteur du serveur) ou CONSOLE (équipe).
-- Ne supprime, ne renomme et ne modifie aucune colonne existante.

-- AlterTable
ALTER TABLE "stock_deposits" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'WEB';
