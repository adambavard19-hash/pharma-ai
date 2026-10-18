-- Deux questions et le conseil en deux phrases, par conseil de la bannière (18 oct. 2026)
CREATE TABLE "counter_pitches" (
    "key" TEXT NOT NULL,
    "ruleKey" TEXT NOT NULL,
    "productLabel" TEXT NOT NULL,
    "ask" TEXT[],
    "pitch" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'AI',
    "updatedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "counter_pitches_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "counter_pitches_ruleKey_idx" ON "counter_pitches"("ruleKey");
