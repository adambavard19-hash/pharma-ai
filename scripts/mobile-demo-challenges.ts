/**
 * PharmaBoost Mobile — étape Challenges : des données d'EXEMPLE pour l'aperçu local.
 *
 * Dans l'officine de pharmacien@pharma.ai (base locale seulement) :
 *  - un challenge en cours sur la marque la plus présente du stock (si l'officine n'a aucun challenge en cours) ;
 *  - un objectif du mois pour pharmacien@pharma.ai (conseils validés) ;
 *  - une prime VALIDÉE par la titulaire pour pharmacien@pharma.ai, et une prime PROPOSÉE pour preparateur@pharma.ai ;
 *  - un signalement de validation clinique sur une règle réelle du moteur (pour voir la console).
 * Tout est titré « Exemple · … » et porte la marque `exemple:mobile-demo-challenges`. Les chiffres (ventes, conseils)
 * restent ceux de la base : rien n'est inventé côté activité.
 *
 *   npm run mobile:demo:challenges                créer (idempotent)
 *   npm run mobile:demo:challenges -- --supprimer tout retirer
 */
import { prisma } from "@/server/db/client";
import { ADVICE_RULES } from "@/core/ai/engines/advice";
import { brandKey, brandLabelOf } from "@/core/catalog/brand";
import { calendarDay, dayKeyToDate } from "@/core/challenges/dates";
import { periodBounds } from "@/core/personal/objectives";

const MARKER = "exemple:mobile-demo-challenges";

function assertLocalDatabase() {
  const url = process.env.DATABASE_URL ?? "";
  const host = /@([^:/?]+)/.exec(url)?.[1] ?? "";
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error(`Refus : ce script ne s'exécute que sur une base locale (hôte lu : « ${host || "inconnu"} »).`);
  }
}

async function people() {
  const users = await prisma.user.findMany({
    where: { email: { in: ["pharmacien@pharma.ai", "titulaire@pharma.ai", "preparateur@pharma.ai"] } },
    select: { id: true, email: true, memberships: { where: { isActive: true }, select: { pharmacyId: true, role: true } } },
  });
  const by = (email: string) => users.find((user) => user.email === email);
  const pharmacist = by("pharmacien@pharma.ai");
  const owner = by("titulaire@pharma.ai");
  const preparer = by("preparateur@pharma.ai");
  const pharmacyId = pharmacist?.memberships[0]?.pharmacyId;
  if (!pharmacist || !owner || !pharmacyId) throw new Error("Comptes de démonstration absents : lancez d'abord npm run db:seed.");
  if (!owner.memberships.some((m) => m.pharmacyId === pharmacyId && m.role === "OWNER")) throw new Error("titulaire@pharma.ai n'est pas titulaire de l'officine de pharmacien@pharma.ai.");
  return { pharmacist, owner, preparer: preparer?.memberships.some((m) => m.pharmacyId === pharmacyId) ? preparer : null, pharmacyId };
}

async function remove() {
  const flags = await prisma.clinicalReviewFlag.deleteMany({ where: { reason: { startsWith: "Exemple · " } } });
  const bonuses = await prisma.bonusAuthorization.deleteMany({ where: { note: MARKER } });
  const objectives = await prisma.personalObjective.deleteMany({ where: { title: { startsWith: "Exemple · " } } });
  const challenges = await prisma.labChallenge.deleteMany({ where: { notes: MARKER } });
  console.log(`✓ Retiré : ${challenges.count} challenge(s), ${objectives.count} objectif(s), ${bonuses.count} prime(s), ${flags.count} signalement(s).`);
}

