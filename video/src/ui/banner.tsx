import { useId, type CSSProperties, type ReactNode } from "react";
import { Easing } from "remotion";
import { BANNER, withCount } from "../../../agent/src/banner-design";
import { buildCounterNotice, type CounterNotice, type NoticeItem, type NoticeRecommendation } from "../../../src/core/counter/notice";
import { ANALGESIC_TREE, applyAnswer, evaluateTree, type TreeAnswers, type ViewQuestion } from "../../../src/core/counter/question-tree";
import { evaluateVigilances, vigilanceMessage } from "../../../src/core/ai/engines/vigilance";
import { detectAdviceOpportunities } from "../../../src/core/ai/engines/advice";
import type { DrugKnowledge, PatientContext } from "../../../src/core/ai/types";
import { C, FONT, MONO, usePerSecond, useF } from "../theme";
import { rgba } from "./stage";

/* ==========================================================================
 * LA BANNIÈRE DU POSTE DE CAISSE, image par image.
 *
 * Portage React de l'aperçu agent/src/banner-preview.ts (html(), mascotSvg())
 * pour Remotion : mêmes couleurs, mêmes cotes, mêmes phrases, lues dans
 * agent/src/banner-design.ts — la source unique que la bannière Windows lit
 * aussi. Les animations CSS de l'aperçu (respiration du robot, clignement,
 * barre d'analyse, coche de fin) sont recalculées à chaque image : Remotion
 * exige un rendu déterministe.
 *
 * Ce que la bannière affiche passe par le VRAI constructeur de l'avis
 * (src/core/counter/notice.ts) : titre « Médicament détecté », ligne de ce qui
 * a été scanné, alertes filtrées (BLOQUANT / AVERTISSEMENT, deux au plus),
 * conseils. Les questions viennent de l'arbre du comptoir
 * (src/core/counter/question-tree.ts), le texte des alertes du moteur de
 * vigilances (vigilance.ts) — toutes celles qu'il lève sur la vente, comme au
 * comptoir — et la raison sous chaque produit du moteur de conseil
 * (advice.ts, raison courte de la règle) : rien n'est réécrit ici.
 *
 * Une illustration, pas une capture de Windows : la police est Plus Jakarta
 * Sans (la bannière Windows écrit en Segoe UI). Les cotes sont celles de la
 * bannière « à 100 % » ; `zoom` les agrandit pour l'écran 1080p.
 * ======================================================================== */

const K = BANNER.colors;
const Z = BANNER.sizes;
const T = BANNER.text;

// ---- Les ventes de démonstration -------------------------------------------

/**
 * Une fiche médicament minimale : ce que les moteurs lisent (substance, code ATC). `substance` est la première
 * substance publiée par la BDPM, en capitales : c'est elle qui nomme le médicament dans la raison courte d'un conseil
 * (« Antibiothérapie (AMOXICILLINE) : … »), comme dans la vraie analyse (pipeline.ts, `officialSubstance`).
 */
function drug(name: string, inn: string, atcCode: string, substance: string): DrugKnowledge & { substance: string } {
  return { id: `demo-${name}`, name, inn, atcCode, therapeuticClass: null, form: null, commonSideEffects: [], interactionClasses: [], cautionPopulations: [], patientExplanation: null, intakeAdvice: null, sourceName: "démonstration", sourceVersion: "1", isDemoData: true, substance };
}

/**
 * Un conseil de la vente : produit, prix et stock du catalogue de démonstration (des exemples). `rule` nomme la
 * règle du moteur (src/core/ai/engines/advice.ts) qui le propose : la raison affichée sous le produit est la
 * raison courte de cette règle, calculée par le moteur pour CETTE vente — jamais une phrase écrite pour le film.
 */
type DemoAdvice = { id: string; rule: string; name: string; forDrug: string; priceCents: number; quantity: number; alertThreshold: number; challenge?: string; shortDateOn?: string; tone: [string, string] };

export type DemoSale = {
  /** Les lignes telles que le logiciel de gestion les écrit, et ce que la vente coûte (pour la fausse fenêtre). */
  lines: { name: string; lgo: string; qty: string; price: string }[];
  /** Une fiche par ligne, dans le même ordre : les vigilances et les règles de conseil les lisent toutes. */
  drugs: (DrugKnowledge & { substance: string })[];
  advice: DemoAdvice[];
  /** L'arbre de questions (douleur, fièvre) : le médicament qu'il nomme, et les produits qu'il débloque (clé de règle). */
  tree?: { drug: string; unlocks: Record<string, DemoAdvice> };
};

const AMOXICILLINE = { name: "AMOXICILLINE 1 g, comprimé", lgo: "AMOXICILLINE 1 g cp", qty: "1", price: "6,42 €" };
const AMOXICILLINE_FICHE = () => drug("AMOXICILLINE 1 g", "amoxicilline", "J01CA04", "AMOXICILLINE TRIHYDRATÉE");

/**
 * Les produits suivent de vraies règles du moteur, et seulement celles qui proposent leur produit dès le scan, sans
 * question : amoxicilline → probiotique (« Tolérance digestive pendant l'antibiothérapie »), valaciclovir →
 * antiseptique cutané (lésions d'herpès qui peuvent se surinfecter). Ni vitamines de convalescence (la règle attend
 * que le patient dise qu'il est fatigué), ni sérum physiologique sous cétirizine (la règle demande d'abord si le nez
 * est bouché). Aucune vente ne réunit deux antihistaminiques H1 (cétirizine et phéniramine du Fervex), et chaque
 * mise en garde que le moteur lève sur une vente s'affiche. Noms génériques, prix et stocks : des exemples — ceux de
 * la démonstration du site (agent/src/banner-preview.ts).
 */
const PROBIOTIQUE: DemoAdvice = { id: "a", rule: "digestive-tolerance-antibiotics", name: "PROBIOTIQUE 30 gélules", forDrug: AMOXICILLINE.name, priceCents: 1490, quantity: 12, alertThreshold: 4, challenge: "Challenge probiotiques", shortDateOn: "2026-11-30", tone: ["#BFE8D2", "#2F9E6B"] };

