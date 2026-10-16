/**
 * LA FICHE PATIENT D'UN PRODUIT CONSEILLÉ (17 oct. 2026) — ce que le bilan e-mail dit de chaque produit vendu.
 *
 * Le fondateur, sur un vrai bilan envoyé (LIPIKAR SYNDET AP+ pour un gel antifongique, rien d'autre que le nom) : « on ne
 * comprend pas » — il faut dire des choses importantes sur le produit, sans trop de texte, et SURTOUT le lien entre ce produit et
 * le traitement d'origine. Le modèle Anthropic rédige donc, pour un produit et le médicament qui l'a appelé :
 *  - `link` : pourquoi ce produit accompagne le traitement — sans nommer le médicament, sa substance ni une maladie (un e-mail peut
 *    être lu par d'autres : le secret professionnel s'applique), mais en disant clairement à quoi le produit sert pendant ce traitement ;
 *  - `keyPoints` : trois points clés courts, chacun avec une icône d'une liste fermée ;
 *  - `usage` : deux gestes pour bien l'utiliser ;
 *  - `tip` : un « bon à savoir » facultatif.
 *
 * Module pur : le schéma de l'outil, la consigne, la question et le VALIDATEUR (longueurs, aucun nom du traitement, aucune promesse
 * de guérison ni chiffre de résultat). Une fiche qui ne passe pas le validateur n'est jamais envoyée : le bilan garde alors le
 * nom du produit et ce que la pharmacie sait déjà.
 */

export const CARD_ICONS = ["soin", "feuille", "coche", "astuce", "pourquoi", "date"] as const;
export type CardIcon = (typeof CARD_ICONS)[number];

export type PatientCard = {
  link: string;
  keyPoints: { icon: CardIcon; title: string; text: string }[];
  usage: string[];
  tip: string | null;
};

export type PatientCardRequest = {
  product: { name: string; brand?: string | null; category?: string | null; tags?: string[]; description?: string | null; claims?: string[]; precautions?: string[] };
  /** Le médicament qui a appelé le conseil (nom de la boîte), sa famille si on la connaît, et la raison du conseil pour le pharmacien. */
  treatment: { drug: string; family?: string | null; reason?: string | null };
};

export const CARD_TOOL_NAME = "fiche_patient";

export const CARD_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["link", "keyPoints", "usage", "tip"],
  properties: {
    link: { type: "string", description: "Une phrase (25 mots au plus) : pourquoi ce produit accompagne le traitement, à quoi il sert pendant ce traitement. Commence par « Votre traitement » ou « Pendant votre traitement ». Ne nomme ni le médicament, ni sa substance, ni une maladie." },
    keyPoints: {
      type: "array",
      description: "Exactement trois points clés.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["icon", "title", "text"],
        properties: {
          icon: { type: "string", enum: [...CARD_ICONS] },
          title: { type: "string", description: "1 à 3 mots." },
          text: { type: "string", description: "10 mots au plus." },
        },
      },
    },
    usage: { type: "array", description: "Deux gestes au plus.", items: { type: "string", description: "Un geste concret, 14 mots au plus." } },
    tip: { type: ["string", "null"], description: "Un « bon à savoir » utile et sûr, 18 mots au plus, ou null." },
  },
} as const;

export const CARD_SYSTEM_PROMPT = [
  "Tu rédiges, pour le bilan e-mail qu'une pharmacie française envoie à un patient après une vente, la fiche courte d'un produit conseillé par le pharmacien.",
  "Ton : simple, chaleureux, professionnel, au « vous ». Phrases courtes. Français impeccable.",
  "Tu parles du PRODUIT tel qu'il est vendu en pharmacie (tu peux t'appuyer sur ce que tu sais de ce produit et de sa gamme), et de son rôle aux côtés du traitement.",
  "RÈGLES STRICTES :",
  "- Ne nomme JAMAIS le médicament, sa substance, sa classe exacte, ni une maladie ou un diagnostic : dis « votre traitement ». Tu peux décrire l'effet du traitement sur le corps en termes simples (« peut dessécher la peau », « peut perturber la flore intestinale »).",
  "- Aucune promesse de guérison, aucun chiffre de résultat, aucune posologie du médicament. Pas de « guérit », « soigne », « élimine ».",
  "- Les conseils d'utilisation portent sur le PRODUIT conseillé uniquement, et restent prudents (selon la notice du produit).",
  "- Si tu ne connais pas bien le produit, reste général et vrai, à partir de son nom et de ses mots-clés.",
  `Réponds uniquement en appelant l'outil « ${CARD_TOOL_NAME} ».`,
].join("\n");

