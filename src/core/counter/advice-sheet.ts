import { populationLabel, VIGILANCE_LEVEL_LABELS, VIGILANCE_LEVEL_RANK, type SuggestionVigilance, type VigilanceLevel } from "@/config/vigilances";
import { productPopulationRules } from "@/core/ai/engines/population-vigilance";
import { readCounterSheet, SHEET_MISSING, SHEET_PATIENT_LABELS, withoutOriginLabel, type CounterSheet } from "../../../agent/src/counter-sheet";

/**
 * La fiche complète d'un conseil — UNE seule source de vérité pour les deux endroits où elle se lit :
 *  • la page de la vente (« Fiche complète du conseil », src/app/(app)/vente/[id]/advice-sheet-view.tsx) ;
 *  • la carte déployée de la bannière du comptoir (poste Windows et île de l'écran de vente), par `counterSheetOf`.
 * Demandes du fondateur (13 oct. 2026) : « on arrive sur la page PharmaBoost où le conseil est lu entièrement, où on peut
 * voir les contre-indications et les conseils de prise », puis « si on veut appuyer sur le conseil, il doit se déployer
 * pour regarder dessus les infos ».
 *
 * Ce module ne RÉDIGE rien : il range ce qui existe déjà, chaque ligne avec sa source —
 *  • la règle de conseil (pourquoi, contexte, bénéfices, phrase du comptoir, notes de sécurité, vigilances sourcées) ;
 *  • la fiche produit de l'officine (contre-indications, précautions, description, vigilances déclarées) ;
 *  • l'analyse de CETTE ordonnance (vigilances calculées pour ce patient : concerné, non concerné, à vérifier).
 * Une rubrique sans donnée reste vide : l'écran dit qu'elle n'est pas renseignée, jamais qu'il n'y a rien à savoir.
 * D'où vient le conseil (règle, robot, base) ne se dit jamais : « le pharmacien n'est pas censé savoir si c'est du robot,
 * d'une règle ou d'une base de données » (fondateur) — la source CITÉE d'une mise en garde (RCP, ANSM) reste.
 */

/** La fiche produit de l'officine, telle que le comptoir la lit pour un conseil. */
export type ProductSheetView = {
  description: string | null;
  /** Contre-indications déclarées par l'officine (« grossesse », « enfant de moins de 6 ans »…). */
  contraindications: string[];
  /** Précautions d'emploi déclarées par l'officine. */
  precautions: string[];
  /** Vigilances par population déclarées sur ce produit (table des vigilances de l'officine). */
  vigilances: { population: string; level: VigilanceLevel; note: string | null }[];
};

/** Ce que la fiche lit d'un conseil : la carte de la page de vente (AdviceView) le fournit, l'avis du poste aussi. */
export type AdviceSheetInput = {
  shortReason: string | null;
  counterScript: string | null;
  patientReason: string | null;
  precautions: string[];
  vigilances?: SuggestionVigilance[];
  routine: { stepLabel: string; benefit: string } | null;
  opportunity: {
    answer: boolean | null;
    confirmedReason: string | null;
    rationale: string | null;
    clinicalContext: string | null;
    safetyNotes: string[];
    benefits: string[];
  } | null;
  product: { sheet?: ProductSheetView } | null;
};

export type SheetPatient = "CONCERNED" | "NOT_CONCERNED" | "UNKNOWN";

export type SheetLine = {
  text: string;
  /** La précision écrite avec (la raison d'une vigilance, la note de l'officine). */
  detail: string | null;
  /** D'où vient la ligne, dit au pharmacien. */
  source: string;
  /** Pour une vigilance calculée sur cette ordonnance : le patient est-il concerné ? Null : sans objet. */
  patient: SheetPatient | null;
};

export type AdviceSheetView = {
  /** Pourquoi il est proposé : les phrases de la règle, sans doublon, dans l'ordre où elles se lisent. */
  reasons: string[];
  benefits: string[];
  counterScript: string | null;
  /** Ce que lira le patient, quand ce n'est pas la phrase du comptoir. */
  patientReason: string | null;
  contraindications: SheetLine[];
  usage: SheetLine[];
  /** La description de la fiche produit de l'officine. */
  description: string | null;
};

