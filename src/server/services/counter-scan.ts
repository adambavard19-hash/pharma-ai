import "server-only";
import { parseStoredAlternatives } from "@/core/ai/alternatives";
import { rangeKey, sameRange } from "@/core/counter/same-range";
import { prisma } from "@/server/db/client";
import { readScannedCode } from "@/core/stock";
import { createWithReference } from "@/server/services/references";
import { recordIsDemo } from "@/server/db/demo-scope";
import { recordAudit } from "@/server/audit/log";
import type { AgentContext } from "@/server/services/stock-sync";
import { findOpenFactsName } from "@/server/services/product-images";
import { pitchKey } from "@/server/services/counter-pitches";

/**
 * Un bip de douchette au comptoir, capté par l'agent du poste de caisse.
 *
 * Le code-barres devient une ligne de délivrance : la boîte est identifiée
 * par son CIP dans le catalogue national, sans lecture ni devinette. Les bips
 * d'un même poste, à moins d'une minute l'un de l'autre, forment UNE
 * délivrance — celle du patient qui est au comptoir, donc une seule
 * ordonnance : c'est sur elle, en entier, que le conseil se construit. Le
 * stock de l'officine baisse d'une boîte ; l'export du LGO remettra le compte
 * exact.
 */

/**
 * Une vente reste ouverte sur son poste jusqu'à « Vente terminée » : chaque boîte bipée ensuite s'ajoute à la même bannière,
 * même trois minutes plus tard (le patient discute, repose une boîte, en ajoute une autre). Fondateur, 14 oct. 2026.
 *
 * Sans aucune réponse Vendu / Non vendu, une minute sans bip sur ce poste termine la vente d'elle-même, et le bip suivant ouvre
 * la vente suivante ; dès qu'un conseil a reçu une réponse, la vente reste ouverte jusqu'à « Vente terminée » (fondateur,
 * 15 oct. 2026). Mesuré en pharmacie le 15 oct. 2026 : les boîtes d'un même client se suivent à moins
 * de 45 secondes, deux clients sont séparés d'une minute et demie ou plus ; à cinq minutes, une vente empilait encore 8 boîtes
 * de trois clients (trente minutes, le matin, en empilaient 22).
 *
 * La fenêtre glisse et se mesure sur l'horloge du POSTE : l'écart entre ce bip et le bip précédent du même poste
 * (`CounterPost.lastScanAt`, lu avant sa mise à jour), jamais depuis `Prescription.updatedAt`, que l'analyse fait avancer.
 */
export const SAME_SALE_WINDOW_MS = 60 * 1000;

/** Au-delà de ce nombre de boîtes, une vente n'est plus reprise par un nouveau bip : ce n'est plus un seul client. */
export const MAX_BOXES_PER_SALE = 15;

/** Une vente ouverte plus ancienne que cela (dernière écriture) n'est plus reprise, même avec des réponses. */
const OPEN_SALE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

/** Une réponse Vendu / Non vendu donnée au poste (même valeur que `COUNTER_DECLARED`, server/services/counter-window.ts). */
const COUNTER_ANSWERED = "COUNTER_DECLARED";

/** Un horodatage de bip plus ancien que cela n'est pas crédible (horloge du poste fausse) : on retient l'instant de réception. */
const MAX_SCAN_AGE_MS = 6 * 60 * 60 * 1000;

/**
 * L'instant du bip : celui que le poste a daté (`scannedAt`) s'il est crédible,
 * pour que des bips rejoués après une coupure Internet gardent l'écart réel
 * qui les sépare. Un horodatage invalide, dans le futur ou vieux de plus de
 * six heures retombe sur « maintenant » (l'instant où le serveur le reçoit).
 */
export function scanInstant(scannedAt: Date | null, now: Date): Date {
  if (!scannedAt || Number.isNaN(scannedAt.getTime())) return now;
  const age = now.getTime() - scannedAt.getTime();
  return age >= 0 && age <= MAX_SCAN_AGE_MS ? scannedAt : now;
}

export type CounterScanResult =
  | {
      ok: true;
      prescriptionId: string;
      reference: string;
      lineCount: number;
      drugName: string;
      created: boolean;
      kind: "DRUG" | "PRODUCT" | "UNKNOWN";
      /** La boîte bipée est un conseil proposé dans cette vente : il passe en « Vendu », sans nouvelle ligne ni nouvelle analyse. */
      adviceSold?: boolean;
    }
  | { ok: false; error: string; code: "UNKNOWN_CODE" };

/**
 * Ce qu'un bip désigne : une boîte de médicament (CIP, catalogue national),
 * un produit de l'officine (EAN de parapharmacie, stock de l'officine), ou
 * un code que personne ne connaît — qui reste visible au comptoir, non
 * confirmé, pour que le pharmacien voie que le bip est arrivé.
 */
type ScannedItem =
  | { kind: "DRUG"; name: string; form: string | null; specialtyId: string; presentationId: string; cip13: string }
  | { kind: "PRODUCT"; name: string; productId: string; ean: string }
  | { kind: "UNKNOWN"; name: string; code: string; hint: string | null };

const CONSEIL_STATUSES: ("PROPOSED" | "PRESENTED" | "ACCEPTED" | "MODIFIED" | "DECLINED" | "PURCHASED")[] = ["PROPOSED", "PRESENTED", "ACCEPTED", "MODIFIED", "DECLINED", "PURCHASED"];

/**
 * Le conseil de la vente ouverte que ce bip vend, s'il y en a un : le produit exact (ou le même médicament, quelle que soit sa
 * présentation), sinon un produit de la même gamme — un autre parfum, un autre format (« NEOBIANACID MENTHE CROQ70 » pour le
 * conseil « NEOBIANACID CITRON CPR 70 », essai de Donna du 16 oct. 2026). Un conseil encore sans réponse passe avant un
 * conseil déjà vendu (qui absorbe alors une deuxième boîte).
 */