export const SALES = {
  /**
   * L'ordonnance du film : un antibiotique et un antiviral (une infection avec un bouton de fièvre), deux conseils,
   * aucune mise en garde. Les deux conseils de la démonstration du site, sans son Fervex (sa mise en garde a son
   * propre plan, `rhume`).
   */
  ordonnance: {
    lines: [AMOXICILLINE, { name: "VALACICLOVIR 500 mg, comprimé", lgo: "VALACICLOVIR 500 mg cp", qty: "1", price: "9,15 €" }],
    drugs: [AMOXICILLINE_FICHE(), drug("VALACICLOVIR 500 mg", "valaciclovir", "J05AB11", "CHLORHYDRATE DE VALACICLOVIR")],
    advice: [PROBIOTIQUE, { id: "b", rule: "herpes-zona-antiseptic", name: "ANTISEPTIQUE CUTANÉ 100 ml", forDrug: "VALACICLOVIR 500 mg, comprimé", priceCents: 520, quantity: 3, alertThreshold: 5, tone: ["#CFE4F7", "#3B82C4"] }],
  },
  /** Le paracétamol seul : la bannière demande pourquoi, puis où, avant de proposer une poche chaud/froid de la bonne zone. */
  douleur: {
    lines: [{ name: "DOLIPRANE 1000 mg, comprimé", lgo: "DOLIPRANE 1000 mg cp", qty: "1", price: "2,18 €" }],
    drugs: [drug("DOLIPRANE 1000 mg", "paracétamol", "N02BE01", "PARACÉTAMOL")],
    advice: [],
    tree: {
      drug: "DOLIPRANE 1000 mg",
      unlocks: {
        "pain-pack-back": { id: "pain-pack-back", rule: "pain-pack-back", name: "POCHE CHAUD/FROID DOS", forDrug: "DOLIPRANE 1000 mg, comprimé", priceCents: 1390, quantity: 5, alertThreshold: 2, tone: ["#CFE4F7", "#3B82C4"] },
        "pain-pack-neck": { id: "pain-pack-neck", rule: "pain-pack-neck", name: "POCHE CHAUD/FROID NUQUE", forDrug: "DOLIPRANE 1000 mg, comprimé", priceCents: 1290, quantity: 4, alertThreshold: 2, tone: ["#CFE4F7", "#3B82C4"] },
        "pain-pack-knee": { id: "pain-pack-knee", rule: "pain-pack-knee", name: "POCHE CHAUD/FROID GENOU", forDrug: "DOLIPRANE 1000 mg, comprimé", priceCents: 1190, quantity: 2, alertThreshold: 2, tone: ["#CFE4F7", "#3B82C4"] },
      },
    },
  },
  /** Un rhume au paracétamol : l'alerte « 3 g par jour au maximum » passe avant le conseil. */
  rhume: {
    lines: [AMOXICILLINE, { name: "FERVEX ADULTES, granulés", lgo: "FERVEX ADULTES sachets", qty: "1", price: "5,90 €" }],
    drugs: [AMOXICILLINE_FICHE(), drug("FERVEX ADULTES", "paracétamol, phéniramine, acide ascorbique", "N02BE51", "PARACÉTAMOL")],
    advice: [PROBIOTIQUE],
  },
  /**
   * L'antibiotique seul (film « Pourquoi ») : un conseil, le probiotique, sans challenge ni date courte — le plan
   * parle du conseil, pas du rayon. Il remplace la doxycycline : pour elle, le moteur de vigilances affiche deux
   * mises en garde (compléments minéraux, rétinoïdes) que le film aurait dû montrer, et sa crème solaire attend
   * une question sur l'exposition au soleil.
   */
  antibiotique: {
    lines: [AMOXICILLINE],
    drugs: [AMOXICILLINE_FICHE()],
    advice: [{ ...PROBIOTIQUE, id: "probio", challenge: undefined, shortDateOn: undefined, quantity: 18 }],
  },
} satisfies Record<string, DemoSale>;

/** La vente sans patient (mode « sans patient » de l'officine) : le contexte que l'analyse prend quand aucune fiche n'est liée. */
const NO_PATIENT: PatientContext = { patientId: null, ageYears: null, sex: "UNSPECIFIED", isPregnant: null, isBreastfeeding: null, renalImpairment: null, hepaticImpairment: null, allergies: [], chronicConditions: [], currentTreatments: [], hasAdviceConsent: false };

const REASONS = new WeakMap<DemoSale, Map<string, string>>();

/**
 * La raison courte de chaque règle que le moteur déclenche sur cette vente (clé de règle → texte). Un conseil du
 * film dont la règle ne se déclenche pas fait échouer le rendu : le film ne montre que ce que le moteur proposerait.
 */
function reasonsOf(sale: DemoSale): Map<string, string> {
  const known = REASONS.get(sale);
  if (known) return known;
  const opportunities = detectAdviceOpportunities({
    drugs: sale.drugs.map((d, lineIndex) => ({ lineIndex, drugName: sale.lines[lineIndex]?.name ?? d.name, knowledge: d, officialSubstance: d.substance })),
    patient: NO_PATIENT,
  });
  const reasons = new Map(opportunities.map((o) => [o.ruleKey ?? o.key, o.shortReason] as const));
  for (const a of [...sale.advice, ...Object.values(sale.tree?.unlocks ?? {})]) {
    if (!reasons.has(a.rule)) throw new Error(`Film : la règle « ${a.rule} » ne propose pas ${a.name} pour ${sale.lines.map((l) => l.name).join(" + ")}.`);
  }
  REASONS.set(sale, reasons);
  return reasons;
}

const NOTICES = new WeakMap<DemoSale, Map<string, CounterNotice>>();

/** L'avis du comptoir pour une vente et les réponses de l'arbre : exactement ce que le poste reçoit (gardé en mémoire, il sert à chaque image). */
export function noticeOf(sale: DemoSale, tree: TreeAnswers): CounterNotice {
  const key = JSON.stringify(tree);
  const known = NOTICES.get(sale) ?? new Map<string, CounterNotice>();
  NOTICES.set(sale, known);
  const hit = known.get(key);
  if (hit) return hit;
  const notice = buildNotice(sale, tree);
  known.set(key, notice);
  return notice;
}

function buildNotice(sale: DemoSale, tree: TreeAnswers): CounterNotice {
  const view = sale.tree ? evaluateTree(ANALGESIC_TREE, tree, sale.tree.drug) : null;
  const unlocked = view ? view.unlocked.map((key) => sale.tree?.unlocks[key]).filter((a): a is DemoAdvice => Boolean(a)) : [];
  const reasons = reasonsOf(sale);
  const recommendations: NoticeRecommendation[] = [...sale.advice, ...unlocked].map((a) => ({
    id: a.id,
    name: a.name,
    forDrug: a.forDrug,
    challengeTitle: a.challenge ?? null,
    shortDateOn: a.shortDateOn ?? null,
    priceCents: a.priceCents,
    reason: reasons.get(a.rule) ?? null,
    status: "PROPOSED",
    quantity: a.quantity,
    alertThreshold: a.alertThreshold,
  }));
  // Les alertes : le message du moteur, tel que pipeline.ts l'enregistre (la sévérité décide de ce qui monte au comptoir).
  const alerts = evaluateVigilances(sale.drugs).map((v) => ({ severity: v.severity, subjectType: "PRESCRIPTION_LINE", code: `VIGILANCE_${v.kind}`, message: vigilanceMessage(v), acknowledged: false }));
  return buildCounterNotice({
    reference: "DEMO",
    prescriptionStatus: "ANALYZED",
    lineNames: sale.lines.map((l) => l.name),
    lineKinds: sale.lines.map(() => "DRUG"),
    alerts,
    recommendations,
    outcome: null,
    questions: view?.questions ?? [],
    guidance: view?.guidance ?? [],
  });
}

/** La teinte de la vignette d'un conseil (l'aperçu dessine une boîte stylisée quand l'officine n'a pas de photo). */
function toneOf(sale: DemoSale, id: string | null): [string, string] {
  const all = [...sale.advice, ...Object.values(sale.tree?.unlocks ?? {})];
  return all.find((a) => a.id === id)?.tone ?? ["#E6EEF2", "#5A7280"];
}

// ---- L'état de la bannière, image par image ---------------------------------

export type BannerView = "idle" | "scan" | "ready" | "expanded" | "done";
export type BannerState = {
  view: BannerView;
  sale: DemoSale;
  /** Les réponses de l'arbre de questions. */
  tree: TreeAnswers;
  /** « Vendu » / « Non vendu », par conseil. */
  answers: Record<string, "SOLD" | "NOT_SOLD">;
  emailSaved: boolean;
  finishing: boolean;
  /** La petite carte de saisie de l'e-mail, ouverte : ce qui est tapé, la case cochée. */
  mail: null | { text: string; consent: boolean };
  /** La ligne de fin « 12e conseil vendu aujourd'hui » (rang du jour, exemple). */
  rank?: number;
};

