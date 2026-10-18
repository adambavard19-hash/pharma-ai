import "server-only";
import { createHash } from "node:crypto";
import { after } from "next/server";
import { prisma } from "@/server/db/client";
import { getEnv } from "@/config/env";
import { getAIProvider } from "@/server/ai/registry";
import type { CounterPitchRequest, PitchAnswer, PitchCandidate } from "@/core/ai/counter-pitch";
import { unitMarginHt } from "@/core/catalog/margin";
import { availabilityOf } from "@/core/counter/notice";
import type { CounterSheetAnswer } from "../../../agent/src/counter-sheet";
import { AnthropicCounterPitchWriter } from "@/core/ai/providers/anthropic-counter-pitch";

/**
 * Le conseil prêt à dire au comptoir (18 oct. 2026) : deux questions et le conseil en deux phrases, pour chaque conseil de la bannière.
 * Une fois rédigé (par le modèle, ou corrigé par la pharmacienne), il est gardé et vaut pour toutes les pharmacies. Au comptoir, rien
 * n'attend le modèle : ce qui manque est rédigé en arrière-plan et paraît au tour suivant de la bannière (deux secondes plus tard).
 */

export type PitchTarget = {
  ruleKey: string;
  productEan: string | null;
  productName: string;
  request: CounterPitchRequest;
  /** Les autres produits en stock du même rayon, lus seulement quand il faut rédiger (jamais à chaque relecture de la bannière). */
  loadCandidates?: () => Promise<PitchCandidate[]>;
};

export type StoredPitch = { ask: string[]; pitch: string; answers: PitchAnswer[] };

const SELECT = { ask: true, pitch: true, answers: true } as const;

/** Les réponses gardées, relues : une ligne d'une autre forme est écartée, jamais montrée de travers. */
function stored(row: { ask: string[]; pitch: string; answers: unknown }): StoredPitch {
  const answers = (Array.isArray(row.answers) ? row.answers : []).filter(
    (a): a is PitchAnswer => typeof a === "object" && a !== null && (a.ask === 0 || a.ask === 1) && typeof a.label === "string" && typeof a.say === "string" && (a.ean === null || typeof a.ean === "string"),
  );
  return { ask: row.ask, pitch: row.pitch, answers };
}

const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function pitchKey(target: Pick<PitchTarget, "ruleKey" | "productEan" | "productName">): string {
  const product = target.productEan?.replace(/\D/g, "") || fold(target.productName);
  return createHash("sha256").update(`v2|${target.ruleKey}|${product}`).digest("hex");
}

function getWriter(): AnthropicCounterPitchWriter | null {
  const ai = getAIProvider();
  if (ai.info.capability !== "LIVE" || !ai.info.id.startsWith("anthropic:")) return null;
  const apiKey = getEnv().ANTHROPIC_API_KEY;
  return apiKey ? new AnthropicCounterPitchWriter({ apiKey, model: ai.info.id.slice("anthropic:".length) }) : null;
}

const inflight = new Set<string>();

/** Rédige (et garde) le conseil prêt à dire d'un conseil, s'il manque. Ne lève jamais. */
export async function ensurePitch(target: PitchTarget): Promise<StoredPitch | null> {
  const key = pitchKey(target);
  const existing = await prisma.counterPitch.findUnique({ where: { key }, select: SELECT }).catch(() => null);
  if (existing) return stored(existing);
  const writer = getWriter();
  if (!writer || inflight.has(key)) return null;
  inflight.add(key);
  try {
    const candidates = target.request.candidates ?? (await target.loadCandidates?.().catch(() => [])) ?? [];
    const result = await writer.write({ ...target.request, candidates });
    if (!result.pitch) {
      console.warn(`[conseil comptoir] refusé pour « ${target.productName} » : ${result.problems.join(", ")}`);
      return null;
    }
    const saved = await prisma.counterPitch.upsert({ where: { key }, create: { key, ruleKey: target.ruleKey, productLabel: target.productName.slice(0, 200), ask: result.pitch.ask, pitch: result.pitch.pitch, answers: result.pitch.answers as never }, update: {}, select: SELECT });
    return stored(saved);
  } catch (error) {
    console.warn(`[conseil comptoir] impossible pour « ${target.productName} » : ${error instanceof Error ? error.message : String(error)}`);
    return null;
  } finally {
    inflight.delete(key);
  }
}

