-- 1 robot pour 1 espace : le navigateur du PC du comptoir se lie à SON poste par un lien à usage unique (seule son
-- empreinte est gardée, 10 minutes), et le poste dit à chaque signe de vie s'il dessine le robot. Colonnes additives et
-- vides : rien ne change tant qu'un poste n'a pas demandé de lien.
ALTER TABLE "counter_posts" ADD COLUMN     "linkExpiresAt" TIMESTAMP(3),
ADD COLUMN     "linkTokenHash" TEXT,
ADD COLUMN     "robotShownAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "counter_posts_linkTokenHash_key" ON "counter_posts"("linkTokenHash");