/**
 * Un pas du scénario : à l'image `at`, l'état change. `press` nomme le bouton
 * qui s'enfonce juste avant (« sold:a », « not:b », « see », « mail »,
 * « mailSave », « consent », « finish », « qa:why:PAIN »…).
 */
export type BannerStep = { at: number; patch: Partial<BannerState> | ((s: BannerState) => Partial<BannerState>); press?: string };

export function bannerStart(sale: DemoSale, view: BannerView = "idle"): BannerState {
  return { view, sale, tree: {}, answers: {}, emailSaved: false, finishing: false, mail: null };
}

/** Une réponse de l'arbre (un choix coché), avec les règles du moteur : les questions refermées oublient leurs réponses. */
export function answerTree(node: string, choice: string) {
  return (s: BannerState): Partial<BannerState> => ({ tree: applyAnswer(ANALGESIC_TREE, s.tree, node, choice) ?? s.tree });
}

const EASE_CARD = Easing.bezier(0.22, 0.8, 0.26, 1);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export type BannerFrame = {
  s: BannerState;
  notice: CounterNotice;
  /** La taille de la carte à cette image (elle s'anime entre deux états, en 0,38 s comme l'aperçu). */
  w: number;
  h: number;
  /** Secondes depuis le dernier changement de vue, depuis l'ouverture de la carte e-mail. */
  viewDt: number;
  mailDt: number;
  /** Secondes depuis le début de la scène : les boucles du robot et de la barre d'analyse. */
  t: number;
  /** De 0 à 1 : à quel point ce bouton est enfoncé à cette image. */
  press: (key: string) => number;
};

/**
 * L'état de la bannière à l'image `f` d'un scénario : on rejoue les pas un à
 * un. La taille de la carte s'anime entre deux états (0,38 s, la courbe de
 * l'aperçu) ; un changement en cours d'animation repart de la taille atteinte.
 */
export function resolveBanner(initial: BannerState, steps: BannerStep[], f: number, perSecond: number): BannerFrame {
  let s = initial;
  let viewAt = -1e9;
  let mailAt = -1e9;
  let anim = { from: cardSize(initial), to: cardSize(initial), at: -1e9 };
  const sizeAt = (a: typeof anim, frame: number) => {
    const p = EASE_CARD(clamp01((frame - a.at) / (0.38 * perSecond)));
    return { w: a.from.w + (a.to.w - a.from.w) * p, h: a.from.h + (a.to.h - a.from.h) * p };
  };
  for (const step of steps) {
    if (step.at > f) break;
    const next: BannerState = { ...s, ...(typeof step.patch === "function" ? step.patch(s) : step.patch) };
    if (next.view !== s.view) viewAt = step.at;
    if (next.mail && !s.mail) mailAt = step.at;
    const target = cardSize(next);
    if (target.w !== anim.to.w || target.h !== anim.to.h) anim = { from: sizeAt(anim, step.at), to: target, at: step.at };
    s = next;
  }
  const size = sizeAt(anim, f);
  const presses = steps.filter((step) => step.press);
  return {
    s,
    notice: noticeOf(s.sale, s.tree),
    w: size.w,
    h: size.h,
    viewDt: (f - viewAt) / perSecond,
    mailDt: (f - mailAt) / perSecond,
    t: Math.max(0, f) / perSecond,
    press: (key) =>
      Math.max(
        0,
        ...presses.filter((p) => p.press === key).map((p) => {
          const d = (f - p.at) / perSecond;
          return d < -0.14 || d > 0.2 ? 0 : d < 0 ? 1 + d / 0.14 : 1 - d / 0.2;
        }),
      ),
  };
}

/** La bannière à l'image courante de la scène. Les pas doivent être rangés dans l'ordre du temps. */
export function useBanner(initial: BannerState, steps: BannerStep[]): BannerFrame {
  return resolveBanner(initial, steps, useF(), usePerSecond());
}

// ---- Les cotes ---------------------------------------------------------------

/**
 * Largeur approchée d'un texte en Plus Jakarta Sans gras, en pixels. Elle sert
 * seulement à couper les lignes et à ranger les pastilles comme le navigateur le
 * ferait ; légèrement large par prudence (une ligne coupée trop tôt vaut mieux
 * qu'un texte qui déborde).
 */
export function textWidth(text: string, size: number) {
  let em = 0;
  for (const ch of text) {
    if (ch === " ") em += 0.27;
    else if ("iljI'’.,:;!|".includes(ch)) em += 0.3;
    else if ("ftrJ()-".includes(ch)) em += 0.4;
    else if ("mwMW".includes(ch)) em += 0.88;
    else if (/[0-9]/.test(ch)) em += 0.62;
    else if (/[A-ZÀ-ÖØ-Þ]/.test(ch)) em += 0.7;
    else if ("—…«»€".includes(ch)) em += 0.8;
    else em += 0.58;
  }
  return em * size * 1.03;
}