async function conseilForScan(pharmacyId: string, prescriptionId: string, item: Exclude<ScannedItem, { kind: "UNKNOWN" }>): Promise<{ id: string; status: string; replaces?: { productId: string; previousProductId: string | null; priceCents: number } } | null> {
  const exact = await prisma.recommendation.findFirst({
    where: {
      prescriptionId,
      pharmacyId,
      status: { in: CONSEIL_STATUSES },
      OR: item.kind === "PRODUCT" ? [{ productId: item.productId }] : [{ presentationId: item.presentationId }, { presentation: { specialtyId: item.specialtyId } }],
    },
    orderBy: [{ decidedAt: { sort: "asc", nulls: "first" } }, { totalScore: "desc" }],
    select: { id: true, status: true },
  });
  if (exact || item.kind !== "PRODUCT") return exact;
  const answered = await answerConseilForScan(pharmacyId, prescriptionId, item);
  if (answered) return answered;
  // Une des autres possibilités en stock de la bannière (le patient ne voulait pas du produit conseillé, 19 oct. 2026) : elle
  // remplace le produit du conseil, qui passe en « Vendu » à son prix.
  const withAlternatives = await prisma.recommendation.findMany({
    where: { prescriptionId, pharmacyId, status: { in: CONSEIL_STATUSES.filter((status) => status !== "PURCHASED") }, productId: { not: null } },
    orderBy: [{ decidedAt: { sort: "asc", nulls: "first" } }, { totalScore: "desc" }],
    select: { id: true, status: true, productId: true, alternatives: true },
  });
  const replaced = withAlternatives.find((rec) => parseStoredAlternatives(rec.alternatives).some((alt) => alt.productId === item.productId));
  if (replaced) {
    const product = await prisma.product.findFirst({ where: { id: item.productId, pharmacyId }, select: { salePriceCents: true } });
    return { id: replaced.id, status: replaced.status, replaces: { productId: item.productId, previousProductId: replaced.productId, priceCents: product?.salePriceCents ?? 0 } };
  }
  const scanned = await prisma.product.findFirst({ where: { id: item.productId, pharmacyId }, select: { name: true, brand: true } });
  if (!scanned || !rangeKey(scanned.name, scanned.brand)) return null;
  const candidates = await prisma.recommendation.findMany({
    where: { prescriptionId, pharmacyId, status: { in: CONSEIL_STATUSES }, productId: { not: null } },
    orderBy: [{ decidedAt: { sort: "asc", nulls: "first" } }, { totalScore: "desc" }],
    select: { id: true, status: true, product: { select: { name: true, brand: true } } },
  });
  const match = candidates.find((rec) => rec.product && sameRange(rec.product, scanned));
  return match ? { id: match.id, status: match.status } : null;
}

/**
 * Le produit PLUS PRÉCIS qu'une réponse du patient a fait proposer (questions cliquables de la bannière, 18 oct. 2026) : bipé, il
 * remplace le produit du conseil (comme « Remplacer » sur l'écran de la vente : le produit d'origine est gardé dans
 * `replacedProductId`) et le conseil passe en « Vendu », à son prix. Seulement pour un conseil pas encore vendu.
 */
async function answerConseilForScan(pharmacyId: string, prescriptionId: string, item: Extract<ScannedItem, { kind: "PRODUCT" }>): Promise<{ id: string; status: string; replaces: { productId: string; previousProductId: string | null; priceCents: number } } | null> {
  const recs = await prisma.recommendation.findMany({
    where: { prescriptionId, pharmacyId, status: { in: CONSEIL_STATUSES.filter((status) => status !== "PURCHASED") }, productId: { not: null }, opportunity: { ruleKey: { not: null } } },
    orderBy: [{ decidedAt: { sort: "asc", nulls: "first" } }, { totalScore: "desc" }],
    select: { id: true, status: true, productId: true, product: { select: { ean: true, name: true } }, opportunity: { select: { ruleKey: true } } },
  });
  const keyed = recs.filter((rec) => rec.product && rec.opportunity?.ruleKey).map((rec) => ({ rec, key: pitchKey({ ruleKey: rec.opportunity!.ruleKey!, productEan: rec.product!.ean, productName: rec.product!.name }) }));
  if (keyed.length === 0) return null;
  const pitches = await prisma.counterPitch.findMany({ where: { key: { in: keyed.map((entry) => entry.key) } }, select: { key: true, answers: true } }).catch(() => []);
  const proposes = new Set(pitches.filter((pitch) => Array.isArray(pitch.answers) && (pitch.answers as { ean?: unknown }[]).some((answer) => answer?.ean === item.ean)).map((pitch) => pitch.key));
  const match = keyed.find((entry) => proposes.has(entry.key));
  if (!match) return null;
  const product = await prisma.product.findFirst({ where: { id: item.productId, pharmacyId }, select: { salePriceCents: true } });
  return { id: match.rec.id, status: match.rec.status, replaces: { productId: item.productId, previousProductId: match.rec.productId, priceCents: product?.salePriceCents ?? 0 } };
}

async function resolveScannedItem(pharmacyId: string, raw: string, demo = false): Promise<ScannedItem | null> {
  const scanned = readScannedCode(raw);
  if (scanned.kind === "CIP13" || scanned.kind === "CIP7") {
    const presentation = await prisma.drugPresentation.findUnique({ where: { cip13: scanned.cip13 }, select: { id: true, cip13: true, specialty: { select: { id: true, name: true, pharmaceuticalForm: true } } } });
    if (presentation) return { kind: "DRUG", name: presentation.specialty.name, form: presentation.specialty.pharmaceuticalForm, specialtyId: presentation.specialty.id, presentationId: presentation.id, cip13: presentation.cip13 };
  }
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7) return null;
  // Un code déjà appris au comptoir, puis le code de l'export du LGO.
  const learned = await prisma.productBarcode.findUnique({ where: { pharmacyId_code: { pharmacyId, code: digits } }, select: { product: { select: { id: true, name: true, deletedAt: true } } } });
  if (learned && !learned.product.deletedAt) return { kind: "PRODUCT", name: learned.product.name, productId: learned.product.id, ean: digits };
  const product = await prisma.product.findFirst({ where: { pharmacyId, ean: digits, deletedAt: null }, select: { id: true, name: true } });
  if (product) return { kind: "PRODUCT", name: product.name, productId: product.id, ean: digits };
  // Inconnu : le nom donné par les bases ouvertes permet de retrouver la
  // référence dans le stock par ses mots, et de retenir le code si le
  // rapprochement est sans ambiguïté.
  // L'officine de démonstration n'interroge aucune base ouverte : un code inconnu reste inconnu.
  const facts = demo ? null : await findOpenFactsName(digits);
  const hint = facts ? `${facts.name}${facts.brand ? ` — ${facts.brand}` : ""}` : null;
  if (facts) {
    const match = await matchStockProductByName(pharmacyId, `${facts.brand ?? ""} ${facts.name}`);
    if (match) {
      await prisma.productBarcode.upsert({ where: { pharmacyId_code: { pharmacyId, code: digits } }, create: { pharmacyId, productId: match.id, code: digits, source: "AUTO" }, update: {} });
      return { kind: "PRODUCT", name: match.name, productId: match.id, ean: digits };
    }
  }
  return { kind: "UNKNOWN", name: hint ? `${hint} (code ${digits}, à rattacher au stock)` : `Code-barres ${digits} (produit inconnu du stock)`, code: digits, hint };
}

