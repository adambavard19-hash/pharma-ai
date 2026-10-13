-- La suggestion du robot (additif) : quand aucune règle ne couvre un médicament de la vente, le modèle choisit 0 à 2 produits
-- dans une liste fermée du stock de l'officine. Sa réponse est mise en cache par (officine, médicament) ; chaque choix devient
-- une proposition de règle pour la console de la pharmacienne de PharmaBoost (valider pour toutes les pharmacies, ou refuser
-- pour toujours). Aucune donnée patient dans ces tables. Rien ne change tant que le modèle n'a pas été sollicité.

-- CreateEnum
CREATE TYPE "RobotSuggestionStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "RobotProposalStatus" AS ENUM ('PENDING', 'VALIDATED', 'REFUSED');

-- CreateTable
CREATE TABLE "robot_suggestions" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "drugKey" TEXT NOT NULL,
    "drugLabel" TEXT NOT NULL,
    "status" "RobotSuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "items" JSONB,
    "candidateIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "providerId" TEXT,
    "model" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "robot_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "robot_rule_proposals" (
    "id" TEXT NOT NULL,
    "drugKey" TEXT NOT NULL,
    "drugLabel" TEXT NOT NULL,
    "atcCode" TEXT,
    "therapeuticClass" TEXT,
    "substance" TEXT,
    "productKey" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "productBrand" TEXT,
    "productEan" TEXT,
    "productCategory" TEXT NOT NULL,
    "productTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "need" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "counterScript" TEXT NOT NULL,
    "status" "RobotProposalStatus" NOT NULL DEFAULT 'PENDING',
    "pharmacyIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "providerId" TEXT,
    "model" TEXT,
    "centralKind" TEXT,
    "centralRef" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decidedByAdminId" TEXT,
    "decidedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "robot_rule_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "robot_suggestions_pharmacyId_drugKey_key" ON "robot_suggestions"("pharmacyId", "drugKey");

-- CreateIndex
CREATE INDEX "robot_suggestions_pharmacyId_expiresAt_idx" ON "robot_suggestions"("pharmacyId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "robot_rule_proposals_drugKey_productKey_key" ON "robot_rule_proposals"("drugKey", "productKey");

-- CreateIndex
CREATE INDEX "robot_rule_proposals_status_createdAt_idx" ON "robot_rule_proposals"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "robot_suggestions" ADD CONSTRAINT "robot_suggestions_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