/** Coupe un texte en lignes qui tiennent dans `width` (au mot près), comme le ferait le navigateur. */
export function wrapLines(text: string, size: number, width: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && textWidth(next, size) > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Range des éléments de largeurs données en rangées (retour à la ligne comme flex-wrap). */
function rows<X>(items: X[], widthOf: (x: X) => number, width: number, gap: number): X[][] {
  const out: X[][] = [];
  let row: X[] = [];
  let used = 0;
  for (const item of items) {
    const w = widthOf(item);
    if (row.length && used + gap + w > width) {
      out.push(row);
      row = [];
      used = 0;
    }
    used += (row.length ? gap : 0) + w;
    row.push(item);
  }
  if (row.length) out.push(row);
  return out;
}

const LIST_W = Z.widthExpanded - 20 - 28; // le panneau (marges 10) moins le retrait de la liste (14 de chaque côté)
const WARN_TEXT_W = LIST_W - 24 - 16 - 10;
const BODY_W = LIST_W - Z.thumb - 88 - 24;
const CHIP_W = (label: string) => Math.ceil(textWidth(label, 13) + 33);
export type Pill = { kind: "challenge" | "date" | "stock" | "low" | "out" | "unknown"; text: string };
const PILL_W = (p: Pill) => Math.ceil(textWidth(p.text, 11.5) + (p.kind === "unknown" ? 19 : 35));

function pillsOf(item: NoticeItem): Pill[] {
  const out: Pill[] = [];
  if (item.challenge) out.push({ kind: "challenge", text: T.challenge });
  if (item.shortDateOn) {
    const [y, m, d] = item.shortDateOn.split("-");
    out.push({ kind: "date", text: `${T.shortDate} ${d}/${m}/${y.slice(2)}` });
  }
  const n = item.quantity !== null ? ` · ${item.quantity}` : "";
  if (item.availability === "IN_STOCK") out.push({ kind: "stock", text: T.inStock + n });
  else if (item.availability === "LOW_STOCK") out.push({ kind: "low", text: T.lowStock + n });
  else if (item.availability === "OUT_OF_STOCK") out.push({ kind: "out", text: T.outOfStock });
  else out.push({ kind: "unknown", text: T.unknownStock });
  return out;
}

type Block =
  | { kind: "alert"; text: string; lines: string[]; y: number; h: number }
  | { kind: "guidance"; text: string; lines: string[]; y: number; h: number }
  | { kind: "question"; q: ViewQuestion; lines: string[]; chipRows: ViewQuestion["choices"][]; y: number; h: number }
  | { kind: "item"; item: NoticeItem; pillRows: Pill[][]; last: boolean; y: number; h: number };

/** La liste déroulée, bloc par bloc, dans l'ordre de la bannière Windows : titre, alertes, questions, orientations, conseils. */
function listLayout(notice: CounterNotice) {
  const blocks: Block[] = [];
  let y = Z.header - 4 + 8 + 24; // haut du panneau, retrait de la liste, ligne « Médicament détecté »
  const warn = (kind: "alert" | "guidance", text: string) => {
    const lines = wrapLines(text, 12.5, WARN_TEXT_W);
    const h = 16 + lines.length * 18;
    blocks.push({ kind, text, lines, y, h });
    y += h + 8;
  };
  for (const a of notice.alerts) warn("alert", a);
  for (const q of notice.questions) {
    const lines = wrapLines(q.text, 14, LIST_W - 24);
    const chipRows = rows(q.choices, (c) => CHIP_W(c.label), LIST_W - 24, 8);
    const h = 12 + lines.length * 19 + 10 + chipRows.length * 30 + (chipRows.length - 1) * 8 + 8 + 4;
    blocks.push({ kind: "question", q, lines, chipRows, y, h });
    y += h + 8;
  }
  for (const g of notice.guidance) warn("guidance", g);
  notice.items.forEach((item, i) => {
    const pillRows = rows(pillsOf(item), PILL_W, BODY_W, 6);
    const last = i === notice.items.length - 1;
    const content = 17 + 16 + (item.reason ? 16 : 0) + 4 + pillRows.length * 22 + (pillRows.length - 1) * 6;
    const h = Math.max(78, 12 + content + 10 + (last ? 0 : 1));
    blocks.push({ kind: "item", item, pillRows, last, y, h });
    y += h;
  });
  return { blocks, bottom: y };
}

const FOOT_H = 1 + 8 + Z.buttonHeight + 8 + Z.finishHeight + 12;

function doneLines(s: BannerState, notice: CounterNotice) {
  const sold = notice.items.filter((i) => s.answers[i.id ?? ""] === "SOLD").length;
  const not = notice.items.filter((i) => s.answers[i.id ?? ""] === "NOT_SOLD").length;
  const none = notice.items.length - sold - not;
  const lines = [`${sold} vendu${sold > 1 ? "s" : ""} · ${not} non vendu${not > 1 ? "s" : ""} · ${none} sans réponse`];
  if (s.emailSaved && sold > 0) lines.push("✓ Bilan envoyé au patient.");
  else if (s.emailSaved) lines.push("Aucun bilan envoyé : aucun produit n'a été vendu.");
  return { lines, sold };
}

/** La taille de la carte pour un état : les cotes de banner-design.ts, la hauteur déroulée comme la calcule la bannière. */
export function cardSize(s: BannerState): { w: number; h: number } {
  if (s.view === "idle" || s.view === "scan") return { w: Z.widthIdle, h: Z.heightIdle };
  if (s.view === "ready") return { w: Z.widthReady, h: Z.heightReady };
  const notice = noticeOf(s.sale, s.tree);
  if (s.view === "done") {
    const { lines, sold } = doneLines(s, notice);
    return { w: Z.widthDone, h: Math.max(Z.heightDone, 18 + 28 + lines.length * 20 + (sold > 0 ? 38 : 0) + 22) };
  }
  return { w: Z.widthExpanded, h: listLayout(notice).bottom + 6 + FOOT_H + 10 };
}

const MAIL_W = 360;
const MAIL_H = 194;

/**
 * Où viser un bouton, en pixels de la bannière (origine : le coin haut-gauche
 * de la carte, cotes « à 100 % »). Sert au pointeur des scènes.
 */
export function bannerTarget(b: BannerFrame, key: string): { x: number; y: number } {
  const { w, h, notice, s } = b;
  if (key === "see") return { x: 104 + (w - 124) / 2, y: 78 + Z.buttonHeight / 2 };
  if (key === "mail") return { x: 24 + (LIST_W - 138 - 8) / 2, y: h - 10 - FOOT_H + 1 + 8 + Z.buttonHeight / 2 };
  if (key === "finish") return { x: 24 + LIST_W / 2, y: h - 10 - 12 - Z.finishHeight / 2 };
  const mailTop = h - MAIL_H;
  if (key === "mailInput") return { x: -MAIL_W - 16 + 18 + 120, y: mailTop + 63 };
  if (key === "consent") return { x: -MAIL_W - 16 + 18 + 7, y: mailTop + 101 };
  if (key === "mailSave") return { x: -MAIL_W - 16 + 18 + (MAIL_W - 36 - 96 - 8) / 2, y: mailTop + 157 };
  const { blocks } = listLayout(notice);
  const [kind, a, c] = key.split(":");
  if (kind === "qa") {
    for (const block of blocks) {
      if (block.kind !== "question" || block.q.node !== a) continue;
      let top = block.y + 12 + block.lines.length * 19 + 10;
      for (const row of block.chipRows) {
        let x = 24 + 12;
        for (const choice of row) {
          if (choice.key === c) return { x: x + CHIP_W(choice.label) / 2, y: top + 15 };
          x += CHIP_W(choice.label) + 8;
        }
        top += 38;
      }
    }
  }
  for (const block of blocks) {
    if (block.kind !== "item" || block.item.id !== a) continue;
    const contentH = block.h - 22 - (block.last ? 0 : 1);
    const x = 24 + LIST_W - 44;
    if (s.answers[a]) return { x, y: block.y + 12 + (contentH - 49) / 2 + 28 + 4 + 8 };
    const top = block.y + 12 + (contentH - 56) / 2;
    return { x, y: kind === "not" ? top + 43 : top + 13 };
  }
  return { x: w / 2, y: h / 2 };
}

// ---- Le dessin -----------------------------------------------------------------

/** Un arc d'ellipse comme dans GDI+ (angles en degrés, sens horaire) → chemin SVG (repris de banner-preview.ts). */
function arc(cx: number, cy: number, rx: number, ry: number, start: number, sweep: number): string {
  const point = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return [cx + rx * Math.cos(rad), cy + ry * Math.sin(rad)].map((n) => n.toFixed(2)).join(" ");
  };
  return `M ${point(start)} A ${rx} ${ry} 0 ${Math.abs(sweep) > 180 ? 1 : 0} ${sweep > 0 ? 1 : 0} ${point(start + sweep)}`;
}

type Mood = "idle" | "think" | "alert" | "happy" | "idea";
const wave = (t: number, period: number) => 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / period);

/**
 * Le robot de la bannière : le même dessin que Mascot.Draw (notice-host.ts) et
 * mascotSvg() (banner-preview.ts), dans la même boîte de 100 unités. Ses
 * mouvements suivent les keyframes de l'aperçu, calculés au temps `t`.
 */
