import "server-only";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import { extractFromDocument, type ExtractionOutcome } from "@/server/ai/knowledge-extractor";
import { textFromFile } from "@/server/services/knowledge-files";
import { addCentralAssociation, addCustomRule, searchKnownProducts, type Admin } from "@/server/services/central-advice";
import { MAX_DOCUMENT_CHARS, normalizeText, validateExtraction, type ProposedAssociation, type ValidProposal } from "@/core/knowledge/extraction";

/**
 * La base de connaissances de PharmaBoost : les documents que la pharmacienne dépose dans la console, et ce que le modèle d'Anthropic
 * en propose.
 *
 * Le chemin, du dépôt au conseil en ligne :
 *   1. le document est déposé (fichier ou texte) ; seul son texte est gardé, aucune donnée de patient ;
 *   2. le modèle le lit et PROPOSE des conseils et associations, chacun avec la phrase du document qui le justifie ;
 *   3. le logiciel vérifie chaque proposition contre le document (la phrase existe-t-elle ? les noms y sont-ils ?) et écarte le reste ;
 *   4. la pharmacienne accepte ou refuse. Accepter crée un conseil ou une association du centre de contrôle : en ligne dans TOUTES les
 *      pharmacies à la vente suivante, « à relire » jusqu'à sa validation. Rien n'est jamais mis en ligne sans ce clic.
 */

export type DepositInput =
  | { kind: "TEXT"; title: string; note: string | null; text: string }
  | { kind: "FILE"; title: string; note: string | null; fileName: string; mimeType: string | null; bytes: Uint8Array };

export type KnowledgeDeps = {
  extract?: (input: { title: string; note: string | null; text: string }) => Promise<ExtractionOutcome>;
  findProduct?: (name: string) => Promise<ProductMatch>;
};

type Failure = { ok: false; error: string };

export type { StoredAssociation } from "@/server/services/knowledge-types";
import type { StoredAssociation } from "@/server/services/knowledge-types";

export type ProductMatch = { status: "FOUND"; ean: string; name: string } | { status: "NONE" } | { status: "AMBIGUOUS"; count: number };

/** Retrouve un produit nommé par le document parmi ceux que les pharmacies ont en stock : un seul résultat sûr, sinon rien. */
export async function findProductByName(name: string): Promise<ProductMatch> {
  const words = normalizeText(name).split(" ").filter((word) => word.length >= 3);
  if (words.length === 0) return { status: "NONE" };
  const longest = [...words].sort((a, b) => b.length - a.length)[0];
  const hits = await searchKnownProducts(longest);
  const matching = hits.filter((hit) => {
    const haystack = normalizeText(`${hit.name} ${hit.brand ?? ""}`);
    return words.every((word) => haystack.includes(word));
  });
  if (matching.length === 1) return { status: "FOUND", ean: matching[0].ean, name: matching[0].name };
  return matching.length === 0 ? { status: "NONE" } : { status: "AMBIGUOUS", count: matching.length };
}

/** Pourquoi une association ne peut pas encore être acceptée (vide quand tout est prêt). */
export function associationProblem(payload: StoredAssociation): string | null {
  const missing: string[] = [];
  if (payload.triggerKind === "PRODUCT" && !payload.triggerEan) missing.push(`le produit « ${payload.triggerName} »`);
  if (!payload.adviceEan) missing.push(`le produit conseillé « ${payload.adviceName} »`);
  return missing.length ? `À compléter : choisissez ${missing.join(" et ")} dans les produits des pharmacies (aucun résultat sûr n'a été trouvé tout seul).` : null;
}

async function resolveAssociation(payload: ProposedAssociation, find: (name: string) => Promise<ProductMatch>): Promise<StoredAssociation> {
  const stored: StoredAssociation = { ...payload };
  if (payload.triggerKind === "PRODUCT") {
    const match = await find(payload.triggerName);
    if (match.status === "FOUND") { stored.triggerEan = match.ean; stored.triggerResolvedName = match.name; }
  }
  const advice = await find(payload.adviceName);
  if (advice.status === "FOUND") { stored.adviceEan = advice.ean; stored.adviceResolvedName = advice.name; }
  return stored;
}

// ---------------------------------------------------------------------------------------------------------------
// Dépôt et lecture
// ---------------------------------------------------------------------------------------------------------------

