-- Les effets indésirables fréquents lus dans les RCP officiels (additif) : une ligne par spécialité (CIS), donnée publique
-- de la BDPM commune à toutes les pharmacies — aucune colonne d'officine, aucune donnée patient. Remplie par
-- `npm run effets:sync` ; tant qu'elle est vide, la classification des médicaments se comporte exactement comme avant.

-- CreateTable
CREATE TABLE "drug_official_side_effects" (
    "id" TEXT NOT NULL,
    "cisCode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "effects" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "details" JSONB NOT NULL DEFAULT '[]',
    "sourceUrl" TEXT NOT NULL,
    "sectionHash" TEXT,
    "readerVersion" INTEGER NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drug_official_side_effects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "drug_official_side_effects_cisCode_key" ON "drug_official_side_effects"("cisCode");

-- CreateIndex
CREATE INDEX "drug_official_side_effects_status_idx" ON "drug_official_side_effects"("status");