function nameTokens(text: string): string[] {
  return [...new Set(text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().split(/[^A-Z0-9]+/).filter((token) => token.length >= 3))];
}

/**
 * Retrouve un produit du stock d'après un nom venu d'ailleurs (« Ergyphilus
 * gst — Nutergia »). Les mots du nom sont cherchés dans les libellés du
 * stock ; on ne retient un produit que s'il est seul à réunir au moins deux
 * mots, ou seul à en réunir un quand ce mot est rare dans le stock. Au
 * moindre doute, rien : un mauvais rapprochement vaudrait moins qu'aucun.
 */
export async function matchStockProductByName(pharmacyId: string, name: string): Promise<{ id: string; name: string } | null> {
  const tokens = nameTokens(name);
  if (tokens.length === 0) return null;
  const candidates = await prisma.product.findMany({
    where: { pharmacyId, deletedAt: null, OR: tokens.map((token) => ({ name: { contains: token, mode: "insensitive" as const } })) },
    select: { id: true, name: true },
    take: 200,
  });
  if (candidates.length === 0) return null;
  const scored = candidates
    .map((product) => {
      const productTokens = nameTokens(product.name);
      const hits = tokens.filter((token) => productTokens.some((candidate) => candidate === token || (token.length >= 5 && candidate.startsWith(token.slice(0, 5)))));
      return { product, hits: hits.length };
    })
    .sort((a, b) => b.hits - a.hits);
  const [best, second] = scored;
  if (!best || best.hits === 0) return null;
  const unique = !second || second.hits < best.hits;
  if (best.hits >= 2 && unique) return best.product;
  if (best.hits === 1 && unique && candidates.length === 1) return best.product;
  return null;
}