export const SHEET_SOURCES = {
  product: "Fiche produit de l'officine",
  declared: "Vigilance déclarée par l'officine",
  /** Une mise en garde écrite par PharmaBoost — jamais « règle » : l'origine du conseil ne se dit pas au comptoir. */
  rule: "PharmaBoost",
  prescription: "Analyse de cette ordonnance",
} as const;

/** Les mots des rubriques vides et du patient : écrits une fois, avec la bannière (qui n'embarque que ce petit module). */
export { SHEET_MISSING, SHEET_PATIENT_LABELS, withoutOriginLabel };

const clean = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();
const key = (text: string) => clean(text).toLocaleLowerCase("fr").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[«»"'.,;:!?()\s-]+/g, " ").trim();
const capitalized = (text: string) => (text ? text.charAt(0).toLocaleUpperCase("fr") + text.slice(1) : text);

const patientOf = (status: boolean | null): SheetPatient => (status === true ? "CONCERNED" : status === false ? "NOT_CONCERNED" : "UNKNOWN");

/** « Règle de conseil PharmaBoost (convalescence) » : le nom interne d'une règle, dit « PharmaBoost » au comptoir. */
const RULE_NAME = /r[èe]gle de conseil pharmaboost(\s*\([^)]*\))?/gi;

function vigilanceSource(vigilance: SuggestionVigilance): string {
  if (vigilance.origin === "PRODUCT") return SHEET_SOURCES.product;
  const cited = [...new Set(vigilance.sources.map((source) => clean(source.replace(RULE_NAME, SHEET_SOURCES.rule))).filter(Boolean))];
  if (cited.length === 0) return SHEET_SOURCES.rule;
  const text = cited.join(" ; ");
  // Une source qui nomme déjà PharmaBoost n'est pas préfixée une seconde fois.
  return text.includes(SHEET_SOURCES.rule) ? text : `${SHEET_SOURCES.rule} — ${text}`;
}

/** « Grossesse », ou « Asthme · validation pharmacien » hors contre-indication : la population et le niveau, mots de l'écran. */
function vigilanceTitle(population: string, level: VigilanceLevel): string {
  const label = populationLabel(population);
  return level === "CONTRAINDICATION" ? label : `${label} · ${VIGILANCE_LEVEL_LABELS[level].toLocaleLowerCase("fr")}`;
}

/**
 * Rubrique « Contre-indications » : la contre-indication ET la validation pharmacien. Le moteur réécrit en « validation
 * pharmacien » toute contre-indication dont on ne sait pas si elle concerne le patient — le mode sans patient, celui par
 * défaut (population-vigilance.ts, `suggestionVigilances`) : rangée sous « Conseils d'utilisation », la contre-indication
 * ANSM des huiles essentielles d'un spray ou d'une pastille laissait lire « aucune contre-indication renseignée ». Une
 * règle dont la source demande l'avis d'un médecin ou d'un pharmacien s'y lit aussi, sous son propre niveau.
 */
const belowContraindications = (level: VigilanceLevel) => VIGILANCE_LEVEL_RANK[level] < VIGILANCE_LEVEL_RANK.PHARMACIST_VALIDATION;

/**
 * Par population, le niveau qu'écrit la fiche produit de l'officine (contre-indications saisies, vigilances déclarées), lu
 * par la fonction même du moteur : il rend « contre-indication » à ce que l'analyse a réécrit en « validation pharmacien »
 * faute de connaître le patient. Une règle de conseil n'en garde pas trace : son niveau reste celui de l'analyse.
 */
function productLevels(sheet: ProductSheetView | undefined): Map<string, VigilanceLevel> {
  const levels = new Map<string, VigilanceLevel>();
  for (const rule of sheet ? productPopulationRules(sheet) : []) {
    const previous = levels.get(rule.population);
    if (!previous || VIGILANCE_LEVEL_RANK[rule.level] > VIGILANCE_LEVEL_RANK[previous]) levels.set(rule.population, rule.level);
  }
  return levels;
}

