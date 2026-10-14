import { normalizeText } from "@/core/knowledge/extraction";

/**
 * La notice officielle d'un produit conseillé, pour le bilan du patient : ses indications, sa posologie, la durée du traitement.
 *
 * Le modèle d'Anthropic LIT la notice (la notice officielle d'un médicament sur la base publique, ou la page officielle du
 * fabricant pour un complément ou un produit de parapharmacie) et en tire ces trois rubriques, chacune avec LA PHRASE de la
 * notice qui l'appuie. Ce module vérifie, sans le modèle, que chaque phrase existe mot pour mot dans le texte réellement lu :
 * une rubrique non vérifiée est écartée. Rien n'est jamais inventé ni complété. Module pur.
 */

export const LEAFLET_TOOL_NAME = "enregistrer_notice";
export const LEAFLET_FIELDS = ["indications", "posology", "duration"] as const;
export type LeafletField = (typeof LEAFLET_FIELDS)[number];
export const LEAFLET_FIELD_LABELS: Record<LeafletField, string> = { indications: "Indications", posology: "Posologie", duration: "Durée" };

const FIELD_MAX = 320;
const QUOTE_MIN = 12;
const QUOTE_MAX = 500;
/** Au-delà, le texte de la notice est coupé : la posologie et les indications sont en tête de notice. */
export const LEAFLET_TEXT_MAX = 60_000;

export const LEAFLET_SCHEMA = {
  type: "object",
  properties: {
    found: { type: "boolean", description: "Vrai seulement si le texte est bien la notice (ou la page officielle) de CE produit." },
    source_url: { type: "string", description: "Pour une recherche sur internet : l'adresse EXACTE de la page officielle lue (fabricant). Vide sinon." },
    indications: { type: "string", description: "À quoi sert le produit, en une ou deux phrases simples, fidèles à la notice. Vide si la notice ne le dit pas." },
    indications_quote: { type: "string", description: "La phrase EXACTE de la notice qui l'appuie, recopiée mot pour mot." },
    posology: { type: "string", description: "Combien et comment le prendre ou l'utiliser, pour un adulte, fidèle à la notice. Vide si absent." },
    posology_quote: { type: "string", description: "La phrase EXACTE de la notice, mot pour mot." },
    duration: { type: "string", description: "La durée du traitement ou de la cure, si la notice la donne. Vide sinon." },
    duration_quote: { type: "string", description: "La phrase EXACTE de la notice, mot pour mot." },
  },
  required: ["found"],
} as const;

export const LEAFLET_SYSTEM_PROMPT = [
  "Tu lis la notice officielle d'un produit de pharmacie (médicament sans ordonnance, complément alimentaire, dispositif ou soin) pour un bilan remis au patient par son pharmacien.",
  "Tu en tires trois rubriques : indications (à quoi il sert), posologie (combien, comment) et durée du traitement ou de la cure.",
  "Règles absolues :",
  "- Uniquement ce que la notice écrit. Aucune connaissance extérieure, aucune déduction, aucun conseil personnel.",
  "- Chaque rubrique remplie porte sa phrase d'appui recopiée MOT POUR MOT depuis la notice (12 à 500 caractères). Sans phrase exacte, laisse la rubrique vide.",
  "- Posologie : celle de l'adulte si la notice en donne plusieurs ; garde les limites écrites (dose maximale, intervalle).",
  "- Phrases courtes et simples, en français, sans jargon, sans nom de patient.",
  "- Si le texte n'est pas la notice de CE produit, réponds found = false.",
  "Réponds uniquement en appelant l'outil.",
].join("\n");

export const LEAFLET_SEARCH_PROMPT = [
  "Cherche sur internet la notice officielle ou la page produit OFFICIELLE du fabricant de ce produit de pharmacie (pas un site de vente ni un forum, sauf s'il reproduit la notice du fabricant).",
  "Lis-la, puis appelle l'outil avec l'adresse exacte de la page lue et les trois rubriques, chacune appuyée d'une phrase recopiée mot pour mot de cette page.",
  "Si tu ne trouves pas de page officielle fiable pour CE produit précis, réponds found = false.",
].join("\n");

export type CheckedLeaflet = {
  found: boolean;
  sourceUrl: string | null;
  fields: Partial<Record<LeafletField, string>>;
  quotes: Partial<Record<LeafletField, string>>;
  discarded: LeafletField[];
};

const clean = (value: unknown, max: number): string => (typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");

/** La phrase existe-t-elle dans la notice lue ? Accents, casse et ponctuation mis de côté. */
export function quoteInText(quote: string, text: string): boolean {
  const wanted = normalizeText(quote);
  if (wanted.length < QUOTE_MIN) return false;
  return ` ${normalizeText(text)} `.includes(` ${wanted} `);
}

/** Ce que le modèle a répondu, vérifié contre le texte de la notice : seules les rubriques appuyées d'une phrase retrouvée restent. */
export function checkLeaflet(claimed: unknown, noticeText: string): CheckedLeaflet {
  const raw = (claimed && typeof claimed === "object" ? claimed : {}) as Record<string, unknown>;
  const result: CheckedLeaflet = { found: raw.found === true, sourceUrl: null, fields: {}, quotes: {}, discarded: [] };
  const url = clean(raw.source_url, 500);
  if (/^https:\/\/[^\s]+$/.test(url)) result.sourceUrl = url;
  if (!result.found) return result;
  for (const field of LEAFLET_FIELDS) {
    const value = clean(raw[field], FIELD_MAX);
    if (!value) continue;
    const quote = clean(raw[`${field}_quote`], QUOTE_MAX);
    if (quote && quoteInText(quote, noticeText)) {
      result.fields[field] = value;
      result.quotes[field] = quote;
    } else {
      result.discarded.push(field);
    }
  }
  if (Object.keys(result.fields).length === 0) result.found = false;
  return result;
}

/** Le texte lisible d'une page HTML : sans scripts, styles ni balises, entités courantes décodées. */
export function textOfHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&rsquo;|&#8217;/gi, "'")
    .replace(/&eacute;/gi, "é")
    .replace(/&egrave;/gi, "è")
    .replace(/&agrave;/gi, "à")
    .replace(/&ccedil;/gi, "ç")
    .replace(/&ecirc;/gi, "ê")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim()
    .slice(0, LEAFLET_TEXT_MAX);
}

/** La clé d'une notice : le CIS pour un médicament (sa notice officielle), sinon le code-barres. */
export function leafletKey(input: { cisCode?: string | null; ean?: string | null }): string | null {
  if (input.cisCode && /^\d{8}$/.test(input.cisCode)) return `cis:${input.cisCode}`;
  const ean = (input.ean ?? "").replace(/\D/g, "");
  return ean.length >= 8 ? `ean:${ean}` : null;
}