export async function recordCounterScan(agent: AgentContext, input: { code: string; post: string; scannedAt: Date | null; expiresOn?: Date | null }): Promise<CounterScanResult> {
  const item = await resolveScannedItem(agent.scope.pharmacyId, input.code, agent.pharmacyIsDemo);
  if (!item) return { ok: false, code: "UNKNOWN_CODE", error: "Ce code ne ressemble pas à un code-barres de produit." };
  // Ce qui distingue deux bips d'un même article : le CIP, l'EAN ou le code brut.
  const itemKey = item.kind === "DRUG" ? item.specialtyId : item.kind === "PRODUCT" ? item.productId : item.code;
  const lineData = {
    drugName: item.name,
    form: item.kind === "DRUG" ? item.form : null,
    quantity: 1,
    drugSpecialtyId: item.kind === "DRUG" ? item.specialtyId : null,
    identifiedBy: item.kind === "DRUG" ? ("SCAN" as const) : null,
    identificationScore: item.kind === "DRUG" ? 1 : null,
    // Un médicament identifié par son CIP est confirmé ; un produit de
    // parapharmacie aussi ; un code inconnu reste à confirmer par le pharmacien.
    status: item.kind === "UNKNOWN" ? ("EXTRACTED" as const) : ("CONFIRMED" as const),
    fieldConfidence: { drugName: item.kind === "UNKNOWN" ? 0 : 1 },
    // Le code lu reste sur la ligne : il dit d'où elle vient, et permet de la reconnaître à l'écran.
    rawText: item.kind === "UNKNOWN" ? item.code : item.kind === "PRODUCT" ? item.ean : null,
    instructions: item.kind === "UNKNOWN" && item.hint ? `Douchette : ${item.hint}` : null,
    // La péremption lue dans le Datamatrix de la boîte, quand l'agent l'a lue avec certitude.
    expiresOn: input.expiresOn ?? null,
  };

  const now = new Date();
  const at = scanInstant(input.scannedAt, now);
  const post = input.post.trim().slice(0, 60) || "poste";

  // Le bip précédent de CE poste, lu avant que celui-ci ne le remplace : c'est
  // lui, et non la dernière écriture de la vente, qui dit si le patient est le même.
  let previousScanAt: Date | null = null;
  let postOwnerId: string | null = null;
  if (agent.postId) {
    const known = await prisma.counterPost.findUnique({ where: { id: agent.postId }, select: { lastScanAt: true, assignedUserId: true } });
    previousScanAt = known?.lastScanAt ?? null;
    // Le collaborateur à qui ce comptoir est attribué au moment du bip : la vente lui revient, pour de bon.
    postOwnerId = known?.assignedUserId ?? null;
  }
  const withinWindow = previousScanAt !== null && Math.abs(at.getTime() - previousScanAt.getTime()) <= SAME_SALE_WINDOW_MS;

  // La vente ouverte de ce poste, et la règle du fondateur (15 oct. 2026) pour savoir si ce bip est le même client :
  //  - quelqu'un a déjà répondu Vendu ou Non vendu à un de ses conseils : la vente reste ouverte jusqu'à « Vente terminée »,
  //    chaque bip s'y ajoute, quel que soit le temps écoulé ;
  //  - personne n'a répondu : une minute sans bip suffit, la vente se termine d'elle-même et ce bip ouvre la suivante.
  // Poste inconnu (clé d'un serveur) : repli sur la dernière écriture de la vente, dans la même minute.
  const openWhere = {
    pharmacyId: agent.scope.pharmacyId,
    source: "COUNTER_SCAN" as const,
    // Le comptoir se reconnaît à son identité, pas à son nom affiché : deux ordinateurs de même nom ne mélangent jamais leurs ventes.
    ...(agent.postId ? { counterPostId: agent.postId } : { counterPost: post }),
    // Une vente déjà analysée mais pas encore encaissée reste celle du patient au comptoir : un bip de plus la complète et la ré-analyse.
    status: { in: ["DRAFT", "NEEDS_VERIFICATION", "VERIFIED", "ANALYZING", "ANALYZED"] as ("DRAFT" | "NEEDS_VERIFICATION" | "VERIFIED" | "ANALYZING" | "ANALYZED")[] },
    // Au-delà, une vente oubliée n'est plus reprise (même plafond que l'écran « Au comptoir »).
    updatedAt: { gte: agent.postId ? new Date(now.getTime() - OPEN_SALE_MAX_AGE_MS) : new Date(now.getTime() - SAME_SALE_WINDOW_MS) },
    sales: { none: {} },
    // « Vente terminée » : le bip suivant est un autre patient.
    NOT: { counterFollowUp: { closedAt: { not: null } } },
  };
  let open = await prisma.prescription.findFirst({
    where: openWhere,
    // La vente que ce poste a ouverte en dernier, jamais une plus ancienne encore ouverte : l'ordre est celui de la création,
    // pas de l'écriture (une analyse tardive d'une vente ancienne la ferait remonter).
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      reference: true,
      lines: { select: { id: true, drugSpecialtyId: true, rawText: true, drugName: true, quantity: true, position: true, expiresOn: true } },
      _count: { select: { recommendations: { where: { outcomeSource: COUNTER_ANSWERED, decidedAt: { not: null } } } } },
    },
  });
  // Le produit bipé est-il un des conseils proposés dans la vente ouverte ? Alors c'est le même client, quel que soit le temps
  // passé à aller le chercher en rayon : la vente ne se ferme pas d'elle-même.
  // Jamais la boîte du patient elle-même : bipée une seconde fois (ou annoncée par le robot de la pharmacie), une boîte déjà dans
  // la vente reste une boîte de plus, jamais un conseil « Vendu » (fondateur, 21 oct. 2026 : ADIARIL bipé, « Vendu » sans vente).
  const alreadyInSale = Boolean(open?.lines.some((line) => (item.kind === "DRUG" ? line.drugSpecialtyId === item.specialtyId : item.kind === "PRODUCT" ? !line.drugSpecialtyId && line.rawText === item.ean : false)));
  const conseil = open && item.kind !== "UNKNOWN" && !alreadyInSale ? await conseilForScan(agent.scope.pharmacyId, open.id, item) : null;
  if (open && agent.postId && !conseil) {
    const answered = open._count.recommendations > 0;
    if (!answered && !withinWindow) {
      // Personne n'a répondu et le poste est resté une minute sans bip : la vente se termine toute seule (conseils « sans
      // réponse », comme un « Vente terminée »), et ce bip est le client suivant.
      const closing = open.id;
      open = null;
      try {
        const { finishCounterSale } = await import("@/server/services/counter-window");
        await finishCounterSale(agent, { prescriptionId: closing });
      } catch (error) {
        console.error("[scan] fin automatique de la vente", error);
      }
    }
  }
  let prescriptionId: string;
  let reference: string;
  let created = false;
  // Le produit bipé est un des conseils proposés dans cette vente (fondateur, 16 oct. 2026) : le conseil passe en « Vendu » tout
  // seul — le pharmacien n'a plus à cliquer —, la boîte n'est pas ajoutée comme un médicament de plus, et la vente n'est pas
  // ré-analysée (un conseil bipé ne relance jamais un conseil). Les conseils jamais bipés passent en « Non vendu » à la fin de
  // la vente (finishCounterSale).
  if (open && conseil && item.kind !== "UNKNOWN") {
    if (conseil.status !== "PURCHASED") {
      if (conseil.replaces) {
        await prisma.recommendation.update({ where: { id: conseil.id }, data: { productId: conseil.replaces.productId, replacedProductId: conseil.replaces.previousProductId, ...(conseil.replaces.priceCents > 0 ? { unitPriceCents: conseil.replaces.priceCents } : {}) } });
        await prisma.recommendationEvent.create({ data: { recommendationId: conseil.id, type: "REPLACED", metadata: { via: "ANSWER_SCAN", previousProductId: conseil.replaces.previousProductId, productId: conseil.replaces.productId } as never } });
      }
      const { decideCounterAdvice } = await import("@/server/services/counter-window");
      await decideCounterAdvice(agent, { prescriptionId: open.id, recommendationId: conseil.id, outcome: "SOLD", via: "SCAN" });
    }
    // La boîte sort quand même du rayon : le stock baisse d'une unité, jamais sous zéro.
    if (item.kind === "DRUG") {
      await prisma.pharmacyDrugStock.updateMany({ where: { pharmacyId: agent.scope.pharmacyId, presentationId: item.presentationId, quantity: { gt: 0 } }, data: { quantity: { decrement: 1 } } });
    } else {
      await prisma.stockItem.updateMany({ where: { pharmacyId: agent.scope.pharmacyId, productId: item.productId, quantity: { gt: 0 } }, data: { quantity: { decrement: 1 } } });
    }
    if (agent.postId) {
      const lastScanAt = previousScanAt && previousScanAt.getTime() > at.getTime() ? previousScanAt : at;
      await prisma.counterPost.update({ where: { id: agent.postId }, data: { lastScanAt, lastSeenAt: now, scanCount: { increment: 1 } } });
    }
    // La vente reste « en cours » : son heure avance (elle n'est pas prise pour une vente oubliée).
    await prisma.prescription.update({ where: { id: open.id }, data: { updatedAt: now } });
    const lineCount = await prisma.prescriptionLine.count({ where: { prescriptionId: open.id } });
    await recordAudit({ action: "prescription.counter_scan", entityType: "Prescription", entityId: open.id, pharmacyId: agent.scope.pharmacyId, userId: agent.scope.userId, metadata: { code: input.code, kind: item.kind, post, adviceSold: conseil.id, scannedAt: input.scannedAt && !Number.isNaN(input.scannedAt.getTime()) ? input.scannedAt.toISOString() : null } });
    return { ok: true, prescriptionId: open.id, reference: open.reference, lineCount, drugName: item.name, created: false, kind: item.kind, adviceSold: true };
  }

  // Une vente qui a déjà beaucoup de boîtes n'est plus celle d'un seul client (les ventes géantes du 15 oct. 2026) :
  // le bip suivant en ouvre une nouvelle, et la vente géante n'est plus jamais reprise.
  if (open && open.lines.length >= MAX_BOXES_PER_SALE) open = null;
  if (open) {
    prescriptionId = open.id;
    reference = open.reference;
    const same = open.lines.find((line) => (item.kind === "DRUG" ? line.drugSpecialtyId === itemKey : item.kind === "PRODUCT" ? line.rawText === item.ean || line.drugName === item.name : line.rawText === item.code));
    if (same) {
      // Deux boîtes du même produit : la date la plus proche compte (c'est elle qui peut être périmée).
      const expiresOn = input.expiresOn && (!same.expiresOn || input.expiresOn < same.expiresOn) ? input.expiresOn : same.expiresOn;
      await prisma.prescriptionLine.update({ where: { id: same.id }, data: { quantity: (same.quantity ?? 1) + 1, expiresOn } });
    } else {
      // Après la position la plus haute, jamais « nombre de boîtes + 1 » : une boîte retirée laisse un trou, et le numéro serait déjà pris.
      const next = open.lines.reduce((max, line) => Math.max(max, line.position ?? 0), 0) + 1;
      await prisma.prescriptionLine.create({ data: { prescriptionId: open.id, position: next, ...lineData } });
    }
    // Retour à « à confirmer » : l'écran relance l'analyse avec la nouvelle boîte.
    await prisma.prescription.update({ where: { id: open.id }, data: { status: "NEEDS_VERIFICATION", verifiedAt: null } });
  } else {
    // Deux postes qui bipent en même temps : la référence se recalcule en cas de collision, aucun bip n'est perdu.
    const prescription = await createWithReference("prescription", agent.scope.pharmacyId, (candidate) =>
      prisma.prescription.create({
        data: {
          pharmacyId: agent.scope.pharmacyId,
          reference: candidate,
          status: "NEEDS_VERIFICATION",
          source: "COUNTER_SCAN",
          counterPost: post,
          counterPostId: agent.postId ?? null,
          handledByUserId: postOwnerId,
          createdByUserId: agent.scope.userId,
          isDemo: recordIsDemo(agent.pharmacyIsDemo),
          lines: { create: { position: 1, ...lineData } },
        },
        select: { id: true, reference: true },
      }),
    );
    reference = prescription.reference;
    prescriptionId = prescription.id;
    created = true;
  }

  // Une boîte sort : le stock de l'officine baisse d'une unité, jamais sous zéro.
  if (item.kind === "DRUG") {
    await prisma.pharmacyDrugStock.updateMany({ where: { pharmacyId: agent.scope.pharmacyId, presentationId: item.presentationId, quantity: { gt: 0 } }, data: { quantity: { decrement: 1 } } });
  } else if (item.kind === "PRODUCT") {
    await prisma.stockItem.updateMany({ where: { pharmacyId: agent.scope.pharmacyId, productId: item.productId, quantity: { gt: 0 } }, data: { quantity: { decrement: 1 } } });
  }
  if (agent.postId) {
    // Le poste retient l'instant du bip, jamais en arrière de ce qu'il a déjà (un bip rejoué en retard ne fait pas reculer son dernier bip).
    const lastScanAt = previousScanAt && previousScanAt.getTime() > at.getTime() ? previousScanAt : at;
    await prisma.counterPost.update({ where: { id: agent.postId }, data: { lastScanAt, lastSeenAt: now, scanCount: { increment: 1 } } });
  }
  const lineCount = await prisma.prescriptionLine.count({ where: { prescriptionId } });
  await recordAudit({ action: "prescription.counter_scan", entityType: "Prescription", entityId: prescriptionId, pharmacyId: agent.scope.pharmacyId, userId: agent.scope.userId, metadata: { code: input.code, kind: item.kind, post, scannedAt: input.scannedAt && !Number.isNaN(input.scannedAt.getTime()) ? input.scannedAt.toISOString() : null } });
  return { ok: true, prescriptionId, reference, lineCount, drugName: item.name, created, kind: item.kind };
}