export function buildCardPrompt(request: PatientCardRequest): string {
  const p = request.product;
  return [
    `Produit conseillé : ${p.name}${p.brand ? ` (marque : ${p.brand})` : ""}`,
    p.category ? `Rayon : ${p.category}` : null,
    p.tags?.length ? `Mots-clés : ${p.tags.slice(0, 12).join(", ")}` : null,
    p.description ? `Description de la pharmacie : ${p.description.slice(0, 400)}` : null,
    p.claims?.length ? `Allégations : ${p.claims.slice(0, 6).join(" ; ")}` : null,
    p.precautions?.length ? `Précautions saisies par la pharmacie : ${p.precautions.slice(0, 4).join(" ; ")}` : null,
    "",
    `Médicament de la vente (À NE JAMAIS NOMMER dans la fiche) : ${request.treatment.drug}${request.treatment.family ? ` — famille : ${request.treatment.family}` : ""}`,
    request.treatment.reason ? `Pourquoi le pharmacien l'a conseillé (note interne) : ${request.treatment.reason}` : null,
    "",
    "Rédige la fiche : le lien avec le traitement, trois points clés, deux gestes d'utilisation, un bon à savoir.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const words = (text: string) => fold(text).split(/[^a-z]+/).filter((word) => word.length >= 5);
const clean = (value: unknown) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");
const countWords = (text: string) => text.split(/\s+/).filter(Boolean).length;

const FORM_WORDS = new Set(["comprime", "comprimes", "solution", "creme", "pommade", "buvable", "sachet", "sachets", "gelule", "gelules", "flacon", "poudre", "suspension", "injectable", "collyre", "spray", "sirop", "capsule", "capsules", "pellicule", "secable", "effervescent", "orodispersible", "lyophilisat", "ampoule", "ampoules", "adultes", "enfants", "nourrissons", "cutane", "cutanee"]);

/** Ce qui ne part jamais vers un patient : promesse de guérison, chiffre de résultat, renvoi à la dose du médicament. */
const FORBIDDEN = /\b(guérit|guerit|guérir|guerir|soigne|élimine|elimine|miracle|garanti|100 ?%|sans risque|remplace(?:r)? votre traitement|arrêtez|arretez|ordonnance)\b/i;

/**
 * Valide la fiche rendue par le modèle. `forbidden` : les mots du traitement (nom lu au scan, spécialité, substances) — aucun
 * ne doit paraître, sauf s'il fait partie du nom du produit conseillé. Rend la fiche nettoyée, ou `null` avec les raisons.
 */
export function validatePatientCard(input: unknown, context: { productName: string; forbidden: string[] }): { card: PatientCard | null; problems: string[] } {
  const problems: string[] = [];
  const raw = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const allowed = new Set(words(context.productName));
  // Les mots de forme (« comprimé », « sachet », « solution »…) ne désignent pas le traitement : ils peuvent paraître.
  const banned = [...new Set(context.forbidden.flatMap((text) => words(text.replace(/,[\s\S]*$/, ""))))].filter((word) => !allowed.has(word) && !FORM_WORDS.has(word));
  const check = (label: string, text: string, maxWords: number): string | null => {
    if (!text) return (problems.push(`${label} vide`), null);
    if (countWords(text) > maxWords) return (problems.push(`${label} trop long`), null);
    if (FORBIDDEN.test(text)) return (problems.push(`${label} : formulation interdite`), null);
    const folded = ` ${fold(text).replace(/[^a-z]+/g, " ")} `;
    const named = banned.find((word) => folded.includes(` ${word} `));
    if (named) return (problems.push(`${label} nomme le traitement (${named})`), null);
    return text;
  };
  const link = check("lien", clean(raw.link), 30);
  const points = Array.isArray(raw.keyPoints) ? raw.keyPoints.slice(0, 3) : [];
  const keyPoints = points
    .map((point, index) => {
      const p = (typeof point === "object" && point !== null ? point : {}) as Record<string, unknown>;
      const icon = (CARD_ICONS as readonly string[]).includes(String(p.icon)) ? (p.icon as CardIcon) : "coche";
      const title = check(`point ${index + 1} (titre)`, clean(p.title), 4);
      const text = check(`point ${index + 1}`, clean(p.text), 12);
      return title && text ? { icon, title, text } : null;
    })
    .filter((point): point is PatientCard["keyPoints"][number] => point !== null);
  const usage = (Array.isArray(raw.usage) ? raw.usage.slice(0, 2) : []).map((line, index) => check(`geste ${index + 1}`, clean(line), 16)).filter((line): line is string => line !== null);
  const tipRaw = clean(raw.tip);
  const tip = tipRaw ? check("bon à savoir", tipRaw, 22) : null;
  if (!link || keyPoints.length < 2 || usage.length === 0) {
    if (keyPoints.length < 2) problems.push("moins de deux points clés valables");
    if (usage.length === 0) problems.push("aucun geste valable");
    return { card: null, problems };
  }
  return { card: { link, keyPoints, usage, tip }, problems };
}