export function Mascot({ mood, size, t }: { mood: Mood; size: number; t: number }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const happy = mood === "happy" || mood === "idea";
  const bob = mood === "alert" ? -0.85 - 0.65 * Math.cos((2 * Math.PI * t) / 0.55) : 2.2 * Math.sin((2 * Math.PI * t) / 2.86);
  const g = wave(t, mood === "think" ? 0.7 : 1.96);
  const blinkPhase = (t % 4.6) / 4.6;
  const blink = blinkPhase > 0.96 ? 1 - 0.88 * (1 - Math.abs(blinkPhase - 0.975) / 0.025) : 1;
  const look = mood === "think" ? -3.5 * Math.cos((2 * Math.PI * t) / 2.4) : 0;
  const spark = wave(t, 1.05);
  const lamp = mood === "alert" ? "#F5B028" : K.eye;
  const eye = (cx: number) =>
    happy ? (
      <path d={arc(cx, 43, 5.5, 5, 190, 160)} fill="none" stroke={K.eye} strokeWidth={3.2} strokeLinecap="round" />
    ) : (
      <g transform={mood === "alert" ? `translate(${cx} 42) scale(1.2 1.25) translate(${-cx} -42)` : undefined}>
        <ellipse cx={cx} cy={42} rx={4.5} ry={6} fill={K.eye} />
        <circle cx={cx - 1.4} cy={39.6} r={1.6} fill="#fff" fillOpacity={0.82} />
      </g>
    );
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} style={{ position: "absolute", overflow: "visible" }}>
      <defs>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={K.shellTop} /><stop offset="1" stopColor={K.shellBottom} /></linearGradient>
        <linearGradient id={`${id}e`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={K.screenTop} /><stop offset="1" stopColor={K.screenBottom} /></linearGradient>
        <linearGradient id={`${id}r`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={K.ear} /><stop offset="1" stopColor="#12968C" /></linearGradient>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={K.accent} /><stop offset="1" stopColor={K.accentDark} /></linearGradient>
      </defs>
      <g transform={`translate(0 ${bob})`}>
        <line x1="50" y1="17" x2="50" y2="8" stroke={K.shellEdge} strokeWidth={3} strokeLinecap="round" />
        <circle cx="50" cy="6" r="8" fill={lamp} opacity={0.15 + 0.4 * g} transform={`translate(50 6) scale(${0.8 + 0.35 * g}) translate(-50 -6)`} />
        <circle cx="50" cy="6" r="3.6" fill={lamp} />
        <path d={arc(50, 44, 41, 35, 192, 156)} fill="none" stroke={K.ear} strokeWidth={5} strokeLinecap="round" />
        <rect x="3" y="36" width="15" height="28" rx="7" fill={`url(#${id}r)`} />
        <rect x="82" y="36" width="15" height="28" rx="7" fill={`url(#${id}r)`} />
        <rect x="14" y="16" width="72" height="58" rx="24" fill={`url(#${id}s)`} stroke={K.shellEdge} strokeWidth={1.6} />
        <rect x="22" y="25" width="56" height="40" rx="17" fill={`url(#${id}e)`} />
        <g transform={`translate(${look} 0) translate(0 42) scale(1 ${happy ? 1 : blink}) translate(0 -42)`}>
          {eye(38)}
          {eye(62)}
        </g>
        {mood === "idle" && <path d={arc(50, 51.5, 7, 4.5, 20, 140)} fill="none" stroke={K.eye} strokeWidth={2.6} strokeLinecap="round" />}
        {happy && <path d="M 41 53 A 9 7 0 0 0 59 53 Z" fill={K.eye} />}
        {mood === "alert" && <ellipse cx="50" cy="55.5" rx="4" ry="4.5" fill="none" stroke={K.eye} strokeWidth={2.4} />}
        {mood === "think" && <line x1="44" y1="55" x2="56" y2="55" stroke={K.eye} strokeWidth={2.6} strokeLinecap="round" />}
        <circle cx="74" cy="69" r="15" fill="#fff" fillOpacity={0.92} />
        <circle cx="74" cy="69" r="13.5" fill={`url(#${id}b)`} />
        <rect x="72.2" y="61" width="3.6" height="16" fill="#fff" />
        <rect x="66" y="67.2" width="16" height="3.6" fill="#fff" />
        {mood === "idea" && (
          <path d="M 80 7 L 82 12.5 L 87.5 14 L 82 15.5 L 80 21 L 78 15.5 L 72.5 14 L 78 12.5 Z" fill="#FFD65A" opacity={0.6 + 0.4 * spark} transform={`translate(80 14) scale(${0.8 + 0.45 * spark}) translate(-80 -14)`} />
        )}
      </g>
    </svg>
  );
}

/** Les petites icônes de l'aperçu (traits de 24 unités). */
const ICON: Record<string, ReactNode> = {
  pin: <><circle cx="12" cy="8" r="4" /><path d="M12 13v8" /></>,
  min: <path d="M6 12h12" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  tick: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  mail: <><rect x="3" y="5.5" width="18" height="13" rx="2.5" /><path d="M4 7.5l8 6 8-6" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 1.5" /></>,
  bang: <path d="M12 6v8M12 18.5v.5" />,
  cross: <path d="M7 7l10 10M17 7L7 17" />,
  warn: <><path d="M12 3L2.5 20h19z" /><path d="M12 10v5M12 17.6v.4" /></>,
  arrow: <path d="M4 12h15M14 6l6 6-6 6" />,
};
function Icon({ name, size, color = "currentColor", width = 1.8, style }: { name: string; size: number; color?: string; width?: number; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ flex: "none", ...style }} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
      {ICON[name]}
    </svg>
  );
}
function Star({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ flex: "none" }}>
      <path d="M12 2l2.9 6.9 7.1.6-5.4 4.7 1.7 7.1L12 17.5 5.7 21.3l1.7-7.1L2 9.5l7.1-.6z" fill={K.challengeIcon} />
    </svg>
  );
}

