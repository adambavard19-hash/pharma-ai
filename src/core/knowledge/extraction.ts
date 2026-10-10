import { PRODUCT_CATEGORIES } from "@/config/catalog";
import { ADVICE_VOCABULARY } from "@/core/catalog/product-vocabulary";
import { CUSTOM_KINDS, CUSTOM_LIMITS, CENTRAL_SENTENCE_MAX } from "@/core/ai/central-advice-constants";
import { parseCustomRuleDefinition, type CustomRuleDefinition } from "@/core/ai/central-advice";

/**
 * La lecture d'un document déposé par la pharmacienne de PharmaBoost : ce que le modèle PEUT en tirer, et la vérification qui
 * empêche qu'il invente.
 *
 * Le modèle ne décide de rien. Il lit le document et PROPOSE des conseils ou des associations, chacun avec LA PHRASE du document
 * qui le justifie. Ce module vérifie, sans le modèle :
 *   - que la phrase citée existe réellement dans le document (comparaison mot à mot, accents et casse mis de côté) ;
 *   - pour une association, que le médicament (ou produit) et le produit conseillé sont nommés dans le document ;
 *   - pour un conseil, que tout respecte les mêmes règles qu'un conseil ajouté à la main (vocabulaire fermé, `{product}`, types
 *     « tolérance » ou « confort » seulement — jamais de sécurité, qui reste écrite dans le code).
 * Ce qui ne passe pas est écarté et compté. Ce qui passe attend encore le clic de la pharmacienne.
 *
 * Module pur : aucun réseau, aucune base.
 */

export const EXTRACTION_TOOL_NAME = "proposer_conseils";
export const MAX_DOCUMENT_CHARS = 150_000;
export const CHUNK_CHARS = 20_000;
export const MAX_PROPOSALS_PER_DOCUMENT = 40;
const QUOTE_MIN = 15;
const QUOTE_MAX = 400;

export const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      description: "Les conseils ou associations que le document énonce lui-même. Liste vide si le document n'en contient pas.",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["ASSOCIATION", "RULE"] },
          quote: { type: "string", description: "La phrase EXACTE du document qui justifie cette proposition, recopiée mot pour mot." },
          association: {
            type: "object",
            description: "Pour type ASSOCIATION : un médicament ou un produit en appelle un autre.",
            properties: {
              trigger_kind: { type: "string", enum: ["MEDICINE", "PRODUCT"] },
              trigger_name: { type: "string", description: "Le médicament ou produit déclencheur, tel que le document le nomme." },
              advice_product_name: { type: "string", description: "Le produit conseillé, tel que le document le nomme." },
              sentence: { type: "string", description: "Ce que le pharmacien dit, seulement si le document l'écrit. Sinon vide." },
            },
            required: ["trigger_kind", "trigger_name", "advice_product_name"],
          },
          rule: {
            type: "object",
            description: "Pour type RULE : un conseil de tolérance ou de confort pour une famille de médicaments.",
            properties: {
              title: { type: "string" },
              kind: { type: "string", enum: [...CUSTOM_KINDS] },
              atc_prefixes: { type: "array", items: { type: "string" } },
              therapeutic_classes: { type: "array", items: { type: "string" } },
              category: { type: "string", enum: [...PRODUCT_CATEGORIES] },
              matching_tags: { type: "array", items: { type: "string", enum: [...ADVICE_VOCABULARY] } },
              question: { type: "string" },
              short_reason: { type: "string", description: "Pourquoi ce conseil, en une ligne ; {drug} remplace le médicament." },
              counter_script: { type: "string", description: "Ce que dit le pharmacien ; {product} OBLIGATOIRE." },
              patient_reason: { type: "string" },
              safety_notes: { type: "array", items: { type: "string" } },
            },
            required: ["title", "kind", "category", "matching_tags", "short_reason", "counter_script"],
          },
        },
        required: ["type", "quote"],
      },
    },
  },
  required: ["items"],
} as const;

export const EXTRACTION_SYSTEM_PROMPT = [
  "Tu aides la pharmacienne qui relit les conseils de PharmaBoost, un logiciel de conseil au comptoir d'officine.",
  "On te donne un document qu'elle a déposé. Tu en tires, SI ET SEULEMENT SI le document les énonce explicitement, des propositions de conseils ou d'associations de produits.",
  "",
  "Règles absolues :",
  "- N'ajoute AUCUNE connaissance médicale qui ne soit pas écrite dans le document. Ne complète pas, ne déduis pas, ne généralise pas.",
  "- Chaque proposition porte une `quote` : la phrase exacte du document qui la justifie, recopiée mot pour mot (15 à 400 caractères). Si tu ne peux pas citer, ne propose pas.",
  "- ASSOCIATION : le document dit qu'un médicament ou un produit appelle un autre produit. Nomme-les comme le document les nomme.",
  "- RULE : seulement un conseil de TOLÉRANCE (un effet attendu d'un traitement) ou de CONFORT (un inconfort possible), pour une famille de médicaments que le document nomme. Les codes ATC ne sont donnés que s'ils sont certains ; sinon la classe thérapeutique, avec les mots du document.",
  "- JAMAIS de contre-indication, d'interaction, de posologie ou de règle de sécurité : elles restent écrites dans le logiciel et ne se proposent pas. Ignore-les.",
  "- Les étiquettes (`matching_tags`) et la catégorie sont prises dans les listes fournies par l'outil ; n'en invente pas.",
  "- Aucune donnée de patient : si le document en contient, ignore ces passages.",
  "- En cas de doute, ne propose pas. Une liste vide est une bonne réponse.",
  "Réponds uniquement en appelant l'outil.",
].join("\n");

