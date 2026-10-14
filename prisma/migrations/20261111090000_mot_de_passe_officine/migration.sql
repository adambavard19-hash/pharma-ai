-- Le mot de passe de l'officine (ajout seulement, rien n'est supprimé).
ALTER TABLE "pharmacies" ADD COLUMN "teamPasswordEncrypted" TEXT;
ALTER TABLE "pharmacies" ADD COLUMN "teamPasswordHash" TEXT;
ALTER TABLE "pharmacies" ADD COLUMN "teamPasswordUpdatedAt" TIMESTAMP(3);
