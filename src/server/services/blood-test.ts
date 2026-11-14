import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/server/db/client";
import { getEnv } from "@/config/env";
import type { TenantScope } from "@/server/db/tenant";
import { recordAudit } from "@/server/audit/log";
import { BLOOD_SCHEMA, BLOOD_SYSTEM_PROMPT, BLOOD_TOOL_NAME, BLOOD_USER_PROMPT, validateBloodReading, type BloodReading, type ClaimedBloodTest } from "@/core/blood-test/reading";
import { BLOOD_RULES, BLOOD_RULE_PREFIX, bloodRuleKey } from "@/core/blood-test/rules";
import { productFitsRule, proposeForBloodTest, type BloodProduct, type BloodProposal } from "@/core/blood-test/propose";

/**
 * Prise de sang → compléments sans ordonnance (fondateur, 14 nov. 2026).
 *
 * RIEN N'EST ENREGISTRÉ (pas d'hébergement HDS) : l'image est lue en mémoire, transmise au modèle de vision avec la même
 * autorisation que les ordonnances (`OCR_SEND_IMAGES_EXTERNALLY`), puis oubliée. Ni l'image, ni les valeurs, ni le résultat
 * ne vont en base ; le journal ne garde qu'un compte (combien de valeurs hors normes), sans aucune donnée.
 */

const SUPPORTED = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"]);
export const BLOOD_MAX_BYTES = 10 * 1024 * 1024;

export function bloodReadingAvailable(): boolean {
  const env = getEnv();
  return env.OCR_PROVIDER === "anthropic" && Boolean(env.ANTHROPIC_API_KEY) && Boolean(env.OCR_SEND_IMAGES_EXTERNALLY);
}

/** Lit le compte rendu. Jamais de stockage : les octets ne vivent que le temps de l'appel. */
export async function readBloodTest(file: { bytes: Uint8Array; mimeType: string }): Promise<BloodReading> {
  if (!bloodReadingAvailable()) return { ok: false, error: "La lecture automatique n'est pas activée sur ce serveur." };
  if (!file.bytes.length) return { ok: false, error: "Le fichier est vide." };
  if (file.bytes.length > BLOOD_MAX_BYTES) return { ok: false, error: "Le fichier dépasse 10 Mo." };
  if (!SUPPORTED.has(file.mimeType)) return { ok: false, error: "Format non pris en charge : photo (JPEG, PNG, WEBP) ou PDF." };
  const env = getEnv();
  const data = Buffer.from(file.bytes).toString("base64");
  const attachment =
    file.mimeType === "application/pdf"
      ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data } }
      : { type: "image" as const, source: { type: "base64" as const, media_type: file.mimeType as "image/jpeg", data } };
  try {
    const response = await new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }).messages.create({
      model: env.OCR_MODEL,
      max_tokens: 4000,
      system: [{ type: "text", text: BLOOD_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: [attachment, { type: "text", text: BLOOD_USER_PROMPT }] }],
      tools: [{ name: BLOOD_TOOL_NAME, description: "Enregistre les analyses hors normes recopiées du compte rendu.", input_schema: BLOOD_SCHEMA as never, strict: true } as never],
      tool_choice: { type: "tool", name: BLOOD_TOOL_NAME },
    } as never);
    const block = (response as { content: { type: string; name?: string; input?: unknown }[] }).content.find((item) => item.type === "tool_use" && item.name === BLOOD_TOOL_NAME);
    return validateBloodReading(block?.input as ClaimedBloodTest | undefined);
  } catch (error) {
    console.error("[prise-de-sang] lecture impossible", error instanceof Error ? error.message : error);
    return { ok: false, error: "La lecture automatique a échoué. Réessayez avec une photo plus nette, bien à plat." };
  }
}

/** Les règles « prise de sang » validées par Adam ou Donna (Console → Conseils), à leur version courante. */
export async function validatedBloodRuleKeys(): Promise<Set<string>> {
  const rows = await prisma.centralAdviceRule.findMany({ where: { ruleKey: { startsWith: BLOOD_RULE_PREFIX } }, select: { ruleKey: true, status: true, ruleVersion: true } });
  const keys = new Set<string>();
  for (const rule of BLOOD_RULES) {
    const row = rows.find((candidate) => candidate.ruleKey === bloodRuleKey(rule));
    if (row?.status === "VALIDATED" && row.ruleVersion === rule.version) keys.add(bloodRuleKey(rule));
  }
  return keys;
}

/**
 * Les produits du stock que les règles « prise de sang » peuvent proposer : parapharmacie, et médicaments dont les conditions
 * de délivrance sont LUES et vides. Un produit de l'officine portant un code de médicament (3400…) inconnu du catalogue
 * national est écarté : on ne propose jamais un médicament dont on ne sait pas s'il est sur ordonnance.
 */
