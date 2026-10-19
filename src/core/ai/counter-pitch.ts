/**
 * LE CONSEIL PRÊT À DIRE AU COMPTOIR (18 oct. 2026) — d'après le déroulé de Kontoir que le fondateur veut reprendre : pour chaque
 * conseil de la bannière, DEUX questions à poser au patient avant de proposer le produit, puis le conseil en DEUX phrases.
 *
 * Le modèle Anthropic les rédige pour un conseil donné (le médicament ou la famille qui le déclenche, le produit conseillé, la raison
 * écrite par la pharmacienne). Ce module : le schéma de l'outil, la consigne, la question, et le VALIDATEUR — une réponse qui ne
 * passe pas n'est jamais montrée. Ces textes sont pour le pharmacien, au comptoir : le médicament peut y être nommé.
 */

/**
 * Une réponse du patient à une question (fondateur, 18 oct. 2026 : « que les questions soient cliquables pour proposer d'autres
 * conseils plus précis ») : ce qu'elle change, en une phrase, et parfois un produit PLUS PRÉCIS — choisi uniquement parmi les
 * produits en stock de la pharmacie qu'on lui a donnés (`ean`), jamais inventé.
 */
export type PitchAnswer = { ask: 0 | 1; label: string; say: string; ean: string | null };

export type CounterPitch = { ask: [string, string]; pitch: string; answers: PitchAnswer[] };

export type PitchCandidate = { ean: string; name: string };

export type CounterPitchRequest = {
  trigger: string;
  product: { name: string; brand?: string | null; category?: string | null; tags?: string[] };
  reason?: string | null;
  /** Les autres produits en stock de la pharmacie, du même rayon : les seuls qu'une réponse peut proposer. */
  candidates?: PitchCandidate[];
};

export const PITCH_TOOL_NAME = "conseil_comptoir";

export const PITCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ask", "pitch", "answers"],
  properties: {
    ask: { type: "array", description: "Exactement deux questions de comptoir, propres à ce déclencheur et à ce produit (14 mots au plus chacune) : la 1re cerne le besoin concret, la 2e change la conduite (signe d'alerte, précaution réelle du produit, ou choix d'un produit plus précis).", items: { type: "string" } },
    pitch: { type: "string", description: "Le conseil en deux phrases (40 mots au plus en tout), à dire au patient : pourquoi ce produit avec son traitement, et comment l'utiliser." },
    answers: {
      type: "array",
      description: "Pour CHAQUE question, deux ou trois réponses possibles du patient (donc quatre à six en tout).",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "label", "say", "ean"],
        properties: {
          question: { type: "integer", enum: [1, 2], description: "La question à laquelle cette réponse se rapporte." },
          label: { type: "string", description: "La réponse du patient, 1 à 4 mots, qui répond DIRECTEMENT à sa question (« Oui, ça tire », « Non », « Surtout la nuit »)." },
          say: { type: "string", description: "Ce que le pharmacien fait ou dit alors, une phrase de 22 mots au plus." },
          ean: { type: ["string", "null"], description: "Le code d'un produit de la liste « Autres produits en stock » qui REMPLACE le produit conseillé parce qu'il répond mieux au MÊME besoin pour cette réponse (version enfant, formule plus riche, sans conservateur…), ou null. Jamais un produit pour un autre besoin, jamais un produit « en plus »." },
        },
      },
    },
  },
} as const;

export const PITCH_SYSTEM_PROMPT = [
  "Tu aides un pharmacien d'officine français au comptoir. Un patient vient d'acheter un médicament (le déclencheur) ; le pharmacien veut lui proposer un produit en accompagnement. Tu écris ce qu'il a sous les yeux pendant les trente secondes de l'échange.",
  "",
  "1) DEUX questions à poser au patient AVANT de proposer le produit. Ce sont de vraies questions de comptoir, propres à CE déclencheur et à CE produit, jamais génériques :",
  "   - la question 1 cerne le BESOIN concret : le symptôme, depuis quand, à quel moment, à quelle fréquence, chez qui (« Les brûlures arrivent-elles surtout après les repas ou en position allongée ? ») ;",
  "   - la question 2 change la CONDUITE : un signe d'alerte qui impose d'orienter vers le médecin, OU une précaution réelle de ce produit (grossesse, enfant, interaction, régime sans sel…), OU un choix qui oriente vers un produit plus précis de la liste (forme, goût, âge, peau). Ne pose « Êtes-vous enceinte ? » que si ce produit a vraiment une précaution pendant la grossesse.",
  "   Chaque question tient en 14 mots au plus et se comprend sans contexte.",
  "",
  "2) Pour CHAQUE question, deux ou trois réponses du patient. RÈGLE ABSOLUE : chaque réponse répond directement et naturellement à SA question (à une question oui/non, on répond oui ou non, éventuellement nuancé ; à une question « quand ? », un moment). Jamais une préférence ou une remarque sans rapport avec la question posée. Pour chaque réponse, ce que fait le pharmacien :",
  "   - confirmer et proposer le produit conseillé ;",
  "   - ou proposer un produit PLUS PRÉCIS choisi SEULEMENT dans la liste « Autres produits en stock », par son code, s'il REMPLACE le produit conseillé pour le même besoin (jamais un produit en plus, jamais un autre besoin) — sinon ean null ;",
  "   - ou ne rien proposer et orienter vers le médecin quand la réponse est un signe d'alerte.",
  "",
  "3) Le conseil en deux phrases, au « vous », à dire au patient : pourquoi ce produit avec son traitement, puis comment l'utiliser concrètement (moment, durée, geste).",
  "",
  "Exemple pour le déclencheur GAVISCON et le produit NEOBIANACID :",
  "   Q1 « Les brûlures reviennent-elles surtout après les repas ou la nuit ? » → « Après les repas » : le pharmacien propose le produit, à prendre après le repas ; « Surtout la nuit » : il le propose au coucher et conseille de surélever la tête du lit ; « Presque tout le temps » : il conseille d'en parler au médecin.",
  "   Q2 « Avez-vous du mal à avaler, ou maigrissez-vous sans raison ? » → « Non » : il propose le produit ; « Oui » : il ne propose rien et oriente vers le médecin sans attendre.",
  "",
  "Style : oral, simple, chaleureux, professionnel. Français impeccable. Pas de jargon.",
  "Interdit : promesse de guérison, chiffre de résultat, posologie du médicament prescrit, diagnostic. Le pharmacien garde la décision.",
  `Réponds uniquement en appelant l'outil « ${PITCH_TOOL_NAME} ».`,
].join("\n");

