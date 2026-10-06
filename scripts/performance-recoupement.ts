/**
 * Recoupement du suivi de performance : le service d'un côté, le SQL brut de l'autre.
 *
 * LECTURE SEULE. Le script ne crée, ne modifie et ne supprime rien : il appelle
 * les lectures du service (`loadPerformanceReport`, `loadSubscriptionReturn`)
 * puis recalcule les mêmes agrégats directement en SQL (`prisma.$queryRaw`,
 * requêtes de lecture uniquement), et imprime les deux colonnes côte à côte.
 * Une ligne marquée ≠ est un écart à comprendre avant de croire un chiffre.
 *
 *   node --env-file=.env --conditions=react-server --import tsx scripts/performance-recoupement.ts \
 *     <officine> [--periode aujourdhui|7j|mois|perso] [--du aaaa-mm-jj --au aaaa-mm-jj]
 *
 *   <officine> : l'identifiant, ou un morceau du nom (une seule officine doit correspondre).
 *   Sans --periode : 7j. Le code de sortie est 1 s'il y a au moins un écart.
 *
 * Les règles recalculées ici sont celles du cahier des charges, écrites une
 * seconde fois en SQL exprès : si les deux colonnes concordent, ce n'est pas
 * le même code qui se relit lui-même.
 */
import { TIME_ZONE } from "@/config/constants";
import { isDemoMode } from "@/config/env";
import { ACCEPTED_STATUSES, PENDING_GRACE_HOURS, RHYTHM_WINDOW_DAYS, monthBoundsFor, parsePeriodParams } from "@/core/performance";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/server/db/client";
import { loadPerformanceReport, loadSubscriptionReturn } from "@/server/services/performance";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

// ---------------------------------------------------------------- Mise en page

type Line = { label: string; service: number | string | null; sql: number | string | null; money?: boolean };
let mismatches = 0;

const euros = (cents: number) => `${(cents / 100).toFixed(2).replace(".", ",")} €`;
const show = (value: number | string | null, money?: boolean) =>
  value === null ? "—" : money && typeof value === "number" ? `${euros(value)} (${value})` : String(value);

/** Deux nombres sont d'accord à une demi-unité près (un arrondi au centime ne fait pas un écart). */
function agree(service: number | string | null, sql: number | string | null): boolean {
  if (typeof service === "number" && typeof sql === "number") return Math.abs(service - sql) < 0.5 + 1e-9;
  return service === sql;
}

function section(title: string, lines: Line[]) {
  console.log(`\n${title}`);
  const width = Math.max(...lines.map((line) => line.label.length)) + 2;
  console.log(`  ${"".padEnd(width)}${"service".padEnd(24)}${"SQL brut".padEnd(24)}`);
  for (const line of lines) {
    const ok = agree(line.service, line.sql);
    if (!ok) mismatches += 1;
    console.log(`  ${line.label.padEnd(width)}${show(line.service, line.money).padEnd(24)}${show(line.sql, line.money).padEnd(24)}${ok ? "✓" : "≠ ÉCART"}`);
  }
}

// ---------------------------------------------------------------- SQL brut