export async function loadBloodProducts(scope: TenantScope): Promise<BloodProduct[]> {
  const [products, drugs] = await Promise.all([
    prisma.product.findMany({
      where: { pharmacyId: scope.pharmacyId, deletedAt: null, isActive: true },
      select: { id: true, name: true, ean: true, imageUrl: true, salePriceCents: true, stockItem: { select: { quantity: true } } },
    }),
    prisma.pharmacyDrugStock.findMany({
      where: { pharmacyId: scope.pharmacyId, presentation: { specialty: { prescriptionConditions: { none: {} } } } },
      select: { id: true, quantity: true, priceCents: true, presentation: { select: { label: true, imageUrl: true, specialty: { select: { name: true } } } } },
    }),
  ]);
  const cips = products.map((product) => product.ean).filter((ean): ean is string => Boolean(ean?.startsWith("3400")));
  const conditions = new Map<string, number>();
  if (cips.length > 0) {
    const presentations = await prisma.drugPresentation.findMany({ where: { cip13: { in: cips } }, select: { cip13: true, specialty: { select: { _count: { select: { prescriptionConditions: true } } } } } });
    for (const presentation of presentations) conditions.set(presentation.cip13, presentation.specialty._count.prescriptionConditions);
  }
  const fromCatalog: BloodProduct[] = products
    .filter((product) => !product.ean?.startsWith("3400") || conditions.get(product.ean) === 0)
    .map((product) => ({ id: product.id, name: product.name, imageUrl: product.imageUrl, salePriceCents: product.salePriceCents, stockQuantity: product.stockItem?.quantity ?? 0, prescriptionConditions: [], isActive: true }));
  const fromDrugs: BloodProduct[] = drugs.map((line) => ({
    id: `drug:${line.id}`,
    name: `${line.presentation.specialty.name}`,
    imageUrl: line.presentation.imageUrl,
    salePriceCents: line.priceCents ?? 0,
    stockQuantity: line.quantity,
    prescriptionConditions: [],
    isActive: true,
  }));
  return [...fromCatalog, ...fromDrugs];
}

/** Au comptoir : lecture + propositions dans le stock de CETTE pharmacie. Seules les règles validées proposent un produit. */
export async function adviseBloodTestAtCounter(scope: TenantScope, file: { bytes: Uint8Array; mimeType: string }): Promise<{ ok: true; proposals: BloodProposal[] } | { ok: false; error: string }> {
  if (scope.isDemo) return { ok: false, error: "Officine de démonstration : aucune image n'est transmise pour lecture." };
  const reading = await readBloodTest(file);
  if (!reading.ok) return reading;
  const [validated, products] = await Promise.all([validatedBloodRuleKeys(), loadBloodProducts(scope)]);
  const proposals = proposeForBloodTest({ findings: reading.findings, validatedRuleKeys: validated, products: products.filter((product) => product.stockQuantity > 0) });
  await recordAudit({ action: "blood_test.read", entityType: "BloodTest", pharmacyId: scope.pharmacyId, userId: scope.userId, metadata: { outOfRange: reading.findings.length, advised: proposals.filter((p) => p.kind === "ADVICE").length } }).catch(() => undefined);
  return { ok: true, proposals };
}

/** Dans l'appli des patients : lecture + règles validées, sans stock (la pharmacie choisira la référence). */
export async function adviseBloodTestForPatient(file: { bytes: Uint8Array; mimeType: string }): Promise<{ ok: true; proposals: BloodProposal[] } | { ok: false; error: string }> {
  const reading = await readBloodTest(file);
  if (!reading.ok) return reading;
  const proposals = proposeForBloodTest({ findings: reading.findings, validatedRuleKeys: await validatedBloodRuleKeys(), products: [] });
  return { ok: true, proposals };
}

// --- Console → Conseils ----------------------------------------------------------------------------------------------

export type BloodRuleView = { key: string; title: string; version: string; status: "ACTIVE" | "VALIDATED" | "REMOVED"; outdated: boolean; decidedByName: string | null; decidedAt: string | null; markers: string[]; pharmacistSentence: string; patientSentence: string; cautions: string[] };

export async function listBloodRules(): Promise<BloodRuleView[]> {
  const rows = await prisma.centralAdviceRule.findMany({ where: { ruleKey: { startsWith: BLOOD_RULE_PREFIX } }, select: { ruleKey: true, status: true, ruleVersion: true, decidedByName: true, decidedAt: true } });
  return BLOOD_RULES.map((rule) => {
    const row = rows.find((candidate) => candidate.ruleKey === bloodRuleKey(rule));
    const outdated = row?.status === "VALIDATED" && row.ruleVersion !== rule.version;
    return {
      key: bloodRuleKey(rule),
      title: rule.title,
      version: rule.version,
      status: outdated ? "ACTIVE" : ((row?.status as BloodRuleView["status"]) ?? "ACTIVE"),
      outdated,
      decidedByName: row?.decidedByName ?? null,
      decidedAt: row?.decidedAt?.toISOString() ?? null,
      markers: rule.markers,
      pharmacistSentence: rule.pharmacistSentence,
      patientSentence: rule.patientSentence,
      cautions: rule.cautions,
    };
  });
}

export async function decideBloodRule(admin: { id: string; fullName: string }, ruleKey: string, decision: "VALIDATE" | "REMOVE" | "RESTORE"): Promise<{ ok: true; title: string } | { ok: false; error: string }> {
  const rule = BLOOD_RULES.find((candidate) => bloodRuleKey(candidate) === ruleKey);
  if (!rule) return { ok: false, error: "Règle inconnue." };
  if (decision === "RESTORE") {
    await prisma.centralAdviceRule.deleteMany({ where: { ruleKey } });
  } else {
    const data = { status: decision === "VALIDATE" ? ("VALIDATED" as const) : ("REMOVED" as const), ruleVersion: rule.version, decidedAt: new Date(), decidedByAdminId: admin.id, decidedByName: admin.fullName };
    await prisma.centralAdviceRule.upsert({ where: { ruleKey }, create: { ruleKey, source: "BUILT_IN", ...data }, update: data });
  }
  await recordAudit({ action: "central_advice.rule_decided", entityType: "AdviceRule", entityId: ruleKey, platformAdminId: admin.id, metadata: { ruleKey, decision, ruleVersion: rule.version } });
  return { ok: true, title: rule.title };
}

export { productFitsRule };
