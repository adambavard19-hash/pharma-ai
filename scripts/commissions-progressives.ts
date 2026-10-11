/**
 * Rattrapage de la grille progressive sur les données existantes : pour chaque
 * commercial à la grille (et chaque commercial qui garde un bonus en attente),
 * recalcule les montants des commissions encore modifiables, crée les bonus
 * des paliers atteints DEPUIS son passage à la grille et rend acquis ceux dont
 * la pharmacie du palier a déjà payé. Même service que le calcul au fil de
 * l'eau (`syncProgressiveCommissions`) : idempotent, sûr sous appels
 * simultanés, une commission payée, annulée ou facturée n'est jamais touchée,
 * les commissions d'avant la grille (montant fixe) gardent leur montant.
 *
 * Les paliers atteints AVANT le passage à la grille ne donnent pas de bonus
 * d'office : le script les liste ; ils ne sont créés qu'avec
 * --bonus-retroactifs (décision du fondateur), et --appliquer.
 *
 * Par défaut, SIMULATION : rien n'est écrit, le script dit ce qu'il ferait.
 *   npm run commissions:progressives
 *   npm run commissions:progressives -- --appliquer
 *   npm run commissions:progressives -- --bonus-retroactifs [--appliquer]
 *   npm run commissions:progressives -- --commercial prenom.nom@exemple.fr [--appliquer]
 *
 * La base visée est celle de DATABASE_URL (.env) : vérifiez-la avant --appliquer.
 */
import { prisma } from "@/server/db/client";
import { previewProgressiveSync, syncProgressiveCommissions } from "@/server/services/sales/progressive-commissions";
import { formatPriceEuros } from "@/core/pricing/official-offer";
import { rankLabel } from "@/core/sales/progressive-commission";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const apply = process.argv.includes("--appliquer");
  const retroactive = process.argv.includes("--bonus-retroactifs");
  const only = arg("commercial")?.toLowerCase();
  const host = (() => {
    try {
      return new URL(process.env.DATABASE_URL ?? "").hostname;
    } catch {
      return "inconnue";
    }
  })();
  console.log(`Base : ${host} — ${apply ? "APPLICATION" : "SIMULATION (rien n'est écrit ; --appliquer pour écrire)"}${retroactive ? " — bonus des paliers d'avant la grille INCLUS" : ""}\n`);

  const reps = await prisma.salesRep.findMany({
    where: { OR: [{ commissionType: "PROGRESSIVE" }, { commissions: { some: { type: "BONUS", status: "FORECAST" } } }], ...(only ? { email: only } : {}) },
    orderBy: { lastName: "asc" },
    select: { id: true, email: true, firstName: true, lastName: true },
  });
  if (reps.length === 0) console.log(only ? `Aucun commercial à la grille progressive avec l'adresse ${only}.` : "Aucun commercial à la grille progressive.");

  let changes = 0;
  let preGridLeft = 0;
  for (const rep of reps) {
    const { plan, names, legacy, gridActive, progressiveSince } = await previewProgressiveSync(rep.id, { includePreGridBonuses: retroactive });
    const name = (id: string) => names.get(id) ?? id;
    console.log(`${rep.firstName} ${rep.lastName} <${rep.email}> — ${plan.ranked.length} pharmacie(s) activée(s)${gridActive ? `, à la grille depuis le ${progressiveSince ? progressiveSince.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" }) : "prochain recalcul"}` : ", hors grille (bonus en attente seulement)"}`);
    for (const update of plan.amountUpdates) console.log(`  · ${name(update.prospectId)} : ${formatPriceEuros(update.fromCents)} → ${formatPriceEuros(update.toCents)} (${update.rank ? `${rankLabel(update.rank)} activée` : "prévision"})`);
    for (const creation of plan.bonusCreations) console.log(`  · bonus ${creation.tier.name} +${formatPriceEuros(creation.tier.cents)} à créer, ${creation.earned ? "ACQUIS (premier paiement déjà reçu)" : "prévisionnel (en attente du premier paiement)"} — ${name(creation.prospectId)}`);
    for (const skipped of plan.preGridBonuses) console.log(`  · palier ${skipped.tier.name} (${skipped.tier.at}) atteint AVANT la grille — ${name(skipped.prospectId)} : pas de bonus (ajoutez --bonus-retroactifs pour le créer, ${skipped.earned ? "acquis d'emblée" : "en attente du premier paiement"})`);
    for (const relink of plan.bonusRelinks) console.log(`  · bonus ${relink.tier.name} à rattacher à ${name(relink.toProspectId)}`);
    for (const promotion of plan.bonusPromotions) console.log(`  · bonus ${promotion.tier.name} à rendre acquis (premier paiement de ${name(promotion.prospectId)})`);
    if (legacy.length > 0) console.log(`  (${legacy.length} commission(s) d'une autre règle gardent leur montant : ${legacy.map((row) => `${name(row.prospectId)} ${formatPriceEuros(row.amountCents)} ${row.status}`).join(", ")})`);
    const planned = plan.amountUpdates.length + plan.bonusCreations.length + plan.bonusRelinks.length + plan.bonusPromotions.length;
    if (planned === 0) console.log("  rien à faire");
    changes += planned;
    preGridLeft += plan.preGridBonuses.length;
    if (apply && planned > 0) {
      const report = await syncProgressiveCommissions(rep.id, { includePreGridBonuses: retroactive });
      console.log(`  → appliqué : ${report.amountUpdates} montant(s), bonus créés [${report.bonusesCreated.join(", ")}], acquis [${report.bonusesEarned.join(", ")}], ${report.bonusesRelinked} rattachement(s)`);
    }
  }
  console.log(`\n${changes} changement(s) ${apply ? "appliqué(s)" : "prévu(s)"}.${preGridLeft > 0 ? ` ${preGridLeft} palier(s) d'avant la grille laissé(s) sans bonus.` : ""}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
