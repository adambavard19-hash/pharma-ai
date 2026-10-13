-- Les conseils modifiables (additif) : une règle du code peut être MODIFIÉE depuis la console de PharmaBoost (textes,
-- déclencheurs, produits proposés, exclusions en plus de celles du code, priorité, précautions, source). La modification vaut
-- pour toutes les pharmacies. Chaque modification et chaque retour à l'origine est historisé (qui, quand, avant, après).
-- Rien ne change pour les règles non modifiées.

-- AlterTable
ALTER TABLE "central_advice_rules" ADD COLUMN "override" JSONB,
ADD COLUMN "overrideRevision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "overrideBaseVersion" TEXT,
ADD COLUMN "overriddenAt" TIMESTAMP(3),
ADD COLUMN "overriddenByName" TEXT;

-- CreateTable
CREATE TABLE "central_advice_edits" (
    "id" TEXT NOT NULL,
    "targetKind" TEXT NOT NULL,
    "targetKey" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "changed" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "before" JSONB,
    "after" JSONB,
    "adminId" TEXT,
    "adminName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "central_advice_edits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "central_advice_edits_targetKind_targetKey_createdAt_idx" ON "central_advice_edits"("targetKind", "targetKey", "createdAt");
