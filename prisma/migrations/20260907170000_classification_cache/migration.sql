-- CreateTable
CREATE TABLE "drug_classifications" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "substance" TEXT,
    "atcCode" TEXT,
    "therapeuticClass" TEXT,
    "commonSideEffects" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "confidence" DOUBLE PRECISION NOT NULL,
    "providerId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "validatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drug_classifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "drug_classifications_key_key" ON "drug_classifications"("key");
