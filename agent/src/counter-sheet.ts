/**
 * Le conseil « déployé » dans la bannière du comptoir (demande du fondateur, 13 oct. 2026 : « si on veut appuyer sur le
 * conseil, il doit se déployer pour regarder dessus les infos ») : le nom complet du produit, la raison complète, ce que
 * le pharmacien peut dire, les contre-indications et les conseils d'utilisation.
 *
 * Ce module ne fait que BORNER et VÉRIFIER : le contenu vient de la fiche complète du conseil de la page de vente
 * (src/core/counter/advice-sheet.ts, une seule source de vérité), jamais rédigé ici. Il sert trois fois :
 *  • le serveur borne ce qu'il envoie au poste (la charge reste petite, l'avis est relu toutes les deux secondes) ;
 *  • l'agent relit ce qu'il reçoit avant de le passer à l'île (un serveur plus ancien ou plus récent ne la casse pas) ;
 *  • l'île le relit encore avant de le dessiner.
 * Rien n'est jamais perdu en silence : un texte abrégé le dit (`cut`), une ligne écartée se compte (`more`), et la fiche
 * complète de la page de vente reste à un clic.
 *
 * Aucune dépendance (ni Node, ni React) : la page web et l'agent l'embarquent tels quels.
 */

/** Le patient est-il concerné par cette ligne (vigilance calculée pour la vente) ? Absent : sans objet. */
export type CounterSheetPatient = "CONCERNED" | "NOT_CONCERNED" | "UNKNOWN";

export type CounterSheetLine = { text: string; detail?: string; patient?: CounterSheetPatient };

export type CounterSheet = {
  /** Le nom complet du produit (la carte, elle, l'abrège). */
  name: string;
  /** Pourquoi il est proposé : les phrases de la règle, dans l'ordre où elles se lisent. */
  reasons: string[];
  /** Ce que le pharmacien peut dire au patient. Vide : rien d'écrit. */
  script: string;
  /** Contre-indications, celles qui concernent le patient d'abord. Vide : non renseignées (la bannière renvoie à la notice). */
  contraindications: CounterSheetLine[];
  /** Conseils d'utilisation. Vide (et sans description) : non renseignés. */
  usage: CounterSheetLine[];
  /** La description de la fiche produit de l'officine. */
  description: string;
  /**
   * Les effets indésirables fréquents lus dans le RCP officiel (BDPM) d'un médicament conseillé (19 oct. 2026 : la fiche de la
   * bannière montre posologie, contre-indications et effets indésirables). Absent : rien d'officiel — la bannière renvoie à la notice.
   */
  sideEffects?: string[];
  /** Les lignes écartées pour garder la bannière légère : « + 2 dans la fiche complète ». */
  more: { contraindications: number; usage: number };
  /** Un texte a été abrégé (ou une raison écartée) : la suite se lit dans la fiche complète. */
  cut: boolean;
  /**
   * Les deux questions à poser au patient avant de proposer le produit (fondateur, 18 oct. 2026, d'après Kontoir : « deux
   * questions, ça suffit »). Absent : rien de prêt pour ce conseil.
   */
  ask?: string[];
  /** Le conseil en deux phrases, à dire au patient. Absent : rien de prêt. */
  pitch?: string;
  /**
   * Les réponses possibles du patient à chaque question (fondateur, 18 oct. 2026 : questions cliquables) : ce que le pharmacien
   * fait alors, et parfois un produit plus précis de SON stock, avec prix, marge et stock. Absent : questions sans réponses.
   */
  answers?: CounterSheetAnswer[];
};

export type CounterSheetAnswer = {
  /** La question (0 ou 1). */
  ask: number;
  label: string;
  say: string;
  product?: { name: string; price?: string; margin?: string; stock?: string; quantity?: number };
};

/** Les bornes : de quoi lire au comptoir sans alourdir la commande envoyée à la fenêtre (quelques kilo-octets par conseil). */
export const COUNTER_SHEET_LIMITS = {
  name: 160,
  reasons: 3,
  reason: 280,
  script: 360,
  lines: 6,
  lineText: 140,
  lineDetail: 240,
  description: 360,
  ask: 2,
  askText: 140,
  pitch: 320,
  answers: 6,
  answerLabel: 40,
  answerSay: 200,
  answerProduct: 120,
  sideEffects: 6,
  sideEffect: 80,
} as const;