/** Un instant UTC pour une colonne `timestamp` : indépendant du fuseau de la session SQL. */
const at = (date: Date) => Prisma.sql`(${date.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;

type Window = { start: Date; end: Date };
const demoOk = (alias: string) => Prisma.sql`(${isDemoMode()}::boolean OR ${Prisma.raw(alias)}."isDemo" = false)`;

/** Les conseils PharmaBoost d'une fenêtre, comptés par statut (date de PROPOSITION). */
async function adviceByStatus(pharmacyId: string, window: Window, pendingSince: Date | null) {
  const rows = await prisma.$queryRaw<{ status: string; n: number; pending: number }[]>`
    SELECT r.status::text AS status,
           count(*)::int AS n,
           count(*) FILTER (WHERE ${pendingSince !== null}::boolean AND r.status::text = 'PROPOSED'
                              AND r."createdAt" > ${at(pendingSince ?? new Date(0))})::int AS pending
    FROM recommendations r
    JOIN prescriptions p ON p.id = r."prescriptionId"
    WHERE r."pharmacyId" = ${pharmacyId}
      AND ${demoOk("r")}
      AND r.origin::text IN ('AI', 'RULE')
      AND p."deletedAt" IS NULL
      AND r."createdAt" >= ${at(window.start)} AND r."createdAt" < ${at(window.end)}
    GROUP BY r.status`;
  const count = (...statuses: string[]) => rows.filter((row) => statuses.includes(row.status)).reduce((sum, row) => sum + row.n, 0);
  const pending = rows.reduce((sum, row) => sum + row.pending, 0);
  const total = rows.reduce((sum, row) => sum + row.n, 0);
  return {
    proposed: total,
    pending,
    accepted: count(...ACCEPTED_STATUSES),
    purchased: count("PURCHASED"),
    declined: count("DECLINED"),
    removed: count("REMOVED"),
    acceptedNotConfirmed: count("ACCEPTED", "MODIFIED", "REPLACED", "PRESENTED"),
    unanswered: count("IGNORED", "PROPOSED") - pending,
  };
}

/** Ce que le calcul écarte : ajouts manuels, conseils d'ordonnances supprimées (période courante). */
async function excludedAdvice(pharmacyId: string, window: Window) {
  const [row] = await prisma.$queryRaw<{ manual: number; deleted: number }[]>`
    SELECT count(*) FILTER (WHERE r.origin::text = 'MANUAL')::int AS manual,
           count(*) FILTER (WHERE r.origin::text <> 'MANUAL' AND p."deletedAt" IS NOT NULL)::int AS deleted
    FROM recommendations r
    JOIN prescriptions p ON p.id = r."prescriptionId"
    WHERE r."pharmacyId" = ${pharmacyId}
      AND ${demoOk("r")}
      AND r."createdAt" >= ${at(window.start)} AND r."createdAt" < ${at(window.end)}`;
  return row;
}

/** Les ventes confirmées d'une fenêtre (date de VENTE) : lignes d'un conseil PharmaBoost de la même officine. */
async function confirmedSales(pharmacyId: string, window: Window) {
  const [row] = await prisma.$queryRaw<
    { priced: number; unpriced: number; revenue: number; sales: number; units: number; ht: number }[]
  >`
    SELECT count(*) FILTER (WHERE sl."unitPriceCents" > 0)::int AS priced,
           count(*) FILTER (WHERE sl."unitPriceCents" <= 0)::int AS unpriced,
           coalesce(sum(sl."totalCents") FILTER (WHERE sl."unitPriceCents" > 0), 0)::float8 AS revenue,
           count(DISTINCT s.id) FILTER (WHERE sl."unitPriceCents" > 0)::int AS sales,
           coalesce(sum(sl.quantity), 0)::int AS units,
           coalesce(sum(sl."totalCents" * 100.0 / (100 + sl."vatRate")) FILTER (WHERE sl."unitPriceCents" > 0), 0)::float8 AS ht
    FROM sales s
    JOIN sale_lines sl ON sl."saleId" = s.id
    JOIN recommendations r ON r.id = sl."recommendationId" AND r."pharmacyId" = s."pharmacyId"
    JOIN prescriptions p ON p.id = r."prescriptionId"
    WHERE s."pharmacyId" = ${pharmacyId}
      AND ${demoOk("s")} AND ${demoOk("r")}
      AND r.origin::text IN ('AI', 'RULE')
      AND p."deletedAt" IS NULL
      AND s."createdAt" >= ${at(window.start)} AND s."createdAt" < ${at(window.end)}`;
  return row;
}

async function adviceOverWindow(pharmacyId: string, window: Window): Promise<number> {
  const [row] = await prisma.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n
    FROM recommendations r
    JOIN prescriptions p ON p.id = r."prescriptionId"
    WHERE r."pharmacyId" = ${pharmacyId}
      AND ${demoOk("r")}
      AND r.origin::text IN ('AI', 'RULE')
      AND p."deletedAt" IS NULL
      AND r."createdAt" >= ${at(window.start)} AND r."createdAt" < ${at(window.end)}`;
  return row.n;
}

async function subscriptionOf(pharmacyId: string) {
  const rows = await prisma.$queryRaw<{ status: string; price: number | null }[]>`
    SELECT s.status::text AS status, s."contractPriceCents" AS price
    FROM subscriptions s
    JOIN pharmacies ph ON ph."organizationId" = s."organizationId"
    WHERE ph.id = ${pharmacyId}
    LIMIT 1`;
  return rows[0] ?? null;
}

/** Les statuts d'abonnement dont le prix sert de référence au retour sur abonnement. */
const ROI_STATUSES = ["ACTIVE", "TRIALING", "PAST_DUE"];