async function create() {
  const { pharmacist, owner, preparer, pharmacyId } = await people();
  const pharmacy = await prisma.pharmacy.findUniqueOrThrow({ where: { id: pharmacyId }, select: { name: true, timezone: true } });
  const today = calendarDay(new Date(), pharmacy.timezone ?? "Europe/Paris");
  const month = periodBounds("MONTH", today);

  // 1. Un challenge en cours, sur une marque réellement en stock (les unités viendront des vraies ventes).
  const running = await prisma.labChallenge.count({ where: { pharmacyId, status: "ACTIVE", startsAt: { lte: dayKeyToDate(today) }, endsAt: { gte: dayKeyToDate(today) } } });
  let challengeId: string | null = (await prisma.labChallenge.findFirst({ where: { pharmacyId, notes: MARKER }, select: { id: true } }))?.id ?? null;
  if (running === 0 && !challengeId) {
    const products = await prisma.product.findMany({ where: { pharmacyId, deletedAt: null, isActive: true }, select: { name: true, brand: true } });
    const counts = new Map<string, number>();
    for (const product of products) {
      const label = brandLabelOf(product.name, product.brand);
      if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    const brand = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!brand) throw new Error("Aucune marque au stock de l'officine : impossible de rattacher un challenge.");
    const created = await prisma.labChallenge.create({
      data: {
        pharmacyId,
        title: `Exemple · Challenge ${brand}`,
        laboratory: brand,
        brandKey: brandKey(brand),
        startsAt: dayKeyToDate(month.startsOn),
        endsAt: dayKeyToDate(month.endsOn),
        targetUnits: 60,
        tiers: [
          { units: 20, bonusCents: 0 },
          { units: 40, bonusCents: 0 },
          { units: 60, bonusCents: 0 },
        ],
        status: "ACTIVE",
        countMode: "ALL_SALES",
        notes: MARKER,
        createdByUserId: owner.id,
      },
      select: { id: true },
    });
    challengeId = created.id;
    console.log(`✓ Challenge « Exemple · Challenge ${brand} » (${month.startsOn} → ${month.endsOn}, paliers 20/40/60 unités).`);
  } else {
    console.log(challengeId ? "• Challenge d'exemple déjà présent." : "• L'officine a déjà un challenge en cours : aucun challenge d'exemple ajouté.");
  }

  // 2. Un objectif du mois pour pharmacien@.
  const objective =
    (await prisma.personalObjective.findFirst({ where: { pharmacyId, userId: pharmacist.id, title: { startsWith: "Exemple · " }, archivedAt: null }, select: { id: true } })) ??
    (await prisma.personalObjective.create({
      data: {
        pharmacyId,
        userId: pharmacist.id,
        title: "Exemple · 20 conseils validés ce mois",
        metric: "ADVICE_SOLD",
        target: 20,
        period: "MONTH",
        startsOn: dayKeyToDate(month.startsOn),
        endsOn: dayKeyToDate(month.endsOn),
        createdByUserId: owner.id,
      },
      select: { id: true },
    }));
  console.log("✓ Objectif « Exemple · 20 conseils validés ce mois » (pharmacien@).");

  // 3. Une prime validée (pharmacien@) et une prime proposée (preparateur@).
  if ((await prisma.bonusAuthorization.count({ where: { note: MARKER, userId: pharmacist.id } })) === 0) {
    await prisma.bonusAuthorization.create({
      data: { pharmacyId, userId: pharmacist.id, objectiveId: objective.id, label: "Exemple · Prime de septembre", amountCents: 5000, status: "VALIDATED", proposedByUserId: owner.id, validatedByUserId: owner.id, validatedAt: new Date(), note: MARKER },
    });
  }
  if (preparer && (await prisma.bonusAuthorization.count({ where: { note: MARKER, userId: preparer.id } })) === 0) {
    await prisma.bonusAuthorization.create({
      data: { pharmacyId, userId: preparer.id, challengeId, label: "Exemple · Prime challenge", amountCents: 3000, status: "PROPOSED", proposedByUserId: owner.id, note: MARKER },
    });
  }
  console.log("✓ Primes : 50 € validée (pharmacien@), 30 € proposée (preparateur@, invisible pour lui).");

  // 4. Un signalement de validation clinique, sur une vraie règle du moteur.
  const rule = ADVICE_RULES[0];
  if ((await prisma.clinicalReviewFlag.count({ where: { reason: { startsWith: "Exemple · " } } })) === 0) {
    await prisma.clinicalReviewFlag.create({
      data: { ruleKey: rule.key, pharmacyId, count: 3, reasonCode: "CLINICALLY_INAPPROPRIATE", reason: "Exemple · Pas adapté à ce patient", periodStart: dayKeyToDate(month.startsOn), periodEnd: new Date() },
    });
  }
  console.log(`✓ Signalement clinique d'exemple sur « ${rule.title} ».`);

  console.log(`\n${pharmacy.name} — ouvrir http://localhost:3000/m/challenges (pharmacien@ ou titulaire@ · Demo2026!Pharma)\nConsole : http://localhost:3000/admin/validation-clinique\nRetirer : npm run mobile:demo:challenges -- --supprimer\n`);
}

async function main() {
  assertLocalDatabase();
  if (process.argv.includes("--supprimer")) await remove();
  else await create();
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
