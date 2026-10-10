import "server-only";
import { prisma } from "@/server/db/client";
import type { GapKind, GapReason } from "@/core/knowledge/gaps";

/**
 * Le carnet de ce que PharmaBoost ne sait pas encore ranger (voir core/knowledge/gaps.ts). Une ligne par produit ou médicament, quel que
 * soit le nombre de pharmacies qui l'ont en stock : la pharmacienne répond une fois. Invisible du titulaire.
 */

export type GapInput = { kind: GapKind; key: string; label: string; reason: GapReason; guess?: unknown; pharmacyId: string | null };

const MAX_PHARMACIES_KEPT = 30;

/** Note ce que le moteur n'a pas su ranger. Ne rouvre jamais un sujet déjà tranché (répondu ou écarté). Renvoie le nombre de sujets ouverts touchés. */
export async function recordGaps(items: GapInput[]): Promise<number> {
  const wanted = items.filter((item) => item.key.trim().length > 0);
  if (wanted.length === 0) return 0;
  const existing = await prisma.knowledgeGap.findMany({
    where: { OR: [...new Set(wanted.map((item) => `${item.kind}|${item.key}`))].map((composite) => { const [kind, ...rest] = composite.split("|"); return { kind, key: rest.join("|") }; }) },
    select: { id: true, kind: true, key: true, status: true, pharmacyIds: true, occurrences: true },
  });
  const byKey = new Map(existing.map((row) => [`${row.kind}|${row.key}`, row]));
  let touched = 0;
  for (const item of wanted) {
    const composite = `${item.kind}|${item.key}`;
    const row = byKey.get(composite);
    if (!row) {
      const created = await prisma.knowledgeGap.create({
        data: { kind: item.kind, key: item.key.slice(0, 200), label: item.label.slice(0, 200), reason: item.reason, guess: (item.guess ?? undefined) as never, pharmacyIds: item.pharmacyId ? [item.pharmacyId] : [] },
        select: { id: true, kind: true, key: true, status: true, pharmacyIds: true, occurrences: true },
      }).catch(() => null);
      if (created) { byKey.set(composite, created); touched += 1; }
      continue;
    }
    if (row.status !== "OPEN") continue;
    if (item.pharmacyId && !row.pharmacyIds.includes(item.pharmacyId)) {
      const pharmacyIds = [...row.pharmacyIds, item.pharmacyId].slice(0, MAX_PHARMACIES_KEPT);
      await prisma.knowledgeGap.update({ where: { id: row.id }, data: { pharmacyIds, occurrences: { increment: 1 }, reason: item.reason, ...(item.guess !== undefined ? { guess: item.guess as never } : {}) } });
      row.pharmacyIds = pharmacyIds;
      touched += 1;
    }
  }
  return touched;
}

export async function countOpenGaps(): Promise<number> {
  return prisma.knowledgeGap.count({ where: { status: "OPEN" } });
}