export async function depositDocument(admin: Admin, input: DepositInput, deps: KnowledgeDeps = {}): Promise<{ ok: true; id: string; proposals: number; discarded: number; analysis: "ANALYSED" | "FAILED"; analysisError: string | null; truncated: boolean } | Failure> {
  const title = input.title.trim().replace(/\s+/g, " ").slice(0, 120);
  if (title.length < 3) return { ok: false, error: "Donnez un titre au document (3 caractères au moins)." };
  const note = input.note?.trim().slice(0, 600) || null;

  let text: string;
  let truncated = false;
  let fileName: string | null = null;
  let mimeType: string | null = null;
  let sizeBytes: number;
  if (input.kind === "FILE") {
    const read = await textFromFile(input.fileName, input.bytes);
    if (!read.ok) return read;
    text = read.text;
    truncated = read.truncated;
    fileName = input.fileName.slice(0, 160);
    mimeType = input.mimeType?.slice(0, 80) ?? null;
    sizeBytes = input.bytes.byteLength;
  } else {
    text = input.text.replace(/\u0000/g, "").trim();
    if (text.length < 30) return { ok: false, error: "Le texte est trop court : écrivez au moins une phrase complète (30 caractères)." };
    if (text.length > MAX_DOCUMENT_CHARS) { text = text.slice(0, MAX_DOCUMENT_CHARS); truncated = true; }
    sizeBytes = Buffer.byteLength(text, "utf8");
  }

  const created = await prisma.knowledgeDocument.create({
    data: { title, sourceType: input.kind, fileName, mimeType, sizeBytes, textContent: text, note, createdByAdminId: admin.id, createdByName: admin.fullName },
    select: { id: true },
  });
  await recordAudit({ action: "knowledge.document_deposited", entityType: "KnowledgeDocument", entityId: created.id, platformAdminId: admin.id, metadata: { title, sourceType: input.kind, sizeBytes, truncated } });
  const analysis = await analyseDocument(admin, created.id, deps);
  if (!analysis.ok) return { ok: true, id: created.id, proposals: 0, discarded: 0, analysis: "FAILED", analysisError: analysis.error, truncated };
  return { ok: true, id: created.id, proposals: analysis.proposals, discarded: analysis.discarded, analysis: "ANALYSED", analysisError: null, truncated };
}

/** Fait lire le document par le modèle. Les propositions en attente d'une lecture précédente sont remplacées ; les décisions déjà prises sont gardées. */
export async function analyseDocument(admin: Admin, id: string, deps: KnowledgeDeps = {}): Promise<{ ok: true; proposals: number; discarded: number } | Failure> {
  const doc = await prisma.knowledgeDocument.findUnique({ where: { id }, select: { id: true, title: true, note: true, textContent: true } });
  if (!doc) return { ok: false, error: "Document introuvable." };
  const extract = deps.extract ?? extractFromDocument;
  const outcome = await extract({ title: doc.title, note: doc.note, text: doc.textContent });
  if (!outcome.ok) {
    await prisma.knowledgeDocument.update({ where: { id }, data: { status: "FAILED", analysisError: outcome.error } });
    return { ok: false, error: outcome.error };
  }
  const { proposals, discarded } = validateExtraction({ items: outcome.items }, doc.textContent, doc.title);
  const find = deps.findProduct ?? findProductByName;

  const prepared: { proposal: ValidProposal; payload: unknown; problem: string | null }[] = [];
  for (const proposal of proposals) {
    if (proposal.kind === "ASSOCIATION") {
      const stored = await resolveAssociation(proposal.payload, find);
      prepared.push({ proposal, payload: stored, problem: associationProblem(stored) });
    } else {
      prepared.push({ proposal, payload: proposal.payload, problem: null });
    }
  }

  // Une relecture ne rouvre pas ce qui est déjà tranché : on ne recrée pas une proposition identique à une acceptée ou refusée.
  const decided = await prisma.knowledgeProposal.findMany({ where: { documentId: id, status: { in: ["ACCEPTED", "REJECTED"] } }, select: { title: true } });
  const decidedTitles = new Set(decided.map((row) => normalizeText(row.title)));
  const fresh = prepared.filter((item) => !decidedTitles.has(normalizeText(item.proposal.title)));

  await prisma.$transaction([
    prisma.knowledgeProposal.deleteMany({ where: { documentId: id, status: "PENDING" } }),
    ...(fresh.length
      ? [prisma.knowledgeProposal.createMany({ data: fresh.map((item) => ({ documentId: id, kind: item.proposal.kind, title: item.proposal.title.slice(0, 200), payload: item.payload as never, sourceQuote: item.proposal.quote, problem: item.problem })) })]
      : []),
    prisma.knowledgeDocument.update({ where: { id }, data: { status: "ANALYSED", analysisError: null, analysedAt: new Date(), analysisModel: outcome.model, discardedCount: discarded.length } }),
  ]);
  await recordAudit({ action: "knowledge.document_analysed", entityType: "KnowledgeDocument", entityId: id, platformAdminId: admin.id, metadata: { model: outcome.model, parts: outcome.parts, proposals: fresh.length, discarded: discarded.length } });
  return { ok: true, proposals: fresh.length, discarded: discarded.length };
}

export type { KnowledgeDocumentView, KnowledgeProposalView } from "@/server/services/knowledge-types";
import type { KnowledgeDocumentView, KnowledgeProposalView } from "@/server/services/knowledge-types";