const ABS: CSSProperties = { position: "absolute", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const BRAND: CSSProperties = { ...ABS, fontWeight: 700, fontSize: 17, lineHeight: "24px" };
const SUB: CSSProperties = { ...ABS, fontSize: 13.5, lineHeight: "20px", color: K.muted };
const GO = `linear-gradient(180deg, ${K.accent}, ${K.accentDark})`;

function HeaderButtons({ w }: { w: number }) {
  const btn = (name: string, right: number) => (
    <span key={name} style={{ position: "absolute", top: 12, left: w - right - Z.iconButton, width: Z.iconButton, height: Z.iconButton, display: "grid", placeItems: "center", color: K.muted }}>
      <Icon name={name} size={14} />
    </span>
  );
  return <>{[btn("close", 12), btn("min", 12 + Z.iconButton + 4), btn("pin", 12 + 2 * (Z.iconButton + 4))]}</>;
}

const pressStyle = (p: number): CSSProperties => (p > 0 ? { transform: `scale(${1 - 0.04 * p})`, filter: `brightness(${1 + 0.1 * p})` } : {});

function plural(n: number, one: string, many: string) {
  return n > 1 ? withCount(many, n) : one;
}

/** Ce que dit la bannière quand les conseils sont prêts (ReadyTitle de notice-host.ts). */
function readyTitle(notice: CounterNotice) {
  if (notice.items.length === 0 && notice.questions.length > 0) return T.questionTitle;
  if (notice.items.length === 0) return notice.alerts.length > 0 ? T.readFirst : T.quiet;
  return plural(notice.items.length, T.readyOne, T.readyMany);
}

/** La ligne sous « PharmaBoost » quand la bannière est ouverte (Subtitle de notice-host.ts). */
function subtitle(notice: CounterNotice, answers: BannerState["answers"]) {
  if (notice.items.length === 0 && notice.questions.length > 0) return T.questionSub;
  if (notice.items.length === 0) return notice.alerts.length > 0 ? T.readFirst : T.quietSub;
  const answered = notice.items.filter((i) => answers[i.id ?? ""]).length;
  if (answered === 0) return plural(notice.items.length, T.forSaleOne, T.forSaleMany);
  return `${T.duringSale}  ${answered}/${notice.items.length}`;
}

function moodOf(s: BannerState, notice: CounterNotice): Mood {
  if (s.view === "scan") return "think";
  if (s.view === "ready") return "alert";
  if (s.view === "done") return "happy";
  if (s.view === "expanded") return notice.items.some((i) => !s.answers[i.id ?? ""]) ? "idea" : "happy";
  return "idle";
}

function Thumb({ tone }: { tone: [string, string] }) {
  return (
    <svg viewBox="0 0 46 46" width={Z.thumb} height={Z.thumb} style={{ borderRadius: 11, display: "block" }}>
      <rect width="46" height="46" rx="11" fill={tone[0]} />
      <rect x="13" y="9" width="20" height="30" rx="4" fill="#fff" />
      <rect x="13" y="9" width="20" height="9" rx="4" fill={tone[1]} />
      <rect x="17" y="23" width="12" height="3" rx="1.5" fill={tone[1]} opacity={0.5} />
      <rect x="17" y="29" width="9" height="3" rx="1.5" fill={tone[1]} opacity={0.35} />
    </svg>
  );
}

const PILL_COLORS: Record<Pill["kind"], [string, string]> = {
  challenge: [K.challengeBg, K.challengeFg],
  date: [K.dateBg, K.dateFg],
  stock: [K.stockBg, K.stockFg],
  low: [K.lowBg, K.lowFg],
  out: [K.outBg, K.outFg],
  unknown: [K.unknownBg, K.unknownFg],
};
const PILL_ICON: Partial<Record<Pill["kind"], string>> = { date: "clock", stock: "tick", low: "bang", out: "cross" };

function PillView({ p, ring = 0 }: { p: Pill; ring?: number }) {
  const [bg, fg] = PILL_COLORS[p.kind];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, width: PILL_W(p), height: 22, borderRadius: 11, background: bg, color: fg, fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap", boxShadow: ring > 0 ? `0 0 0 ${3 * ring}px ${rgba(K.accent, 0.35 * ring)}` : undefined }}>
      {p.kind === "challenge" ? <Star size={11} /> : PILL_ICON[p.kind] ? <Icon name={PILL_ICON[p.kind]!} size={11} width={1.7} /> : null}
      {p.text}
    </span>
  );
}

/**
 * Une pastille de la bannière, seule (Challenge, Date courte, En stock · N…) : pour les plans qui la citent hors
 * de la bannière. Le texte se compose avec BANNER.text, comme dans la bannière ; `zoom` l'agrandit.
 */
export function BannerPill({ kind, text, zoom = 1, ring = 0 }: Pill & { zoom?: number; ring?: number }) {
  return (
    <span style={{ display: "inline-flex", zoom, fontFamily: FONT, lineHeight: 1.45 }}>
      <PillView p={{ kind, text }} ring={ring} />
    </span>
  );
}

function Warn({ lines, h }: { lines: string[]; h: number }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", height: h, background: K.alertBg, color: K.alertFg, borderRadius: 12, padding: "8px 12px", fontWeight: 700, fontSize: 12.5, lineHeight: "18px" }}>
      <Icon name="warn" size={16} style={{ marginTop: 1 }} />
      <div>{lines.map((l, i) => <div key={i} style={{ whiteSpace: "nowrap" }}>{l}</div>)}</div>
    </div>
  );
}