/** Ce que disent les rubriques vides, mot pour mot sur la page de vente et dans la bannière : jamais « rien à savoir ». */
export const SHEET_MISSING = {
  reasons: "La raison de ce conseil n'est pas renseignée.",
  contraindications: "Aucune contre-indication n'est renseignée dans PharmaBoost pour ce produit : reportez-vous à sa notice.",
  usage: "Aucun conseil d'utilisation n'est renseigné dans PharmaBoost pour ce produit : reportez-vous à sa notice.",
  sideEffects: "Aucun effet indésirable officiel n'est connu de PharmaBoost pour ce produit : reportez-vous à sa notice.",
} as const;

/** Les mots du patient, tels que l'écran les dit à côté d'une vigilance calculée pour la vente. */
export const SHEET_PATIENT_LABELS: Record<CounterSheetPatient, string> = {
  CONCERNED: "Concerne ce patient",
  UNKNOWN: "À vérifier avec le patient",
  NOT_CONCERNED: "Ne concerne pas ce patient",
};

const PATIENTS = new Set<CounterSheetPatient>(["CONCERNED", "NOT_CONCERNED", "UNKNOWN"]);

/** Un texte sur une ligne, borné : coupé à un espace quand c'est possible, et marqué « … ». `cut` dit s'il a été abrégé. */
export function boundText(raw: unknown, max: number): { text: string; cut: boolean } {
  const text = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  if (text.length <= max) return { text, cut: false };
  const head = text.slice(0, max - 1);
  const space = head.lastIndexOf(" ");
  return { text: `${(space > max * 0.6 ? head.slice(0, space) : head).replace(/[\s,;:.–—-]+$/, "")}…`, cut: true };
}

/**
 * Relit une fiche reçue (ou tout juste construite) : forme vérifiée, textes bornés, listes bornées. Null : ce n'est pas
 * une fiche (serveur ancien, donnée abîmée) — la carte se déploie alors sans ces rubriques, la fiche complète reste là.
 */
export function readCounterSheet(raw: unknown): CounterSheet | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const L = COUNTER_SHEET_LIMITS;
  let cut = value.cut === true;
  const take = (input: unknown, max: number) => {
    const bounded = boundText(input, max);
    if (bounded.cut) cut = true;
    return bounded.text;
  };
  const list = (input: unknown) => (Array.isArray(input) ? input : []);
  const lines = (input: unknown, previous: unknown): { lines: CounterSheetLine[]; more: number } => {
    const valid = list(input).flatMap((entry): CounterSheetLine[] => {
      if (!entry || typeof entry !== "object") return [];
      const line = entry as Record<string, unknown>;
      const text = take(line.text, L.lineText);
      if (!text) return [];
      const detail = take(line.detail, L.lineDetail);
      const patient = PATIENTS.has(line.patient as CounterSheetPatient) ? (line.patient as CounterSheetPatient) : undefined;
      return [{ text, ...(detail ? { detail } : {}), ...(patient ? { patient } : {}) }];
    });
    const already = typeof previous === "number" && Number.isInteger(previous) && previous > 0 ? Math.min(previous, 999) : 0;
    return { lines: valid.slice(0, L.lines), more: already + Math.max(0, valid.length - L.lines) };
  };
  const reasons = list(value.reasons).map((reason) => take(reason, L.reason)).filter(Boolean);
  if (reasons.length > L.reasons) cut = true;
  const more = (value.more && typeof value.more === "object" ? value.more : {}) as Record<string, unknown>;
  const contraindications = lines(value.contraindications, more.contraindications);
  const usage = lines(value.usage, more.usage);
  return {
    name: take(value.name, L.name),
    reasons: reasons.slice(0, L.reasons),
    script: take(value.script, L.script),
    contraindications: contraindications.lines,
    usage: usage.lines,
    description: take(value.description, L.description),
    more: { contraindications: contraindications.more, usage: usage.more },
    cut,
    ...sideEffectsOf(value.sideEffects),
    ...askAndPitch(value),
  };
}