/** La délivrance en cours sur un poste (pour l'écran du comptoir), s'il y en a une. */
/**
 * La délivrance en cours sur les comptoirs donnés (pour l'écran de la personne à qui ils sont), s'il y en a une. `postIds` est OBLIGATOIRE :
 * chaque comptoir est un espace à part, jamais « toutes les ventes de la pharmacie » par défaut.
 */
export async function listLiveCounterSales(pharmacyId: string, postIds: string[]) {
  if (postIds.length === 0) return [];
  return prisma.prescription.findMany({
    where: { pharmacyId, source: "COUNTER_SCAN", counterPostId: { in: postIds }, status: { in: ["NEEDS_VERIFICATION", "VERIFIED", "ANALYZING", "ANALYZED"] }, sales: { none: {} }, NOT: { counterFollowUp: { closedAt: { not: null } } }, updatedAt: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) } },
    orderBy: { updatedAt: "desc" },
    take: 10,
    select: {
      id: true,
      reference: true,
      status: true,
      counterPost: true,
      counterPostId: true,
      updatedAt: true,
      createdAt: true,
      lines: { orderBy: { position: "asc" }, select: { drugName: true, quantity: true } },
      // Les conseils proposés et leur état (page « Au comptoir ») : le nom du produit, jamais la phrase dite au patient.
      recommendations: { orderBy: { totalScore: "desc" }, take: 8, select: { status: true, product: { select: { name: true } }, presentation: { select: { specialty: { select: { name: true } } } } } },
      _count: { select: { recommendations: true } },
    },
  });
}

/**
 * Le pharmacien rattache un code inconnu à un produit de son stock : la ligne
 * devient ce produit, le code est retenu pour l'officine, le stock baisse
 * d'une unité comme pour tout bip.
 */
export async function attachBarcodeToProduct(scope: { pharmacyId: string; userId: string }, lineId: string, productId: string): Promise<{ ok: true; productName: string; code: string } | { ok: false; error: string }> {
  const line = await prisma.prescriptionLine.findFirst({ where: { id: lineId, prescription: { pharmacyId: scope.pharmacyId } }, select: { id: true, rawText: true, drugSpecialtyId: true, prescriptionId: true } });
  if (!line) return { ok: false, error: "Ligne introuvable." };
  const code = (line.rawText ?? "").replace(/\D/g, "");
  if (code.length < 7 || line.drugSpecialtyId) return { ok: false, error: "Cette ligne n'est pas un code-barres inconnu." };
  const product = await prisma.product.findFirst({ where: { id: productId, pharmacyId: scope.pharmacyId, deletedAt: null }, select: { id: true, name: true } });
  if (!product) return { ok: false, error: "Produit introuvable dans votre stock." };
  await prisma.$transaction([
    prisma.productBarcode.upsert({ where: { pharmacyId_code: { pharmacyId: scope.pharmacyId, code } }, create: { pharmacyId: scope.pharmacyId, productId: product.id, code, source: "LEARNED" }, update: { productId: product.id } }),
    prisma.prescriptionLine.update({ where: { id: line.id }, data: { drugName: product.name, status: "CONFIRMED", fieldConfidence: { drugName: 1 }, instructions: null, correctedByUserId: scope.userId, correctedAt: new Date() } }),
    prisma.stockItem.updateMany({ where: { pharmacyId: scope.pharmacyId, productId: product.id, quantity: { gt: 0 } }, data: { quantity: { decrement: 1 } } }),
  ]);
  await recordAudit({ action: "prescription.barcode_learned", entityType: "Product", entityId: product.id, pharmacyId: scope.pharmacyId, userId: scope.userId, metadata: { code, lineId: line.id } });
  return { ok: true, productName: product.name, code };
}

/**
 * « Nouveau patient » : les ventes de la douchette encore ouvertes (sans
 * encaissement) sont closes. L'écran redevient vierge et le bip suivant
 * ouvre une nouvelle vente, même moins d'une minute après le dernier.
 */