/** La liste et le pied de la bannière ouverte. `highlight` entoure un élément pour le récit (pastilles, alerte). */
function Expanded({ b, highlight }: { b: BannerFrame; highlight?: (key: string) => number }) {
  const { notice, s, h, press } = b;
  const { blocks } = listLayout(notice);
  const hl = highlight ?? (() => 0);
  return (
    <>
      <div style={{ position: "absolute", left: 8, top: 6 }}>
        <Mascot mood={moodOf(s, notice)} size={76} t={b.t} />
      </div>
      <div style={{ ...BRAND, left: 96, top: 18, width: 200 }}>{T.brand}</div>
      <div style={{ ...SUB, left: 96, top: 45, width: 300 }}>{subtitle(notice, s.answers)}</div>
      <HeaderButtons w={b.w} />
      <div style={{ position: "absolute", left: 10, right: 10, top: Z.header - 4, height: h - (Z.header - 4) - 10, background: K.panel, borderRadius: 18, color: K.ink, overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 14, right: 14, top: 8, display: "flex", alignItems: "baseline", gap: 10, height: 24, paddingTop: 1 }}>
          <small style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em", color: K.inkSoft, textTransform: "uppercase" }}>{notice.detectedLabel}</small>
          <b style={{ fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{notice.subject}</b>
        </div>
        {blocks.map((block, i) => {
          const top = block.y - (Z.header - 4);
          if (block.kind === "alert" || block.kind === "guidance") {
            const ring = hl(`${block.kind}:${i}`);
            return (
              <div key={i} style={{ position: "absolute", left: 14, right: 14, top, borderRadius: 12, boxShadow: ring > 0 ? `0 0 0 ${4 * ring}px ${rgba("#F5B028", 0.45 * ring)}` : undefined }}>
                <Warn lines={block.lines} h={block.h} />
              </div>
            );
          }
          if (block.kind === "question") {
            return (
              <div key={i} style={{ position: "absolute", left: 14, right: 14, top, height: block.h, background: K.stockBg, borderRadius: 14, padding: "12px 12px 4px" }}>
                {block.lines.map((l, j) => <div key={j} style={{ fontWeight: 700, fontSize: 14, lineHeight: "19px", whiteSpace: "nowrap" }}>{l}</div>)}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "10px 0 8px" }}>
                  {block.chipRows.map((row, r) => (
                    <div key={r} style={{ display: "flex", gap: 8 }}>
                      {row.map((c) => {
                        const p = press(`qa:${block.q.node}:${c.key}`);
                        return (
                          <span key={c.key} style={{ width: CHIP_W(c.label), height: 30, borderRadius: 15, display: "inline-flex", alignItems: "center", justifyContent: "center", border: c.selected ? "1.3px solid transparent" : `1.3px solid ${K.accent}`, background: c.selected ? GO : "#fff", color: c.selected ? K.soldFg : K.accentDark, fontWeight: 700, fontSize: 13, whiteSpace: "nowrap", boxShadow: p > 0 ? `0 0 0 ${4 * p}px ${rgba(K.accent, 0.3)}` : undefined, ...pressStyle(p) }}>
                            {c.label}
                          </span>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            );
          }
          const { item, pillRows } = block;
          const a = s.answers[item.id ?? ""];
          const price = item.priceCents !== null ? `${(item.priceCents / 100).toFixed(2).replace(".", ",")} €` : "";
          const contentH = block.h - 22 - (block.last ? 0 : 1);
          return (
            <div key={i} style={{ position: "absolute", left: 14, right: 14, top, height: block.h, display: "grid", gridTemplateColumns: `${Z.thumb}px 1fr 88px`, gap: 12, padding: "12px 0 10px", borderBottom: block.last ? undefined : `1px solid ${K.line}`, boxSizing: "border-box" }}>
              <Thumb tone={toneOf(s.sale, item.id)} />
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline", marginTop: -3, lineHeight: "20px" }}>
                  <span style={{ fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</span>
                  <span style={{ whiteSpace: "nowrap", flex: "none", fontWeight: 700, fontSize: 12.5, color: K.stockFg }}>{price}</span>
                </div>
                <div style={{ fontSize: 12, color: K.inkSoft, lineHeight: "16px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{T.forDrug}{item.drug}</div>
                {item.reason && <div style={{ fontSize: 12, color: K.inkSoft, lineHeight: "16px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.reason}</div>}
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                  {pillRows.map((row, r) => (
                    <div key={r} style={{ display: "flex", gap: 6 }}>
                      {row.map((p) => <PillView key={p.text} p={p} ring={hl(`pill:${item.id}:${p.kind}`)} />)}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ height: contentH, display: "flex", flexDirection: "column", justifyContent: "center", gap: 4 }}>
                {!a ? (
                  <>
                    <span style={{ height: 26, borderRadius: 13, background: K.soldBg, color: K.soldFg, fontWeight: 700, fontSize: 13, display: "grid", placeItems: "center", ...pressStyle(press(`sold:${item.id}`)) }}>{T.sold}</span>
                    <span style={{ height: 26, borderRadius: 13, background: K.notSoldBg, color: K.notSoldFg, fontWeight: 700, fontSize: 12.5, display: "grid", placeItems: "center", ...pressStyle(press(`not:${item.id}`)) }}>{T.notSold}</span>
                  </>
                ) : (
                  <>
                    <span style={{ height: 28, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontWeight: 700, fontSize: a === "SOLD" ? 13 : 12.5, background: a === "SOLD" ? K.stockBg : K.notSoldBg, color: a === "SOLD" ? K.stockFg : K.notSoldFg }}>
                      {a === "SOLD" && <Icon name="tick" size={14} width={2} />}
                      {a === "SOLD" ? T.sold : T.notSold}
                    </span>
                    <span style={{ textAlign: "center", color: K.inkSoft, fontWeight: 700, fontSize: 12, lineHeight: "17px" }}>{T.change}</span>
                  </>
                )}
              </div>
            </div>
          );
        })}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: FOOT_H, borderTop: `1px solid ${K.line}`, padding: "8px 14px 12px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 138px", gap: 8 }}>
            {s.emailSaved ? (
              <span style={{ height: Z.buttonHeight, borderRadius: 14, background: K.stockBg, color: K.stockFg, fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 10, padding: "0 14px" }}>
                <Icon name="tick" size={15} width={2.2} />
                {T.emailSaved}
                <span style={{ marginLeft: "auto", fontSize: 12.5 }}>{T.emailRemove}</span>
              </span>
            ) : (
              <span style={{ height: Z.buttonHeight, borderRadius: 14, border: "1.4px solid #bed0da", background: K.panel, color: K.ink, fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, boxSizing: "border-box", ...pressStyle(press("mail")) }}>
                <Icon name="mail" size={16} color={K.inkSoft} width={1.5} />
                {T.emailAdd}
              </span>
            )}
            <span style={{ height: Z.buttonHeight, borderRadius: 14, border: "1.4px solid #bed0da", background: K.panel, color: K.ink, fontWeight: 700, fontSize: 13, display: "grid", placeItems: "center", boxSizing: "border-box" }}>{T.detail}</span>
          </div>
          <span style={{ height: Z.finishHeight, borderRadius: 16, background: GO, color: "#fff", fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, ...pressStyle(press("finish")) }}>
            {s.finishing ? T.finishing : <><Icon name="tick" size={18} color="#fff" width={2.4} />{T.finish}</>}
          </span>
        </div>
      </div>
    </>
  );
}

function Done({ b }: { b: BannerFrame }) {
  const { lines, sold } = doneLines(b.s, b.notice);
  const dt = b.viewDt;
  const out = (x: number) => 1 - (1 - x) ** 3;
  const halo = out(clamp01(dt / 0.9));
  const pop = Easing.bezier(0.34, 1.56, 0.64, 1)(clamp01(dt / 0.42));
  const draw = out(clamp01((dt - 0.14) / 0.42));
  const sparkP = out(clamp01(dt / 0.9));
  const cols = ["#FFD65A", K.glow, K.accent];
  return (
    <>
      {Array.from({ length: 8 }, (_, k) => {
        const ang = (k * Math.PI) / 4 + 0.2;
        return <i key={k} style={{ position: "absolute", left: 60, top: 56, width: 6, height: 6, borderRadius: "50%", background: cols[k % 3], opacity: 0.9 * (1 - sparkP), transform: `translate(${Math.round(Math.cos(ang) * 64) * sparkP}px, ${Math.round(Math.sin(ang) * 64) * sparkP}px)` }} />;
      })}
      <svg viewBox="0 0 72 72" width={72} height={72} style={{ position: "absolute", left: 24, top: 20, overflow: "visible" }}>
        <defs>
          <linearGradient id="pb-done" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={K.accent} /><stop offset="1" stopColor={K.accentDark} /></linearGradient>
        </defs>
        <circle cx="36" cy="36" r="40" fill={K.accent} fillOpacity={0.18} opacity={0.9 - 0.55 * halo} transform={`translate(36 36) scale(${0.4 + 0.72 * halo}) translate(-36 -36)`} />
        <circle cx="36" cy="36" r="34" fill="url(#pb-done)" transform={`translate(36 36) scale(${0.05 + 0.95 * pop}) translate(-36 -36)`} />
        <path d="M22 37.5 L32 47 L51 26" fill="none" stroke="#fff" strokeWidth={5.2} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={60} strokeDashoffset={60 * (1 - draw)} />
      </svg>
      <div style={{ position: "absolute", left: 112, right: 20, top: 18 }}>
        <div style={{ margin: "0 0 4px", fontSize: 19, lineHeight: "28px", fontWeight: 700 }}>{T.doneTitle}</div>
        {lines.map((l) => <div key={l} style={{ color: K.muted, fontSize: 13, lineHeight: "20px" }}>{l}</div>)}
        {sold > 0 && (
          <div style={{ marginTop: 8 }}>
            <PillView p={{ kind: "stock", text: `${b.s.rank ?? 12}e conseil vendu aujourd'hui` }} />
          </div>
        )}
      </div>
    </>
  );
}

/** Le contenu de la carte pour sa vue. */
function Layer({ b, highlight }: { b: BannerFrame; highlight?: (key: string) => number }) {
  const { s, notice, t, w } = b;
  const mascot = (mood: Mood, top: number) => (
    <div style={{ position: "absolute", left: 8, top }}>
      <Mascot mood={mood} size={Z.mascot} t={t} />
    </div>
  );
  if (s.view === "idle") {
    return (
      <>
        {mascot("idle", 8)}
        <div style={{ ...BRAND, left: 104, top: 17, width: w - 214 }}>{T.brand}</div>
        <span style={{ position: "absolute", left: 104, top: 54, width: 8, height: 8, borderRadius: "50%", background: K.accent, opacity: 0.35 + 0.65 * wave(t, 2.1) }} />
        <div style={{ ...SUB, left: 119, top: 49, width: w - 139 }}>{T.idle}</div>
        <HeaderButtons w={w} />
      </>
    );
  }
  if (s.view === "scan") {
    const sweep = Easing.bezier(0.45, 0, 0.55, 1)((t % 1.18) / 1.18);
    return (
      <>
        {mascot("think", 8)}
        <div style={{ ...BRAND, left: 104, top: 15, width: w - 214 }}>{T.scanTitle}</div>
        <div style={{ ...SUB, left: 104, top: 43, width: w - 124 }}>{T.scanSub}</div>
        <div style={{ position: "absolute", left: 104, top: 72, width: w - 126, height: 6, borderRadius: 3, background: "rgba(255,255,255,.14)", overflow: "hidden" }}>
          <i style={{ position: "absolute", top: 0, bottom: 0, left: `${-40 + 140 * sweep}%`, width: "40%", borderRadius: 3, background: `linear-gradient(90deg, ${K.accent}, ${K.glow})` }} />
        </div>
        <HeaderButtons w={w} />
      </>
    );
  }
  if (s.view === "ready") {
    return (
      <>
        {mascot("alert", 10)}
        <div style={{ ...BRAND, left: 104, top: 15, width: w - 214 }}>{readyTitle(notice)}</div>
        <div style={{ ...SUB, left: 104, top: 43, width: w - 124, fontSize: 13 }}>{notice.subject}</div>
        <span style={{ position: "absolute", left: 104, top: 78, width: w - 124, height: Z.buttonHeight, borderRadius: 14, background: GO, color: "#fff", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 9, ...pressStyle(b.press("see")) }}>
          {T.readyButton}
          <Icon name="arrow" size={16} color="#fff" width={2.2} />
        </span>
        <HeaderButtons w={w} />
      </>
    );
  }
  if (s.view === "done") return <Done b={b} />;
  return <Expanded b={b} highlight={highlight} />;
}

/** La petite carte de saisie de l'e-mail du patient (consentement exprès), à côté de la bannière. */
function MailCard({ b }: { b: BannerFrame }) {
  const m = b.s.mail;
  if (!m) return null;
  const valid = /^[^@ ]+@[^@ ]+[.][^@ .]{2,}$/.test(m.text);
  const enabled = valid && m.consent;
  const caret = Math.floor(b.t * 2) % 2 === 0;
  return (
    <div style={{ position: "absolute", left: -MAIL_W - 16, top: b.h - MAIL_H, width: MAIL_W, height: MAIL_H, boxSizing: "border-box", background: K.panel, color: K.ink, borderRadius: 18, border: `2px solid ${K.accent}`, padding: 16, boxShadow: "0 14px 34px rgba(3,24,38,.3)", opacity: clamp01(b.mailDt / 0.2) }}>
      <div style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 700, lineHeight: "21px" }}>E-mail du patient</div>
      <div style={{ height: 37, boxSizing: "border-box", fontSize: 14.5, lineHeight: "21px", padding: "7px 8px", border: "1px solid #aebfc9", background: "#fff", borderRadius: 4, whiteSpace: "nowrap", overflow: "hidden" }}>
        {m.text ? m.text : <span style={{ color: "#8a9aa4" }}>prenom.nom@exemple.fr</span>}
        {caret && <span style={{ display: "inline-block", width: 1.5, height: 17, marginLeft: 1, background: K.ink, verticalAlign: "-3px" }} />}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, lineHeight: "18px", margin: "10px 0 4px", whiteSpace: "nowrap" }}>
        <span style={{ width: 14, height: 14, borderRadius: 3, flex: "none", display: "grid", placeItems: "center", border: m.consent ? `1px solid ${K.accentDark}` : "1px solid #8a9aa4", background: m.consent ? K.accentDark : "#fff", ...pressStyle(b.press("consent")) }}>
          {m.consent && <Icon name="tick" size={11} color="#fff" width={3} />}
        </span>
        Le patient accepte de recevoir son bilan par e-mail
      </div>
      <div style={{ height: 18 }} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 96px", gap: 8, marginTop: 6 }}>
        <span style={{ height: 38, borderRadius: 13, fontWeight: 700, fontSize: 13.5, display: "grid", placeItems: "center", background: enabled ? K.accent : "#e2e9ed", color: enabled ? "#fff" : "#78888f", ...pressStyle(b.press("mailSave")) }}>Enregistrer l&apos;e-mail</span>
        <span style={{ height: 38, borderRadius: 13, fontWeight: 700, fontSize: 13.5, display: "grid", placeItems: "center", background: K.notSoldBg, color: K.notSoldFg }}>Plus tard</span>
      </div>
    </div>
  );
}

/**
 * La bannière posée dans l'image : coin haut-droit à (`right`, `top`) en pixels
 * 1080p, agrandie `zoom` fois (≈ 1,8 pour qu'elle se lise en vidéo). La carte
 * garde l'ancrage de la vraie bannière : elle grandit vers la gauche et vers
 * le bas. `highlight` peut entourer une pastille ou une alerte.
 */
export function Banner({ b, zoom, right, top, highlight, style }: { b: BannerFrame; zoom: number; right: number; top: number; highlight?: (key: string) => number; style?: CSSProperties }) {
  // Chaque changement de vue fait entrer le nouveau contenu en fondu (0,22 s), comme le calque de l'aperçu.
  const fade = clamp01(b.viewDt / 0.22);
  return (
    <div style={{ position: "absolute", right, top, ...style }}>
      <div style={{ position: "relative", zoom, width: b.w, height: b.h, fontFamily: FONT, fontSize: 14, lineHeight: 1.45 }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: Z.radius,
            color: K.text,
            overflow: "hidden",
            background: `linear-gradient(180deg, ${rgba(K.cardTop, K.cardAlpha)}, ${rgba(K.cardBottom, K.cardAlpha)})`,
            boxShadow: `0 0 0 1.2px ${rgba(K.glow, 0.3)}, inset 0 0 0 1px rgba(255,255,255,.1), 0 6px 14px rgba(3,24,38,.22), 0 16px 40px rgba(3,24,38,.30)`,
          }}
        >
          <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 60px 50px, ${rgba(K.glow, 0.23)}, transparent 130px), linear-gradient(180deg, rgba(255,255,255,.12), rgba(255,255,255,0) 46px)` }} />
          <div style={{ position: "absolute", inset: 0, opacity: fade }}>
            <Layer b={b} highlight={highlight} />
          </div>
        </div>
        <MailCard b={b} />
      </div>
    </div>
  );
}

/** Un point de la bannière (cotes à 100 %) → l'image 1080p, pour une bannière posée par <Banner right top zoom>. */
export function bannerPoint(b: BannerFrame, key: string, place: { zoom: number; right: number; top: number }) {
  const p = bannerTarget(b, key);
  return { x: 1920 - place.right - (b.w - p.x) * place.zoom, y: place.top + p.y * place.zoom };
}

/** La mention honnête sous la bannière : une reproduction du dessin, pas une capture. */
export function IllustrationNote({ text = "Illustration de la bannière du poste de caisse · produits et prix : exemples", dark = false, style }: { text?: string; dark?: boolean; style?: CSSProperties }) {
  return <div style={{ fontFamily: MONO, fontSize: 17, letterSpacing: "0.06em", color: dark ? "rgba(255,255,255,.55)" : C.ink400, ...style }}>{text}</div>;
}
