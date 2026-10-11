-- Un robot par comptoir : colonne additive, puis rattrapage des comptoirs existants (dans l'ordre de création, par pharmacie).
ALTER TABLE "counter_posts" ADD COLUMN "robotLook" INTEGER;

UPDATE "counter_posts" AS c
SET "robotLook" = r.n
FROM (
  SELECT "id", ((ROW_NUMBER() OVER (PARTITION BY "pharmacyId" ORDER BY "createdAt", "id") - 1) % 20)::INTEGER AS n
  FROM "counter_posts"
  WHERE "revokedAt" IS NULL
) AS r
WHERE c."id" = r."id";