function shownLevel(vigilance: SuggestionVigilance, declared: Map<string, VigilanceLevel>): VigilanceLevel {
  if (vigilance.origin !== "PRODUCT" || vigilance.status !== null || vigilance.level !== "PHARMACIST_VALIDATION") return vigilance.level;
  return declared.get(vigilance.population) === "CONTRAINDICATION" ? "CONTRAINDICATION" : vigilance.level;
}

/** Ajoute sans doublon (même texte, même précision) : une même mise en garde lue à deux endroits ne se lit qu'une fois. */
function pushUnique(list: SheetLine[], line: SheetLine): void {
  const text = clean(line.text);
  if (!text) return;
  const id = `${key(text)}|${key(line.detail ?? "")}`;
  if (list.some((other) => `${key(other.text)}|${key(other.detail ?? "")}` === id)) return;
  list.push({ ...line, text, detail: clean(line.detail) || null });
}

export function buildAdviceSheet(recommendation: AdviceSheetInput): AdviceSheetView {
  const opportunity = recommendation.opportunity;
  const sheet = recommendation.product?.sheet;

  const reasons: string[] = [];
  const addReason = (text: string | null | undefined) => {
    // Jamais l'origine du conseil (« Suggestion du robot… ») : voir `withoutOriginLabel`.
    const value = clean(withoutOriginLabel(text));
    if (value && !reasons.some((other) => key(other) === key(value))) reasons.push(value);
  };
  if (opportunity?.answer === true) addReason(opportunity.confirmedReason);
  addReason(recommendation.shortReason);
  addReason(opportunity?.rationale);
  addReason(opportunity?.clinicalContext);
  if (recommendation.routine) addReason(`${recommendation.routine.stepLabel} : ${recommendation.routine.benefit}`);

  const counterScript = clean(recommendation.counterScript) || null;
  const patientReason = clean(recommendation.patientReason) || null;

  // Contre-indications : la fiche produit, puis les vigilances de niveau « contre-indication » ou « validation pharmacien »
  // (calculées pour ce patient, puis déclarées par l'officine depuis l'analyse).
  const contraindications: SheetLine[] = [];
  for (const text of sheet?.contraindications ?? []) pushUnique(contraindications, { text: capitalized(clean(text)), detail: null, source: SHEET_SOURCES.product, patient: null });

  // Conseils d'utilisation : précautions d'emploi de la fiche produit, notes de sécurité de la règle, ce que l'analyse de
  // l'ordonnance y a ajouté, et les vigilances de prudence ou d'information.
  const usage: SheetLine[] = [];
  const productPrecautions = (sheet?.precautions ?? []).map(clean).filter(Boolean);
  const safetyNotes = (opportunity?.safetyNotes ?? []).map(clean).filter(Boolean);
  for (const text of productPrecautions) pushUnique(usage, { text, detail: null, source: SHEET_SOURCES.product, patient: null });
  for (const text of safetyNotes) pushUnique(usage, { text, detail: null, source: SHEET_SOURCES.rule, patient: null });
  // Les précautions enregistrées avec le conseil reprennent la fiche produit et la règle (au jour de l'analyse) ; ce qui
  // n'est ni l'une ni l'autre vient des vigilances de l'ordonnance — ou d'une fiche produit modifiée depuis.
  const known = new Set([...productPrecautions, ...safetyNotes].map(key));
  for (const text of (recommendation.precautions ?? []).map(clean).filter(Boolean)) {
    if (!known.has(key(text))) pushUnique(usage, { text, detail: null, source: SHEET_SOURCES.prescription, patient: null });
  }

  const computed = recommendation.vigilances ?? [];
  const declaredLevels = productLevels(sheet);
  for (const vigilance of computed) {
    const level = shownLevel(vigilance, declaredLevels);
    const line: SheetLine = { text: vigilanceTitle(vigilance.population, level), detail: vigilance.text || null, source: vigilanceSource(vigilance), patient: patientOf(vigilance.status) };
    pushUnique(belowContraindications(level) ? usage : contraindications, line);
  }
  // Les vigilances déclarées sur la fiche produit : déjà reprises par l'analyse quand elle les a vues (même population) ;
  // une déclaration faite depuis s'ajoute, sans statut patient (l'analyse ne l'a pas évaluée).
  const seenFromProduct = new Set(computed.filter((vigilance) => vigilance.origin === "PRODUCT").map((vigilance) => vigilance.population));
  for (const declared of sheet?.vigilances ?? []) {
    if (seenFromProduct.has(declared.population)) continue;
    const line: SheetLine = { text: vigilanceTitle(declared.population, declared.level), detail: declared.note, source: SHEET_SOURCES.declared, patient: null };
    pushUnique(belowContraindications(declared.level) ? usage : contraindications, line);
  }

  return {
    reasons,
    benefits: (opportunity?.benefits ?? []).map(clean).filter(Boolean),
    counterScript,
    patientReason: patientReason && (!counterScript || key(patientReason) !== key(counterScript)) ? patientReason : null,
    contraindications,
    usage,
    description: clean(sheet?.description) || null,
  };
}

