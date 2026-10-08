-- Équipe de l'officine (octobre 2026) — migration ADDITIVE.
--
-- Deux colonnes sur les adhésions : le titulaire PRINCIPAL (celui que PharmaBoost contacte pour le contrat, la
-- facture et l'accès) et la PLACE de chacun dans la liste de l'équipe (choisie par le titulaire).
-- Ne supprime, ne renomme et ne modifie aucune colonne existante ; les deux colonnes ont une valeur par défaut.
-- « Au plus un titulaire principal par officine » est tenu par le code (une transaction), pas par un index :
-- Prisma ne sait pas représenter un index partiel et le supprimerait à la prochaine migration.

-- AlterTable
ALTER TABLE "memberships" ADD COLUMN "isPrincipal" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "memberships" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Rattrapage 1 : l'ordre actuel de l'écran (les titulaires d'abord, puis par ancienneté), numéroté dans chaque officine.
UPDATE "memberships" AS m
SET "sortOrder" = ranked.position
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "pharmacyId" ORDER BY CASE WHEN "role" = 'OWNER' THEN 0 ELSE 1 END, "createdAt", "id") AS position
  FROM "memberships"
) AS ranked
WHERE m."id" = ranked."id";

-- Rattrapage 2 : le titulaire principal par défaut est le plus ancien titulaire (un actif d'abord), pour chaque officine.
UPDATE "memberships" AS m
SET "isPrincipal" = true
FROM (
  SELECT DISTINCT ON ("pharmacyId") "id"
  FROM "memberships"
  WHERE "role" = 'OWNER'
  ORDER BY "pharmacyId", "isActive" DESC, "createdAt", "id"
) AS first_owner
WHERE m."id" = first_owner."id";
