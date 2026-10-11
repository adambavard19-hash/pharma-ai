-- PharmaBoost Mobile, étape Formations (Académie) : thème du catalogue, relecture par un pharmacien, motif de refus,
-- seuil de réussite du quiz. Additif : aucune donnée existante n'est modifiée.
CREATE TYPE "AcademyTopic" AS ENUM ('MEDICINES', 'PARAPHARMACY', 'PRODUCT_NEWS', 'LAB_NEWS', 'NEW_STAFF');

ALTER TABLE "training_contents" ADD COLUMN "academyTopic" "AcademyTopic";
ALTER TABLE "training_contents" ADD COLUMN "reviewerIsPharmacist" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "training_contents" ADD COLUMN "reviewNote" TEXT;
ALTER TABLE "training_contents" ADD COLUMN "quizPassPercent" INTEGER NOT NULL DEFAULT 70;