export async function closeLiveCounterSales(scope: { pharmacyId: string; userId: string }, prescriptionId?: string, postIds?: string[]): Promise<number> {
  const result = await prisma.prescription.updateMany({
    where: {
      pharmacyId: scope.pharmacyId,
      source: "COUNTER_SCAN",
      ...(prescriptionId ? { id: prescriptionId } : {}),
      // « Nouveau patient » ne ferme que les ventes de mes comptoirs, jamais celles d'un collègue.
      ...(postIds ? { counterPostId: { in: postIds } } : {}),
      status: { in: ["DRAFT", "NEEDS_VERIFICATION", "VERIFIED", "ANALYZING", "ANALYZED"] },
      sales: { none: {} },
      // Une vente que le pharmacien a déjà terminée (« Vente terminée ») est finie : « Nouveau patient » n'y touche pas.
      NOT: { counterFollowUp: { closedAt: { not: null } } },
    },
    data: { status: "CANCELLED" },
  });
  if (result.count > 0) await recordAudit({ action: "prescription.counter_reset", entityType: "Prescription", entityId: prescriptionId ?? null, pharmacyId: scope.pharmacyId, userId: scope.userId, metadata: { closed: result.count } });
  return result.count;
}


export type RemoveLineResult = { ok: true; remaining: number } | { ok: false; error: string };

/**
 * Le patient repose une boîte (« finalement, je ne prends pas celui-là ») : le pharmacien la retire de la bannière.
 *
 *  - La boîte quitte la vente ; son unité revient au stock quand on sait laquelle c'était (un produit, ou un médicament présent
 *    sous une seule présentation dans le stock de l'officine).
 *  - Les conseils qu'ELLE seule déclenchait disparaissent (ceux d'une autre boîte restent) ; encore sans réponse, ils reviennent si
 *    la boîte est rebipée.
 *  - La vente repart à l'analyse avec les boîtes qui restent, comme après un bip : la bannière se met à jour seule.
 *  - Plus aucune boîte : la vente reste ouverte et vide — c'est le même patient jusqu'à FIN Valider (fondateur, 21 oct. 2026).
 *
 * Seulement sur une vente de CE poste (ou de cette pharmacie pour une clé de serveur), encore ouverte : jamais une vente terminée ou encaissée.
 */
export async function removeCounterLine(agent: AgentContext, input: { prescriptionId: string; lineId: string }): Promise<RemoveLineResult> {
  const sale = await prisma.prescription.findFirst({
    where: {
      id: input.prescriptionId,
      pharmacyId: agent.scope.pharmacyId,
      source: "COUNTER_SCAN",
      ...(agent.postId ? { counterPostId: agent.postId } : {}),
      status: { in: ["DRAFT", "NEEDS_VERIFICATION", "VERIFIED", "ANALYZING", "ANALYZED"] },
      sales: { none: {} },
      NOT: { counterFollowUp: { closedAt: { not: null } } },
    },
    select: { id: true, lines: { select: { id: true, drugName: true, drugSpecialtyId: true, rawText: true, quantity: true } } },
  });
  if (!sale) return { ok: false, error: "Cette vente n'est plus ouverte sur ce poste." };
  const line = sale.lines.find((candidate) => candidate.id === input.lineId);
  if (!line) return { ok: false, error: "Cette boîte n'est plus dans la vente." };
  const remaining = sale.lines.length - 1;

  // Les conseils que cette boîte SEULE déclenchait : retirés (une autre boîte qui les déclenche aussi les garde).
  const linked = await prisma.recommendation.findMany({
    where: { prescriptionId: sale.id, opportunity: { triggeredLineIds: { has: line.id } } },
    select: { id: true, status: true, opportunity: { select: { triggeredLineIds: true } } },
  });
  const ownAdvice = linked.filter((rec) => (rec.opportunity?.triggeredLineIds ?? []).every((id) => id === line.id));
  const onlyThisBox = ownAdvice.map((rec) => rec.id);
  // Les conseils encore sans réponse partent avec la boîte, effacés — si la boîte est rebipée (supprimée puis reprise dans
  // LGPI, POSTE5 le 16 oct. 2026), ils reviennent. Un conseil déjà tranché passe « retiré » et ne s'affiche plus, même bipé : il
  // ne comptait vendu qu'à la validation (fondateur, 21 oct. 2026 : « les médicaments et conseils ne doivent plus se voir »).
  const undecided = ownAdvice.filter((rec) => rec.status === "PROPOSED" || rec.status === "PRESENTED").map((rec) => rec.id);
  const decided = ownAdvice.filter((rec) => rec.status !== "PROPOSED" && rec.status !== "PRESENTED").map((rec) => rec.id);

  await prisma.$transaction(async (tx) => {
    if (undecided.length > 0) await tx.recommendation.deleteMany({ where: { id: { in: undecided } } });
    if (decided.length > 0) await tx.recommendation.updateMany({ where: { id: { in: decided } }, data: { status: "REMOVED" } });
    await tx.prescriptionLine.delete({ where: { id: line.id } });
    // Plus aucune boîte : aucun conseil ne reste à l'écran, pas même un conseil bipé — il ne comptait vendu qu'à la validation.
    if (remaining === 0) await tx.recommendation.updateMany({ where: { prescriptionId: sale.id, status: { in: ["PROPOSED", "PRESENTED", "ACCEPTED", "MODIFIED", "PURCHASED", "DECLINED"] } }, data: { status: "REMOVED" } });
    await tx.prescription.update({
      where: { id: sale.id },
      // Plus de boîte : c'est TOUJOURS le même patient (fondateur, 21 oct. 2026 : « on passe au nouveau patient seulement quand
      // c'est FIN Valider ») — la vente reste ouverte, vide ; la boîte suivante s'y ajoute. Sinon, elle repart à l'analyse.
      data: remaining === 0 ? { status: "ANALYZED" } : { status: "NEEDS_VERIFICATION", verifiedAt: null },
    });
  });

  // L'unité revient au stock, seulement quand on sait exactement laquelle c'était.
  const units = Math.max(1, line.quantity ?? 1);
  if (line.rawText && !line.drugSpecialtyId) {
    const product = await prisma.product.findFirst({ where: { pharmacyId: agent.scope.pharmacyId, ean: line.rawText }, select: { id: true } });
    if (product) await prisma.stockItem.updateMany({ where: { pharmacyId: agent.scope.pharmacyId, productId: product.id }, data: { quantity: { increment: units } } });
  } else if (line.drugSpecialtyId) {
    const stocks = await prisma.pharmacyDrugStock.findMany({ where: { pharmacyId: agent.scope.pharmacyId, presentation: { specialtyId: line.drugSpecialtyId } }, select: { id: true }, take: 2 });
    if (stocks.length === 1) await prisma.pharmacyDrugStock.update({ where: { id: stocks[0].id }, data: { quantity: { increment: units } } });
  }

  await recordAudit({ action: "prescription.counter_line_removed", entityType: "Prescription", entityId: sale.id, pharmacyId: agent.scope.pharmacyId, userId: agent.scope.userId, metadata: { line: line.drugName, remaining, removedAdvice: onlyThisBox.length } });
  return { ok: true, remaining };
}