function sideEffectsOf(input: unknown): { sideEffects?: string[] } {
  const effects = (Array.isArray(input) ? input : []).map((effect) => boundText(effect, COUNTER_SHEET_LIMITS.sideEffect).text).filter(Boolean).slice(0, COUNTER_SHEET_LIMITS.sideEffects);
  return effects.length ? { sideEffects: effects } : {};
}

/** Les deux questions et le conseil en deux phrases, bornés ; pas de clé quand il n'y a rien (la commande reste courte). */
const STOCKS = new Set(["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK", "UNKNOWN"]);

function readAnswers(input: unknown, questions: number): CounterSheetAnswer[] {
  const out: CounterSheetAnswer[] = [];
  for (const item of Array.isArray(input) ? input : []) {
    if (out.length >= COUNTER_SHEET_LIMITS.answers || typeof item !== "object" || item === null) continue;
    const a = item as Record<string, unknown>;
    const ask = a.ask === 0 || a.ask === 1 ? a.ask : -1;
    const label = boundText(a.label, COUNTER_SHEET_LIMITS.answerLabel).text;
    const say = boundText(a.say, COUNTER_SHEET_LIMITS.answerSay).text;
    if (ask < 0 || ask >= questions || !label || !say) continue;
    const p = typeof a.product === "object" && a.product !== null ? (a.product as Record<string, unknown>) : null;
    const name = p ? boundText(p.name, COUNTER_SHEET_LIMITS.answerProduct).text : "";
    const product = name && p
      ? {
          name,
          ...(boundText(p.price, 16).text ? { price: boundText(p.price, 16).text } : {}),
          ...(boundText(p.margin, 16).text ? { margin: boundText(p.margin, 16).text } : {}),
          ...(typeof p.stock === "string" && STOCKS.has(p.stock) ? { stock: p.stock } : {}),
          ...(Number.isInteger(p.quantity) && (p.quantity as number) >= 0 ? { quantity: p.quantity as number } : {}),
        }
      : undefined;
    out.push({ ask, label, say, ...(product ? { product } : {}) });
  }
  return out;
}

function askAndPitch(value: Record<string, unknown>): { ask?: string[]; pitch?: string; answers?: CounterSheetAnswer[] } {
  const ask = (Array.isArray(value.ask) ? value.ask : []).map((q) => boundText(q, COUNTER_SHEET_LIMITS.askText).text).filter(Boolean).slice(0, COUNTER_SHEET_LIMITS.ask);
  const pitch = boundText(value.pitch, COUNTER_SHEET_LIMITS.pitch).text;
  const answers = ask.length ? readAnswers(value.answers, ask.length) : [];
  return { ...(ask.length ? { ask } : {}), ...(pitch ? { pitch } : {}), ...(answers.length ? { answers } : {}) };
}

/**
 * D'où vient un conseil ne se dit JAMAIS sur une carte (fondateur, 13 oct. 2026 : « le pharmacien n'est pas censé savoir si
 * c'est du robot, d'une règle ou d'une base de données ») : ce filtre retire des textes affichés le libellé « Suggestion du
 * robot — à confirmer par la pharmacienne » (écrit dans les raisons des suggestions du robot, y compris celles déjà
 * enregistrées) et la phrase interne qui raconte comment le produit a été choisi. L'origine reste en base et dans la console.
 * Un texte qui n'était QUE cela devient vide.
 */
const ORIGIN_LABEL = /suggestion du robot(?:\s*[—–-]\s*à confirmer par (?:la|le) pharmacien(?:ne)?)?\s*[.·:—–-]?\s*/gi;
const ORIGIN_SENTENCE = /aucune règle écrite pour ce médicament|choisi par le modèle/i;

export function withoutOriginLabel<T extends string | null | undefined>(text: T): T {
  if (typeof text !== "string") return text;
  if (ORIGIN_SENTENCE.test(text.replace(ORIGIN_LABEL, ""))) return "" as T;
  return text.replace(ORIGIN_LABEL, "").trim() as T;
}
