import { ADVICE_FAMILIES, type AdviceFamily } from "./family";

/**
 * La sélection équilibrée des conseils d'une ordonnance.
 *
 * Quand une ordonnance appelle plus de conseils que le plafond n'en permet, la
 * simple troncature garde les mieux classés — et ils sont parfois tous de la
 * même famille (dix produits de parapharmacie, un complément alimentaire de
 * priorité plus faible, perdu). Un conseil complet pense à tout : chaque famille
 * présente dans la liste mérite une place, pour son meilleur conseil.
 *
 * Fonction PURE, sans accès au catalogue ni aux règles : elle reçoit une liste
 * déjà classée (priorité clinique, puis score) et décrit chaque élément par
 * trois faits. Elle ne reclasse rien, n'invente rien, ne réintroduit rien : tout
 * ce qu'elle garde figurait déjà dans la liste reçue, donc avait déjà passé la
 * sécurité, les seuils de pertinence et le stock.
 */

/** Ce que la sélection doit savoir d'un élément — jamais son score. */
export type PortfolioProfile = {
  /** La famille du produit proposé (`adviceFamilyOf`). */
  family: AdviceFamily;
  /** Un conseil de sécurité : jamais déplacé, jamais retiré au profit d'un autre. */
  safety: boolean;
  /** La routine dont l'élément est une étape ; `null` pour un conseil seul. */
  routineKey: string | null;
};

export type FamilyReservation<T> = {
  /** La famille qui n'avait aucun conseil parmi les premiers. */
  family: AdviceFamily;
  /** Ce qui a été gardé pour elle (toutes les étapes, quand c'est une routine). */
  kept: T[];
  /** Ce qu'il a remplacé parmi les premiers. */
  displaced: T[];
};

export type BalancedSelection<T> = {
  /** Les éléments retenus, dans l'ordre reçu (celui de la priorité clinique). */
  limited: T[];
  /** Les créneaux réservés : vide quand rien n'a dû être déplacé. */
  reservations: FamilyReservation<T>[];
};

/**
 * Un conseil au sens du plafond : un élément seul, ou toutes les étapes d'une
 * même routine. Une routine compte pour UN conseil, et ne se coupe jamais.
 */
type Unit = { indexes: number[]; families: Set<AdviceFamily>; safety: boolean };

function unitsOf<T>(sorted: readonly T[], profileOf: (item: T) => PortfolioProfile): Unit[] {
  const units: Unit[] = [];
  const routines = new Map<string, Unit>();
  sorted.forEach((item, index) => {
    const profile = profileOf(item);
    let unit = profile.routineKey ? routines.get(profile.routineKey) : undefined;
    if (!unit) {
      unit = { indexes: [], families: new Set(), safety: false };
      units.push(unit); // la place d'une routine est celle de sa première étape
      if (profile.routineKey) routines.set(profile.routineKey, unit);
    }
    unit.indexes.push(index);
    unit.families.add(profile.family);
    unit.safety = unit.safety || profile.safety;
  });
  return units;
}

/**
 * Tronque `sorted` à `limit` conseils en gardant une place à chaque famille.
 *
 * 1. Les `limit` premiers conseils sont retenus, comme sans équilibrage.
 * 2. Pour chaque famille présente dans la liste complète mais absente de ces
 *    `limit` premiers, son meilleur conseil (le premier dans l'ordre reçu)
 *    remplace le DERNIER conseil retenu qui peut l'être : ni un conseil de
 *    sécurité, ni le seul de sa famille, et une routine ne se déplace qu'entière.
 *    Si aucun conseil ne peut l'être, la famille reste absente : rien n'est
 *    retiré de force.
 * 3. L'ordre final est celui de la liste reçue : la priorité clinique.
 *
 * Quand la liste ne dépasse pas `limit`, la sortie est la liste reçue, telle quelle.
 */
export function reserveFamilies<T>(sorted: readonly T[], limit: number, profileOf: (item: T) => PortfolioProfile): BalancedSelection<T> {
  const units = unitsOf(sorted, profileOf);
  const size = Math.max(0, Math.floor(limit));
  if (units.length <= size) return { limited: [...sorted], reservations: [] };

  const kept = units.slice(0, size);
  const rest = units.slice(size);

  // Combien de conseils retenus portent chaque famille : c'est ce qui dit si l'un d'eux est « le seul de sa famille ».
  const counts = new Map<AdviceFamily, number>();
  const count = (unit: Unit, delta: number) => {
    for (const family of unit.families) counts.set(family, (counts.get(family) ?? 0) + delta);
  };
  for (const unit of kept) count(unit, 1);
  const present = (family: AdviceFamily) => (counts.get(family) ?? 0) > 0;

  // Les familles manquantes, la mieux classée d'abord : si les places à céder
  // manquent, c'est le conseil le plus prioritaire qui est servi en premier.
  const missing = ADVICE_FAMILIES.flatMap((family) => {
    const best = rest.find((unit) => unit.families.has(family));
    return !present(family) && best ? [{ family, rank: rest.indexOf(best) }] : [];
  })
    .sort((a, b) => a.rank - b.rank)
    .map((entry) => entry.family);

  const reservations: { family: AdviceFamily; unit: Unit; displaced: Unit }[] = [];
  for (const family of missing) {
    if (present(family)) continue; // déjà servie par la routine gardée pour une autre famille
    const candidate = rest.find((unit) => unit.families.has(family) && !reservations.some((r) => r.unit === unit));
    if (!candidate) continue;
    // Du dernier au premier : on cède d'abord le conseil le moins prioritaire.
    const displaced = [...kept].reverse().find((unit) => !unit.safety && [...unit.families].every((f) => (counts.get(f) ?? 0) >= 2));
    if (!displaced) continue;
    kept.splice(kept.indexOf(displaced), 1);
    count(displaced, -1);
    kept.push(candidate);
    count(candidate, 1);
    reservations.push({ family, unit: candidate, displaced });
  }

  const retained = new Set(kept.flatMap((unit) => unit.indexes));
  return {
    limited: sorted.filter((_, index) => retained.has(index)),
    reservations: reservations.map(({ family, unit, displaced }) => ({
      family,
      kept: unit.indexes.map((index) => sorted[index]),
      displaced: displaced.indexes.map((index) => sorted[index]),
    })),
  };
}