export type SplitLineResult = { ok: true; prescriptionId: string; reference: string } | { ok: false; error: string };

/**
 * « C'est un autre client ? » (fondateur, 15 oct. 2026) : la dernière boîte bipée a rejoint la vente en cours alors qu'elle est
 * celle du client suivant. D'un clic, elle quitte cette vente et en ouvre une nouvelle, à elle seule ; la vente précédente se
 * termine (comme « Vente terminée », ses conseils sans réponse le restent). Rien ne bouge dans le stock : la boîte est bien sortie.
 *
 *  - Les conseils que cette boîte SEULE déclenchait quittent la vente précédente ; la nouvelle vente est analysée pour elle.
 *  - Une vente d'une seule boîte ne se sépare pas (elle est déjà « un client »).
 */
export async function splitCounterLine(agent: AgentContext, input: { prescriptionId: string; lineId: string }): Promise<SplitLineResult> {
  const sale = await prisma.prescription.findFirst({
    where: {
      id: input.prescriptionId,
      pharmacyId: agent.scope.pharmacyId,
      source: "COUNTER_SCAN",
      ...(agent.postId ? { counterPostId: agent.postId } : {}),
      status: { in: ["DRAFT", "NEEDS_VERIFICATION", "VERIFIED", "ANALYZING", "ANALYZED"] },
      sales: { none: {} },
      NOT: { counterFollowUp: { closedAt: { not: null } } },
    },
    select: { id: true, counterPost: true, counterPostId: true, handledByUserId: true, isDemo: true, lines: { select: { id: true, drugName: true } } },
  });
  if (!sale) return { ok: false, error: "Cette vente n'est plus ouverte sur ce poste." };
  const line = sale.lines.find((candidate) => candidate.id === input.lineId);
  if (!line) return { ok: false, error: "Cette boîte n'est plus dans la vente." };
  if (sale.lines.length < 2) return { ok: false, error: "Cette boîte est déjà seule dans sa vente." };

  const linked = await prisma.recommendation.findMany({
    where: { prescriptionId: sale.id, opportunity: { triggeredLineIds: { has: line.id } } },
    select: { id: true, opportunity: { select: { triggeredLineIds: true } } },
  });
  const onlyThisBox = linked.filter((rec) => (rec.opportunity?.triggeredLineIds ?? []).every((id) => id === line.id)).map((rec) => rec.id);

  // La nouvelle vente, au même comptoir, pour la même personne ; la boîte y passe, en première position.
  const created = await createWithReference("prescription", agent.scope.pharmacyId, (candidate) =>
    prisma.prescription.create({
      data: {
        pharmacyId: agent.scope.pharmacyId,
        reference: candidate,
        status: "NEEDS_VERIFICATION",
        source: "COUNTER_SCAN",
        counterPost: sale.counterPost,
        counterPostId: sale.counterPostId,
        handledByUserId: sale.handledByUserId,
        createdByUserId: agent.scope.userId,
        isDemo: sale.isDemo,
      },
      select: { id: true, reference: true },
    }),
  );
  await prisma.$transaction(async (tx) => {
    if (onlyThisBox.length > 0) await tx.recommendation.updateMany({ where: { id: { in: onlyThisBox } }, data: { status: "REMOVED" } });
    await tx.prescriptionLine.update({ where: { id: line.id }, data: { prescriptionId: created.id, position: 1 } });
  });

  // La vente précédente est celle d'un client parti : elle se termine, comme « Vente terminée ».
  try {
    const { finishCounterSale } = await import("@/server/services/counter-window");
    await finishCounterSale(agent, { prescriptionId: sale.id });
  } catch (error) {
    console.error("[scan] fin de la vente précédente après séparation", error);
  }
  await recordAudit({ action: "prescription.counter_line_split", entityType: "Prescription", entityId: created.id, pharmacyId: agent.scope.pharmacyId, userId: agent.scope.userId, metadata: { from: sale.id, line: line.drugName, removedAdvice: onlyThisBox.length } });
  return { ok: true, prescriptionId: created.id, reference: created.reference };
}

export type RemoveCodeResult = { ok: true; action: "line_removed"; remaining: number } | { ok: true; action: "advice_undone" } | { ok: false; error: string };

/**
 * Une ligne SUPPRIMÉE dans LGPI (touche Suppr, journal « ABANDON_LIGNE », diagnostic de POSTE5 du 16 oct. 2026) : l'agent sait,
 * par le journal, quel code portait cette ligne. PharmaBoost suit :
 *  - c'était une boîte de la vente : elle la quitte, comme « Retirer » (ses conseils à elle seule avec, la vente est ré-analysée) ;
 *  - c'était un conseil bipé (« ✓ Vendu ») : il repasse « À proposer », et son unité revient au stock ;
 *  - rien ne correspond dans la vente : rien ne bouge (jamais une autre boîte à la place).
 */
export async function removeCounterCode(agent: AgentContext, input: { prescriptionId: string; code: string; lgpi?: { line: number | null; known: number | null } }): Promise<RemoveCodeResult> {
  const result = await removeCounterCodeInner(agent, input);
  // Chaque suppression lue dans LGPI laisse une trace, même quand rien n'est retiré : c'est ce qui permet de comprendre un
  // essai au comptoir sans redemander de diagnostic (rang de la ligne, nombre de lignes connues de l'agent, raison).
  if (!result.ok) {
    await recordAudit({ action: "prescription.counter_lgpi_line_ignored", entityType: "Prescription", entityId: input.prescriptionId, pharmacyId: agent.scope.pharmacyId, userId: agent.scope.userId, metadata: { code: input.code.replace(/\D/g, "").slice(0, 20) || null, line: input.lgpi?.line ?? null, known: input.lgpi?.known ?? null, reason: result.error } }).catch(() => undefined);
  }
  return result;
}

/** Tous les codes qui désignent ce produit dans cette pharmacie : celui de l'export du LGO et ceux appris au comptoir. */
async function codesOfProduct(pharmacyId: string, productId: string, known: string): Promise<Set<string>> {
  const [product, learned] = await Promise.all([
    prisma.product.findFirst({ where: { id: productId, pharmacyId }, select: { ean: true } }),
    prisma.productBarcode.findMany({ where: { pharmacyId, productId }, select: { code: true } }),
  ]);
  return new Set([known, ...(product?.ean ? [product.ean] : []), ...learned.map((row) => row.code)]);
}