export async function listKnowledge(): Promise<KnowledgeDocumentView[]> {
  const docs = await prisma.knowledgeDocument.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true, title: true, sourceType: true, fileName: true, sizeBytes: true, note: true, status: true, analysisError: true, analysedAt: true, discardedCount: true, createdByName: true, createdAt: true, textContent: true,
      proposals: { orderBy: { createdAt: "asc" }, select: { id: true, kind: true, title: true, status: true, problem: true, sourceQuote: true, payload: true, decidedByName: true, decidedAt: true } },
    },
  });
  return docs.map((doc) => ({
    id: doc.id, title: doc.title, sourceType: doc.sourceType, fileName: doc.fileName, sizeBytes: doc.sizeBytes, note: doc.note, status: doc.status, analysisError: doc.analysisError, analysedAt: doc.analysedAt, discardedCount: doc.discardedCount, createdByName: doc.createdByName, createdAt: doc.createdAt,
    excerpt: doc.textContent.slice(0, 400),
    proposals: doc.proposals.map((p) => ({ id: p.id, kind: p.kind as "ASSOCIATION" | "RULE", title: p.title, status: p.status as KnowledgeProposalView["status"], problem: p.problem, quote: p.sourceQuote, payload: p.payload, decidedByName: p.decidedByName, decidedAt: p.decidedAt })),
  }));
}

// ---------------------------------------------------------------------------------------------------------------
// Décider
// ---------------------------------------------------------------------------------------------------------------

/** La pharmacienne choisit elle-même un produit que le logiciel n'a pas su retrouver : l'association devient acceptable. */
export async function resolveProposalProduct(admin: Admin, id: string, which: "trigger" | "advice", product: { ean: string; name: string }): Promise<{ ok: true } | Failure> {
  const row = await prisma.knowledgeProposal.findUnique({ where: { id }, select: { kind: true, status: true, payload: true } });
  if (!row || row.kind !== "ASSOCIATION") return { ok: false, error: "Proposition introuvable." };
  if (row.status !== "PENDING") return { ok: false, error: "Cette proposition est déjà tranchée." };
  const ean = product.ean.replace(/\D/g, "");
  if (!/^\d{7,14}$/.test(ean)) return { ok: false, error: "Ce produit n'a pas de code-barres." };
  const payload = row.payload as unknown as StoredAssociation;
  const next: StoredAssociation = which === "trigger" ? { ...payload, triggerEan: ean, triggerResolvedName: product.name } : { ...payload, adviceEan: ean, adviceResolvedName: product.name };
  await prisma.knowledgeProposal.update({ where: { id }, data: { payload: next as never, problem: associationProblem(next) } });
  return { ok: true };
}

export async function decideProposal(admin: Admin, id: string, decision: "ACCEPT" | "REJECT"): Promise<{ ok: true; title: string; accepted: boolean } | Failure> {
  const row = await prisma.knowledgeProposal.findUnique({ where: { id }, select: { id: true, kind: true, title: true, status: true, payload: true, problem: true } });
  if (!row) return { ok: false, error: "Proposition introuvable." };
  if (row.status !== "PENDING") return { ok: false, error: "Cette proposition est déjà tranchée." };

  let resultRef: string | null = null;
  if (decision === "ACCEPT") {
    if (row.kind === "RULE") {
      const created = await addCustomRule(admin, row.payload);
      if (!created.ok) return created;
      resultRef = created.ruleKey;
    } else {
      const payload = row.payload as unknown as StoredAssociation;
      const problem = associationProblem(payload);
      if (problem) return { ok: false, error: problem };
      const created = await addCentralAssociation(admin, {
        trigger: payload.triggerKind === "MEDICINE" ? { kind: "MEDICINE", name: payload.triggerName } : { kind: "PRODUCT", ean: payload.triggerEan!, name: payload.triggerResolvedName ?? payload.triggerName },
        advice: { ean: payload.adviceEan!, name: payload.adviceResolvedName ?? payload.adviceName },
        sentence: payload.sentence,
      });
      if (!created.ok) return created;
      resultRef = created.id;
    }
  }
  await prisma.knowledgeProposal.update({ where: { id }, data: { status: decision === "ACCEPT" ? "ACCEPTED" : "REJECTED", resultRef, decidedAt: new Date(), decidedByAdminId: admin.id, decidedByName: admin.fullName } });
  await recordAudit({ action: "knowledge.proposal_decided", entityType: "KnowledgeProposal", entityId: id, platformAdminId: admin.id, metadata: { decision, kind: row.kind, resultRef } });
  return { ok: true, title: row.title, accepted: decision === "ACCEPT" };
}

/** Supprime le document et ses propositions en attente. Les conseils et associations déjà acceptés restent : ils ont leur propre vie dans « Conseils & associations ». */
export async function deleteDocument(admin: Admin, id: string): Promise<{ ok: true; title: string } | Failure> {
  const doc = await prisma.knowledgeDocument.findUnique({ where: { id }, select: { title: true } });
  if (!doc) return { ok: false, error: "Document introuvable." };
  await prisma.knowledgeDocument.delete({ where: { id } });
  await recordAudit({ action: "knowledge.document_deleted", entityType: "KnowledgeDocument", entityId: id, platformAdminId: admin.id, metadata: { title: doc.title } });
  return { ok: true, title: doc.title };
}