export function buildPitchPrompt(request: CounterPitchRequest): string {
  return [
    `Déclencheur (médicament scanné ou famille) : ${request.trigger}`,
    `Produit conseillé : ${request.product.name}${request.product.brand ? ` (${request.product.brand})` : ""}`,
    request.product.category ? `Rayon : ${request.product.category}` : null,
    request.product.tags?.length ? `Mots-clés : ${request.product.tags.slice(0, 10).join(", ")}` : null,
    request.reason ? `Pourquoi la pharmacienne l'a associé : ${request.reason.slice(0, 400)}` : null,
    request.candidates?.length ? `Autres produits en stock (code — nom) :\n${request.candidates.slice(0, 20).map((c) => `${c.ean} — ${c.name}`).join("\n")}` : "Autres produits en stock : aucun (ean toujours null).",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

const clean = (value: unknown) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");
const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
const FORBIDDEN = /\b(guérit|guerit|guérir|guerir|miracle|garanti|100 ?%|sans aucun risque)\b/i;

/** Les réponses : deux ou trois par question, courtes, sûres, et un produit seulement s'il est dans la liste donnée. Sinon, aucune. */
function validateAnswers(input: unknown, candidates: PitchCandidate[], problems: string[]): PitchAnswer[] {
  const allowed = new Set(candidates.map((c) => c.ean));
  const answers: PitchAnswer[] = [];
  for (const item of Array.isArray(input) ? input : []) {
    const a = (typeof item === "object" && item !== null ? item : {}) as Record<string, unknown>;
    const ask = a.question === 1 ? 0 : a.question === 2 ? 1 : null;
    const label = clean(a.label);
    const say = clean(a.say);
    if (ask === null || !label || !say || words(label) > 5 || words(say) > 28 || FORBIDDEN.test(`${label} ${say}`)) continue;
    const ean = typeof a.ean === "string" && allowed.has(a.ean.trim()) ? a.ean.trim() : null;
    if (answers.filter((x) => x.ask === ask).length < 3) answers.push({ ask, label, say, ean });
  }
  const complete = [0, 1].every((ask) => answers.filter((x) => x.ask === ask).length >= 2);
  if (!complete) {
    problems.push("réponses incomplètes");
    return [];
  }
  return answers;
}

export function validatePitch(input: unknown, candidates: PitchCandidate[] = []): { pitch: CounterPitch | null; problems: string[] } {
  const raw = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const problems: string[] = [];
  const ask = (Array.isArray(raw.ask) ? raw.ask : []).map(clean).filter(Boolean).slice(0, 2).map((q) => (q.endsWith("?") ? q : `${q.replace(/[.!]$/, "")} ?`));
  if (ask.length < 2) problems.push("moins de deux questions");
  if (ask.some((q) => words(q) > 18)) problems.push("question trop longue");
  const pitch = clean(raw.pitch);
  if (!pitch) problems.push("conseil vide");
  else if (words(pitch) > 55) problems.push("conseil trop long");
  if ([...ask, pitch].some((text) => FORBIDDEN.test(text))) problems.push("formulation interdite");
  if (problems.length) return { pitch: null, problems };
  // Les réponses sont un plus : incomplètes, elles sont écartées, et les questions restent.
  const answers = validateAnswers(raw.answers, candidates, problems);
  return { pitch: { ask: [ask[0], ask[1]], pitch, answers }, problems };
}