/** Les conseils prêts à dire déjà gardés ; ceux qui manquent sont rédigés en arrière-plan (jamais pour la démonstration). */
export async function pitchesFor(targets: PitchTarget[], options: { demo?: boolean } = {}): Promise<Map<string, StoredPitch>> {
  const found = new Map<string, StoredPitch>();
  if (targets.length === 0) return found;
  const keys = targets.map(pitchKey);
  const rows = await prisma.counterPitch.findMany({ where: { key: { in: keys } }, select: { key: true, ...SELECT } }).catch(() => []);
  for (const row of rows) found.set(row.key, stored(row));
  const missing = options.demo ? [] : targets.filter((_, index) => !found.has(keys[index]));
  if (missing.length > 0) {
    const job = Promise.all(missing.slice(0, 6).map((target) => ensurePitch(target))).then(() => undefined);
    try {
      after(() => job);
    } catch {
      void job;
    }
  }
  return found;
}

const fold2 = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/**
 * Les produits qu'une réponse peut proposer à la place : ceux de CETTE pharmacie, du même rayon, en stock, avec un prix et un code-barres
 * — d'abord la même marque et les mêmes mots-clés. Le modèle ne choisit que dans cette liste.
 */
export async function stockCandidates(pharmacyId: string, product: { id: string; category: string; brand: string | null; matchingTags: string[] }): Promise<PitchCandidate[]> {
  const rows = await prisma.product.findMany({
    where: { pharmacyId, category: product.category as never, isActive: true, deletedAt: null, id: { not: product.id }, ean: { not: null }, salePriceCents: { gt: 0 }, stockItem: { quantity: { gt: 0 } } },
    select: { ean: true, name: true, brand: true, matchingTags: true },
    take: 400,
  });
  const tags = new Set(product.matchingTags);
  const brand = product.brand ? fold2(product.brand) : null;
  return rows
    .map((row) => ({ row, score: (brand && row.brand && fold2(row.brand) === brand ? 3 : 0) + row.matchingTags.filter((tag) => tags.has(tag)).length }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map(({ row }) => ({ ean: row.ean as string, name: row.name }));
}

const euros = (cents: number) => `${(cents / 100).toFixed(2).replace(".", ",")} €`;

/**
 * Les réponses telles que la bannière les montre : le produit proposé relu dans le stock de CETTE pharmacie (nom, prix, marge, stock
 * du jour). Absent de son stock : la réponse garde sa phrase, sans produit. Un prix ne s'affiche qu'avec un stock fiable.
 */
export async function answersForSheet(pharmacyId: string, answers: PitchAnswer[], reliable: boolean, eansCache?: Map<string, CounterSheetAnswer["product"] | null>): Promise<CounterSheetAnswer[]> {
  const cache = eansCache ?? new Map<string, CounterSheetAnswer["product"] | null>();
  const wanted = [...new Set(answers.map((a) => a.ean).filter((ean): ean is string => Boolean(ean) && !cache.has(ean as string)))];
  if (wanted.length > 0) {
    const rows = await prisma.product.findMany({
      where: { pharmacyId, ean: { in: wanted }, isActive: true, deletedAt: null },
      select: { ean: true, name: true, salePriceCents: true, purchasePriceCents: true, vatRate: true, stockItem: { select: { quantity: true, alertThreshold: true } } },
    }).catch(() => []);
    for (const ean of wanted) {
      const row = rows.find((candidate) => candidate.ean === ean);
      if (!row) {
        cache.set(ean, null);
        continue;
      }
      const stock = availabilityOf(row.stockItem?.quantity ?? null, row.stockItem?.alertThreshold ?? null, reliable);
      const margin = unitMarginHt(row);
      cache.set(ean, {
        name: row.name,
        ...(stock !== "UNKNOWN" && row.salePriceCents > 0 ? { price: euros(row.salePriceCents) } : {}),
        ...(margin && margin.marginCents > 0 ? { margin: euros(margin.marginCents) } : {}),
        stock,
        ...(stock !== "UNKNOWN" && typeof row.stockItem?.quantity === "number" && row.stockItem.quantity >= 0 ? { quantity: row.stockItem.quantity } : {}),
      });
    }
  }
  return answers.map((a) => {
    const product = a.ean ? cache.get(a.ean) : null;
    return { ask: a.ask, label: a.label, say: a.say, ...(product ? { product } : {}) };
  });
}
