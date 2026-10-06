import { PRODUCT_CATEGORY_LABELS } from "@/config/catalog";
import { MIN_DECIDED_FOR_RATE } from "./definitions";
import { isAcceptedStatus, isPendingAdvice } from "./funnel";
import type { AdviceRow, ConfirmedLineRow, ProductRow, UniverseRow } from "./types";

/**
 * « Ce qui marche » : les produits et les univers (catégories) qui reviennent
 * le plus dans les conseils et dans les ventes confirmées.
 *
 * Les conseils et les lignes arrivent DÉJÀ filtrés (`selectCountedAdvice`,
 * `selectCountedLines`). Deux horloges, comme partout dans le suivi :
 *  - proposés / acceptés / achetés : date de PROPOSITION du conseil (statut
 *    PURCHASED = le conseil a donné lieu à une vente) ;
 *  - unités et chiffre d'affaires : date de la VENTE, chiffre d'affaires sur les
 *    lignes au prix connu seulement.
 * Un produit vendu cette semaine pour un conseil proposé la semaine dernière
 * apparaît donc avec du chiffre d'affaires et sans conseil proposé : c'est exact.
 *
 * `now` est facultatif : donné, les conseils PROPOSED de moins de 24 h sont « en
 * attente » et sortent du dénominateur du taux (comme dans l'entonnoir) ; omis,
 * rien n'est en attente (période entièrement passée).
 */

const DEFAULT_PRODUCT_LIMIT = 8;
const REMOVED_KEY = "x:removed";
const REMOVED_LABEL = "Produit retiré du catalogue";
const MEDICINE_CATEGORY = "MEDICAMENT";
const MEDICINE_LABEL = "Médicaments conseil";
const OTHER_CATEGORY = "AUTRE";

type Tally = {
  label: string;
  /** Instant de la ligne qui a donné `label` : on garde le nom le plus récent. */
  labelAt: number;
  category: string;
  proposed: number;
  decided: number;
  accepted: number;
  purchased: number;
  unitsSold: number;
  revenueTtcCents: number;
};

/** Un code de catégorie connu, « MEDICAMENT », ou « AUTRE » : l'interface ne voit jamais un code brut inconnu. */
function normalizeCategory(category: string): string {
  if (category === MEDICINE_CATEGORY) return MEDICINE_CATEGORY;
  return Object.prototype.hasOwnProperty.call(PRODUCT_CATEGORY_LABELS, category) ? category : OTHER_CATEGORY;
}

/** `p:<produit>` pour un produit de l'officine, `m:<présentation>` pour un médicament conseil, une seule clé pour les produits retirés. */
function productKey(row: { productId: string | null; presentationId: string | null }): string {
  if (row.productId) return `p:${row.productId}`;
  if (row.presentationId) return `m:${row.presentationId}`;
  return REMOVED_KEY;
}

function emptyTally(): Tally {
  return { label: "", labelAt: Number.NEGATIVE_INFINITY, category: OTHER_CATEGORY, proposed: 0, decided: 0, accepted: 0, purchased: 0, unitsSold: 0, revenueTtcCents: 0 };
}

function tallyBy(input: {
  advice: AdviceRow[];
  lines: ConfirmedLineRow[];
  now: Date | null;
  keyOf: (row: { productId: string | null; presentationId: string | null; category: string }) => string;
}): Map<string, Tally> {
  const map = new Map<string, Tally>();
  const get = (key: string): Tally => {
    let tally = map.get(key);
    if (!tally) {
      tally = emptyTally();
      map.set(key, tally);
    }
    return tally;
  };
  const remember = (tally: Tally, label: string, category: string, at: number) => {
    if (at > tally.labelAt) {
      tally.label = label;
      tally.category = normalizeCategory(category);
      tally.labelAt = at;
    }
  };

  for (const row of input.advice) {
    const tally = get(input.keyOf(row));
    tally.proposed += 1;
    if (isAcceptedStatus(row.status)) tally.accepted += 1;
    if (row.status === "PURCHASED") tally.purchased += 1;
    if (input.now === null || !isPendingAdvice(row, input.now)) tally.decided += 1;
    remember(tally, row.label, row.category, row.createdAt.getTime());
  }

  for (const line of input.lines) {
    const tally = get(input.keyOf(line));
    tally.unitsSold += line.quantity;
    // Une ligne sans prix compte comme vente, jamais comme chiffre d'affaires.
    if (line.unitPriceCents > 0) tally.revenueTtcCents += line.totalCents;
    remember(tally, line.label, line.category, line.saleCreatedAt.getTime());
  }

  return map;
}

/** Un taux sur 1 ou 2 conseils tranchés ne veut rien dire : pas de taux sous le seuil des définitions. */
function acceptanceRate(accepted: number, decided: number): number | null {
  return decided >= MIN_DECIDED_FOR_RATE ? accepted / decided : null;
}

/** CA décroissant, puis acceptés, puis proposés ; le nom puis la clé départagent pour un ordre stable. */
function compareRows(
  a: { revenueTtcCents: number; accepted: number; proposed: number; label: string; key: string },
  b: { revenueTtcCents: number; accepted: number; proposed: number; label: string; key: string },
): number {
  return (
    b.revenueTtcCents - a.revenueTtcCents ||
    b.accepted - a.accepted ||
    b.proposed - a.proposed ||
    a.label.localeCompare(b.label, "fr") ||
    (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
  );
}

export function buildProducts(input: { advice: AdviceRow[]; lines: ConfirmedLineRow[]; limit?: number; now?: Date }): ProductRow[] {
  const limit =
    input.limit === undefined || Number.isNaN(input.limit) ? DEFAULT_PRODUCT_LIMIT : Math.max(0, Math.floor(input.limit));

  const tallies = tallyBy({ advice: input.advice, lines: input.lines, now: input.now ?? null, keyOf: productKey });

  const rows: ProductRow[] = [];
  for (const [key, tally] of tallies) {
    const removed = key === REMOVED_KEY;
    rows.push({
      key,
      label: removed ? REMOVED_LABEL : tally.label,
      category: removed ? OTHER_CATEGORY : tally.category,
      proposed: tally.proposed,
      accepted: tally.accepted,
      purchased: tally.purchased,
      unitsSold: tally.unitsSold,
      revenueTtcCents: tally.revenueTtcCents,
      acceptanceRate: acceptanceRate(tally.accepted, tally.decided),
    });
  }

  return rows.sort(compareRows).slice(0, limit);
}

export function buildUniverses(input: { advice: AdviceRow[]; lines: ConfirmedLineRow[]; now?: Date }): UniverseRow[] {
  const tallies = tallyBy({
    advice: input.advice,
    lines: input.lines,
    now: input.now ?? null,
    keyOf: (row) => normalizeCategory(row.category),
  });

  const rows: UniverseRow[] = [];
  for (const [category, tally] of tallies) {
    rows.push({
      category,
      label: category === MEDICINE_CATEGORY ? MEDICINE_LABEL : PRODUCT_CATEGORY_LABELS[category as keyof typeof PRODUCT_CATEGORY_LABELS],
      proposed: tally.proposed,
      accepted: tally.accepted,
      purchased: tally.purchased,
      revenueTtcCents: tally.revenueTtcCents,
      acceptanceRate: acceptanceRate(tally.accepted, tally.decided),
    });
  }

  return rows.sort((a, b) => compareRows({ ...a, key: a.category }, { ...b, key: b.category }));
}