export function buildExtractionUserPrompt(input: { title: string; note: string | null; text: string; part: number; parts: number }): string {
  return [
    `Document : « ${input.title} »${input.parts > 1 ? ` (partie ${input.part} sur ${input.parts})` : ""}`,
    input.note ? `Ce que la pharmacienne précise : ${input.note}` : null,
    "",
    "Contenu du document :",
    "<<<",
    input.text,
    ">>>",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

/** Découpe un long texte en parties lisibles d'un coup, aux fins de paragraphes quand c'est possible. */
export function chunkText(text: string, size: number = CHUNK_CHARS): string[] {
  const chunks: string[] = [];
  let rest = text.trim();
  while (rest.length > size) {
    const window = rest.slice(0, size);
    const cut = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf("\n"), window.lastIndexOf(". "));
    const at = cut > size * 0.5 ? cut + 1 : size;
    chunks.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

/** Texte comparable : sans accents, en minuscules, ponctuation et espaces réduits à un espace. */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function quoteIsInDocument(quote: string, documentText: string): boolean {
  const wanted = normalizeText(quote);
  if (wanted.length < QUOTE_MIN) return false;
  return ` ${normalizeText(documentText)} `.includes(` ${wanted} `);
}

/** Un nom cité est « dans le document » quand tous ses mots significatifs le sont (un nom de produit s'écrit parfois dans un autre ordre). */
export function nameIsInDocument(name: string, documentText: string): boolean {
  const words = normalizeText(name).split(" ").filter((word) => word.length >= 3);
  if (words.length === 0) return false;
  const haystack = ` ${normalizeText(documentText)} `;
  return words.every((word) => haystack.includes(` ${word}`));
}

export type ProposedAssociation = { triggerKind: "MEDICINE" | "PRODUCT"; triggerName: string; adviceName: string; sentence: string | null };
export type ValidProposal =
  | { kind: "RULE"; title: string; quote: string; payload: CustomRuleDefinition }
  | { kind: "ASSOCIATION"; title: string; quote: string; payload: ProposedAssociation };
export type Discarded = { reason: string };

const text = (value: unknown): string => (typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim() : "");
const list = (value: unknown): string[] => (Array.isArray(value) ? value.map(text).filter(Boolean) : []);

/** Vérifie ce que le modèle a répondu. Il ne reste que des propositions citées, présentes dans le document et conformes. */
export function validateExtraction(claimed: unknown, documentText: string, documentTitle: string): { proposals: ValidProposal[]; discarded: Discarded[] } {
  const proposals: ValidProposal[] = [];
  const discarded: Discarded[] = [];
  const items = claimed && typeof claimed === "object" && Array.isArray((claimed as { items?: unknown }).items) ? ((claimed as { items: unknown[] }).items as Record<string, unknown>[]) : [];
  const seen = new Set<string>();

  for (const item of items) {
    const quote = text(item?.quote);
    if (quote.length < QUOTE_MIN || quote.length > QUOTE_MAX) {
      discarded.push({ reason: "citation absente ou de longueur inadaptée" });
      continue;
    }
    if (!quoteIsInDocument(quote, documentText)) {
      discarded.push({ reason: "la citation n'existe pas dans le document" });
      continue;
    }

    if (item.type === "ASSOCIATION") {
      const raw = (item.association ?? {}) as Record<string, unknown>;
      const triggerKind = raw.trigger_kind === "PRODUCT" ? "PRODUCT" : raw.trigger_kind === "MEDICINE" ? "MEDICINE" : null;
      const triggerName = text(raw.trigger_name);
      const adviceName = text(raw.advice_product_name);
      const sentence = text(raw.sentence) || null;
      if (!triggerKind || triggerName.length < 2 || adviceName.length < 2) {
        discarded.push({ reason: "association incomplète" });
        continue;
      }
      if (!nameIsInDocument(triggerName, documentText) || !nameIsInDocument(adviceName, documentText)) {
        discarded.push({ reason: "un nom cité n'est pas écrit dans le document" });
        continue;
      }
      if (sentence && sentence.length > CENTRAL_SENTENCE_MAX) {
        discarded.push({ reason: "phrase trop longue" });
        continue;
      }
      const key = `A|${normalizeText(triggerName)}|${normalizeText(adviceName)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      proposals.push({ kind: "ASSOCIATION", title: `${triggerName} → ${adviceName}`, quote, payload: { triggerKind, triggerName, adviceName, sentence } });
    } else if (item.type === "RULE") {
      const raw = (item.rule ?? {}) as Record<string, unknown>;
      const parsed = parseCustomRuleDefinition({
        title: raw.title,
        kind: raw.kind,
        atcPrefixes: list(raw.atc_prefixes),
        therapeuticClasses: list(raw.therapeutic_classes),
        category: raw.category,
        matchingTags: list(raw.matching_tags),
        question: raw.question,
        shortReason: raw.short_reason,
        counterScript: raw.counter_script,
        patientReason: raw.patient_reason,
        source: `Document déposé : ${documentTitle}`.slice(0, CUSTOM_LIMITS.source),
        safetyNotes: list(raw.safety_notes),
      });
      if (!parsed.ok) {
        discarded.push({ reason: parsed.error });
        continue;
      }
      const key = `R|${normalizeText(parsed.value.title)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      proposals.push({ kind: "RULE", title: parsed.value.title, quote, payload: parsed.value });
    } else {
      discarded.push({ reason: "type de proposition inconnu" });
    }
    if (proposals.length >= MAX_PROPOSALS_PER_DOCUMENT) break;
  }
  return { proposals, discarded };
}