/** Le patient est-il concerné par une contre-indication de ce conseil ? Les contre-indications concernées passent en tête. */
export function sortForPatient(lines: SheetLine[]): SheetLine[] {
  const rank = (line: SheetLine) => (line.patient === "CONCERNED" ? 0 : line.patient === "UNKNOWN" ? 1 : line.patient === null ? 2 : 3);
  return lines.map((line, index) => ({ line, index })).sort((a, b) => rank(a.line) - rank(b.line) || a.index - b.index).map(({ line }) => line);
}

/**
 * La fiche, telle que la carte DÉPLOYÉE de la bannière la lit : la même que la page de vente (même fonction, mêmes
 * lignes, même ordre — les contre-indications qui concernent le patient d'abord), sans les sources (la fiche complète
 * les donne, à un clic), bornée pour voyager jusqu'au poste (agent/src/counter-sheet.ts).
 */
export function counterSheetOf(recommendation: AdviceSheetInput, fullName: string): CounterSheet {
  const sheet = buildAdviceSheet(recommendation);
  const line = (entry: SheetLine) => ({ text: entry.text, ...(entry.detail ? { detail: entry.detail } : {}), ...(entry.patient ? { patient: entry.patient } : {}) });
  // `readCounterSheet` ne renvoie null que pour ce qui n'est pas un objet : ici, jamais.
  return readCounterSheet({
    name: fullName,
    reasons: sheet.reasons,
    script: sheet.counterScript ?? "",
    contraindications: sortForPatient(sheet.contraindications).map(line),
    usage: sheet.usage.map(line),
    description: sheet.description ?? "",
  })!;
}

/** L'étape de routine enregistrée avec un conseil (JSON en base), lue sans confiance : ce que la fiche en dit, ou rien. */
export function routineStepOf(value: unknown): { stepLabel: string; benefit: string } | null {
  if (!value || typeof value !== "object") return null;
  const { stepLabel, benefit } = value as { stepLabel?: unknown; benefit?: unknown };
  return typeof stepLabel === "string" && typeof benefit === "string" ? { stepLabel, benefit } : null;
}

/**
 * L'étape de routine, telle que la bannière la regroupe (fondateur, 28 oct. 2026) : la routine (clé, titre), l'étape et sa place.
 * Pas de clé quand le conseil n'appartient à aucune routine.
 */
export function routineSheetOf(value: unknown): { routine?: { key: string; title: string; step: string; index: number; count: number } } {
  if (!value || typeof value !== "object") return {};
  const { key, title, stepLabel, stepIndex, stepCount } = value as Record<string, unknown>;
  if (typeof key !== "string" || typeof title !== "string" || typeof stepLabel !== "string" || typeof stepIndex !== "number" || typeof stepCount !== "number") return {};
  return { routine: { key, title, step: stepLabel, index: stepIndex, count: stepCount } };
}