async function removeCounterCodeInner(agent: AgentContext, input: { prescriptionId: string; code: string }): Promise<RemoveCodeResult> {
  const code = input.code.replace(/\D/g, "").slice(0, 20);
  if (code.length < 7) return { ok: false, error: "L'agent ne sait pas quelle boîte portait cette ligne (vente commencée avant lui, ou ligne inconnue)." };
  const sale = await prisma.prescription.findFirst({
    where: {
      id: input.prescriptionId,
      pharmacyId: agent.scope.pharmacyId,
      source: "COUNTER_SCAN",
      ...(agent.postId ? { counterPostId: agent.postId } : {}),
      status: { in: ["DRAFT", "NEEDS_VERIFICATION", "VERIFIED", "ANALYZING", "ANALYZED"] },
      sales: { none: {} },
      NOT: { counterFollowUp: { closedAt: { not: null } } },
    },
    select: { id: true, lines: { orderBy: { position: "desc" }, select: { id: true, drugSpecialtyId: true, rawText: true } } },
  });
  if (!sale) return { ok: false, error: "Cette vente n'est plus ouverte sur ce poste." };
  const item = await resolveScannedItem(agent.scope.pharmacyId, code, agent.pharmacyIsDemo);
  if (!item) return { ok: false, error: "Code inconnu." };

  // 1. Une boîte de la vente (la dernière ajoutée d'abord, comme LGPI quand on supprime une ligne en double). Un produit se
  // reconnaît à TOUS ses codes : LGPI écrit dans son journal son propre code (souvent l'ACL), la douchette a lu celui de la
  // boîte (souvent l'EAN) — un Hydratis supprimé dans LGPI restait sur la bannière (fondateur, 21 oct. 2026).
  const productCodes = item.kind === "PRODUCT" ? await codesOfProduct(agent.scope.pharmacyId, item.productId, item.ean) : null;
  const line = sale.lines.find((candidate) => (item.kind === "DRUG" ? candidate.drugSpecialtyId === item.specialtyId : item.kind === "PRODUCT" ? !candidate.drugSpecialtyId && !!productCodes?.has(candidate.rawText ?? "") : candidate.rawText === item.code));
  if (line) {
    const removed = await removeCounterLine(agent, { prescriptionId: sale.id, lineId: line.id });
    return removed.ok ? { ok: true, action: "line_removed", remaining: removed.remaining } : removed;
  }
  if (item.kind === "UNKNOWN") return { ok: false, error: "Cette boîte n'est pas dans la vente." };

  // 2. Un conseil vendu au comptoir par ce bip : il repasse « À proposer ».
  let sold = await prisma.recommendation.findFirst({
    where: {
      prescriptionId: sale.id,
      pharmacyId: agent.scope.pharmacyId,
      status: "PURCHASED",
      outcomeSource: COUNTER_ANSWERED,
      OR: item.kind === "PRODUCT" ? [{ productId: item.productId }] : [{ presentationId: item.presentationId }, { presentation: { specialtyId: item.specialtyId } }],
    },
    orderBy: { decidedAt: "desc" },
    select: { id: true },
  });
  // Le conseil avait été vendu par un produit de la même gamme (un autre parfum, un autre format) : c'est lui qui repasse.
  if (!sold && item.kind === "PRODUCT") {
    const scanned = await prisma.product.findFirst({ where: { id: item.productId, pharmacyId: agent.scope.pharmacyId }, select: { name: true, brand: true } });
    if (scanned && rangeKey(scanned.name, scanned.brand)) {
      const candidates = await prisma.recommendation.findMany({
        where: { prescriptionId: sale.id, pharmacyId: agent.scope.pharmacyId, status: "PURCHASED", outcomeSource: COUNTER_ANSWERED, productId: { not: null } },
        orderBy: { decidedAt: "desc" },
        select: { id: true, product: { select: { name: true, brand: true } } },
      });
      sold = candidates.find((rec) => rec.product && sameRange(rec.product, scanned)) ?? null;
    }
  }
  if (!sold) return { ok: false, error: "Cette boîte n'est pas dans la vente." };
  const { decideCounterAdvice } = await import("@/server/services/counter-window");
  const undone = await decideCounterAdvice(agent, { prescriptionId: sale.id, recommendationId: sold.id, outcome: "NONE" });
  if (!undone.ok) return undone;
  // Le bip avait sorti l'unité du stock : elle y revient.
  if (item.kind === "DRUG") {
    const stocks = await prisma.pharmacyDrugStock.findMany({ where: { pharmacyId: agent.scope.pharmacyId, presentationId: item.presentationId }, select: { id: true }, take: 1 });
    if (stocks[0]) await prisma.pharmacyDrugStock.update({ where: { id: stocks[0].id }, data: { quantity: { increment: 1 } } });
  } else {
    await prisma.stockItem.updateMany({ where: { pharmacyId: agent.scope.pharmacyId, productId: item.productId }, data: { quantity: { increment: 1 } } });
  }
  await recordAudit({ action: "prescription.counter_advice_unscanned", entityType: "Prescription", entityId: sale.id, pharmacyId: agent.scope.pharmacyId, userId: agent.scope.userId, metadata: { recommendationId: sold.id } });
  return { ok: true, action: "advice_undone" };
}

/**
 * La vente ABANDONNÉE dans LGPI (journal « ABANDON_VENTE ») : le client n'a rien pris. La vente PharmaBoost ouverte de ce poste
 * est annulée — elle n'entre ni dans l'historique ni dans les résultats, aucun conseil n'y est compté « non vendu ».
 */
export async function abandonCounterSale(agent: AgentContext, input: { prescriptionId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await prisma.prescription.updateMany({
    where: {
      id: input.prescriptionId,
      pharmacyId: agent.scope.pharmacyId,
      source: "COUNTER_SCAN",
      ...(agent.postId ? { counterPostId: agent.postId } : {}),
      status: { in: ["DRAFT", "NEEDS_VERIFICATION", "VERIFIED", "ANALYZING", "ANALYZED"] },
      sales: { none: {} },
      NOT: { counterFollowUp: { closedAt: { not: null } } },
    },
    data: { status: "CANCELLED" },
  });
  if (result.count === 0) return { ok: false, error: "Cette vente n'est plus ouverte sur ce poste." };
  // Vente abandonnée : le client n'a rien pris. Un conseil bipé ne comptait vendu qu'à la validation (fondateur, 21 oct. 2026) :
  // il redevient « Non vendu ».
  await prisma.recommendation.updateMany({ where: { prescriptionId: input.prescriptionId, pharmacyId: agent.scope.pharmacyId, status: "PURCHASED", outcomeSource: COUNTER_ANSWERED }, data: { status: "DECLINED" } });
  await recordAudit({ action: "prescription.counter_sale_abandoned", entityType: "Prescription", entityId: input.prescriptionId, pharmacyId: agent.scope.pharmacyId, userId: agent.scope.userId, metadata: { source: "LGPI" } });
  return { ok: true };
}