const ratioOrNull = (numerator: number, denominator: number) => (denominator > 0 ? Math.round((numerator / denominator) * 1000) / 1000 : null);
const roundedRate = (value: number | null) => (value === null ? null : Math.round(value * 1000) / 1000);

// ---------------------------------------------------------------- Programme

async function main() {
  const query = process.argv[2];
  if (!query || query.startsWith("--")) {
    console.error("Usage : performance-recoupement.ts <identifiant ou nom d'officine> [--periode 7j|aujourdhui|mois|perso] [--du aaaa-mm-jj --au aaaa-mm-jj]");
    process.exitCode = 2;
    return;
  }

  const candidates = await prisma.pharmacy.findMany({
    where: { OR: [{ id: query }, { name: { contains: query, mode: "insensitive" } }] },
    select: { id: true, name: true, isDemo: true },
    take: 6,
  });
  if (candidates.length !== 1) {
    console.error(candidates.length === 0 ? `Aucune officine ne correspond à « ${query} ».` : `Plusieurs officines correspondent : ${candidates.map((c) => `${c.name} (${c.id})`).join(", ")}`);
    process.exitCode = 2;
    return;
  }
  const pharmacy = candidates[0];

  const now = new Date();
  const period = parsePeriodParams({ periode: arg("periode"), du: arg("du"), au: arg("au") }, now, TIME_ZONE);
  const current: Window = { start: period.start, end: period.end };
  const previous: Window = { start: period.previousStart, end: period.previousEnd };
  const month = monthBoundsFor(now, TIME_ZONE);
  const pendingSince = new Date(now.getTime() - PENDING_GRACE_HOURS * 3_600_000);

  console.log(`Officine : ${pharmacy.name} (${pharmacy.id})${pharmacy.isDemo ? " — officine de démonstration" : ""}`);
  console.log(`Période  : ${period.label} — du ${period.start.toISOString()} au ${period.end.toISOString()} (exclu)`);
  console.log(`Comparée : du ${period.previousStart.toISOString()} au ${period.previousEnd.toISOString()} (exclu)`);
  console.log(`Maintenant : ${now.toISOString()} · fuseau ${TIME_ZONE} · démonstration ${isDemoMode() ? "incluse (environnement démo)" : "exclue"}`);

  const [report, roi] = await Promise.all([
    loadPerformanceReport({ pharmacyId: pharmacy.id, period, now }),
    loadSubscriptionReturn({ pharmacyId: pharmacy.id, now }),
  ]);
  const [cur, before1, excluded, sales, salesBefore, rhythmCount, monthSales, subscription] = await Promise.all([
    adviceByStatus(pharmacy.id, current, pendingSince),
    adviceByStatus(pharmacy.id, previous, null),
    excludedAdvice(pharmacy.id, current),
    confirmedSales(pharmacy.id, current),
    confirmedSales(pharmacy.id, previous),
    adviceOverWindow(pharmacy.id, { start: new Date(now.getTime() - RHYTHM_WINDOW_DAYS * 86_400_000), end: now }),
    confirmedSales(pharmacy.id, month),
    subscriptionOf(pharmacy.id),
  ]);
  const f = report.funnel;
  const r = report.revenue;

  section("Conseils (date de proposition)", [
    { label: "Proposés", service: f.proposed.value, sql: cur.proposed },
    { label: "En attente (moins de 24 h)", service: f.pending, sql: cur.pending },
    { label: "Acceptés (retenus par l'équipe)", service: f.accepted.value, sql: cur.accepted },
    { label: "Achetés (statut PURCHASED)", service: f.purchased.value, sql: cur.purchased },
    { label: "Acceptés non confirmés", service: f.acceptedNotConfirmed, sql: cur.acceptedNotConfirmed },
    { label: "Refusés par le patient", service: f.declinedByPatient, sql: cur.declined },
    { label: "Retirés par l'équipe", service: f.removedByTeam, sql: cur.removed },
    { label: "Sans réponse", service: f.unanswered, sql: cur.unanswered },
    { label: "Taux d'acceptation", service: roundedRate(f.acceptanceRate.value), sql: ratioOrNull(cur.accepted, cur.proposed - cur.pending) },
    { label: "Taux de transformation", service: roundedRate(f.conversionRate.value), sql: ratioOrNull(cur.purchased, cur.accepted) },
    { label: "Proposés, période précédente", service: f.proposed.previous, sql: before1.proposed },
    { label: "Acceptés, période précédente", service: f.accepted.previous, sql: before1.accepted },
    { label: "Achetés, période précédente", service: f.purchased.previous, sql: before1.purchased },
  ]);

  section("Chiffre d'affaires attribué (date de vente)", [
    { label: "CA TTC, prix connus", service: r.confirmedTtcCents.value, sql: sales.revenue, money: true },
    { label: "Ventes (tickets au prix connu)", service: r.confirmedSales.value, sql: sales.sales },
    { label: "Lignes au prix connu", service: r.pricedLines, sql: sales.priced },
    { label: "Lignes sans prix (hors CA)", service: r.unpricedLines, sql: sales.unpriced },
    { label: "Unités vendues", service: r.unitsSold, sql: sales.units },
    { label: "Panier moyen", service: r.averageBasketCents, sql: sales.sales > 0 ? Math.round(sales.revenue / sales.sales) : null, money: true },
    { label: "CA TTC, période précédente", service: r.confirmedTtcCents.previous, sql: salesBefore.revenue, money: true },
    { label: "Ventes, période précédente", service: r.confirmedSales.previous, sql: salesBefore.sales },
  ]);

  section("Ce que le calcul écarte, et cohérence interne du rapport", [
    { label: "Ajouts manuels écartés", service: report.quality.manualExcluded, sql: excluded.manual },
    { label: "Conseils d'ordonnance supprimée", service: report.quality.deletedPrescriptionAdvice, sql: excluded.deleted },
    { label: "Lignes de vente sans prix", service: report.quality.unpricedConfirmedLines, sql: sales.unpriced },
    { label: "Rythme : conseils sur 90 jours", service: report.rhythm.cells.reduce((sum, cell) => sum + cell.proposed, 0), sql: rhythmCount },
    { label: "Courbe : somme des proposés", service: report.series.current.reduce((sum, b) => sum + b.proposed, 0), sql: cur.proposed },
    { label: "Courbe : somme du CA", service: report.series.current.reduce((sum, b) => sum + b.revenueTtcCents, 0), sql: sales.revenue, money: true },
    { label: "Univers : somme des proposés", service: report.universes.reduce((sum, u) => sum + u.proposed, 0), sql: cur.proposed },
    { label: "Univers : somme du CA", service: report.universes.reduce((sum, u) => sum + u.revenueTtcCents, 0), sql: sales.revenue, money: true },
  ]);

  const price = subscription && ROI_STATUSES.includes(subscription.status) && (subscription.price ?? 0) > 0 ? subscription.price : null;
  const shown = roi.status === "shown";
  section(`Retour sur abonnement (mois civil : ${month.label})`, [
    { label: "Statut", service: roi.status === "shown" ? "affiché" : `masqué (${roi.reason})`, sql: expectedRoiStatus(subscription, price, monthSales) },
    { label: "Prix mensuel HT du contrat", service: shown ? roi.monthlyPriceHtCents : null, sql: shown ? price : null, money: true },
    { label: "CA TTC du mois", service: shown ? roi.confirmedTtcCents : null, sql: shown ? monthSales.revenue : null, money: true },
    { label: "CA HT du mois (TVA par ligne)", service: shown ? roi.confirmedHtCents : null, sql: shown ? Math.round(monthSales.ht) : null, money: true },
    { label: "Lignes au prix connu", service: shown ? roi.confirmedLines : null, sql: shown ? monthSales.priced : null },
    { label: "Ratio", service: shown ? Math.round(roi.ratio * 100) / 100 : null, sql: shown && price ? Math.round((monthSales.ht / price) * 100) / 100 : null },
  ]);
  console.log(roi.status === "shown" ? `\n  « ${roi.sentence} »` : `\n  ${roi.detail}`);

  console.log(mismatches === 0 ? "\nTout concorde." : `\n${mismatches} écart(s) : à comprendre avant de croire un chiffre.`);
  if (mismatches > 0) process.exitCode = 1;
}

/** Le statut que les règles écrites donnent, recalculé ici sans passer par `computeSubscriptionReturn`. */
function expectedRoiStatus(subscription: { status: string } | null, price: number | null, month: { priced: number; unpriced: number }): string {
  if (!subscription || !ROI_STATUSES.includes(subscription.status)) return "masqué (no_subscription)";
  if (price === null) return "masqué (no_price)";
  const total = month.priced + month.unpriced;
  if (total === 0) return "masqué (no_data)";
  if (month.priced < 5) return "masqué (not_enough_sales)";
  if (month.priced / total < 0.9) return "masqué (prices_unreliable)";
  return "affiché";
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
