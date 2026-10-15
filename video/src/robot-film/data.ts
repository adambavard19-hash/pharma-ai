import { BANNER, withCount } from "../../../agent/src/banner-design";
import { evaluateVigilances, vigilanceMessage } from "../../../src/core/ai/engines/vigilance";
import { detectAdviceOpportunities } from "../../../src/core/ai/engines/advice";
import type { DrugKnowledge, PatientContext } from "../../../src/core/ai/types";
import { buildCounterNotice } from "../../../src/core/counter/notice";
import { analysisSteps } from "../../../src/core/island/banner-flow";
import { officineHome } from "../../../src/core/island/home";
import { robotAlerts } from "../../../src/core/robot/alerts";
import { robotLook } from "../../../src/core/robot/counter-look";

/* ==========================================================================
 * CE QUE L'ÎLE AFFICHE DANS LE FILM « ROBOT » — calculé par le VRAI code, jamais réécrit pour le film.
 *
 *  - la vente : DOXYCYCLINE 100 mg. Les mises en garde viennent du moteur de vigilances et du constructeur de l'avis
 *    du comptoir (deux au plus, mises bout à bout comme l'île du poste : `entry.alerts.join(" ")`) ; la raison sous
 *    chaque conseil vient du moteur de conseil (raison courte de la règle). Produits, prix et stocks : des exemples ;
 *  - l'île du logiciel : la phrase de repos et les pastilles d'`officineHome`, les alertes de `robotAlerts`.
 *
 * TROIS TEXTES SUIVENT LES PRÉALABLES DU SCÉNARIO, pas encore le code (à corriger hors du projet vidéo avant de
 * publier le film) — voir PREALABLES plus bas :
 *  1. le message du comptoir perd son titre (« Interaction potentielle — », « Contre-indications du traitement — ») ;
 *  2. la troisième ligne d'analyse dit « Règles de la pharmacienne consultées » ;
 *  3. le message des clics rapides est réécrit dans notre ton.
 * ======================================================================== */

export const DRUG = "DOXYCYCLINE 100 mg";
export const PATIENT_EMAIL = "patient@exemple.fr";
/** Le comptoir du film : Pixel, le robot n° 1 (jamais Bip, le n° 0), au « Comptoir 2 ». */
export const LOOK = 1;
export const COUNTER = "Comptoir 2";
export const PIXEL = robotLook(LOOK);
/** Les robots des autres comptoirs (counter-look.ts). Les robots n'ont pas de prénom (fondateur, 15 oct. 2026) : seul le comptoir. */
export const OTHER_LOOKS = [2, 3, 4, 5].map((i, k) => ({ index: i, caption: `Comptoir ${k + 3}` }));
export const PIXEL_CAPTION = COUNTER;

export const PREALABLES = {
  /** Préalable 2 : banner-flow.ts:65 dit encore « Règles validées par la pharmacienne consultées ». */
  rulesLine: "Règles de la pharmacienne consultées",
  /** Préalable 3 : counter-island.tsx:145 et platform-island.tsx:284 disent encore « Doucement ! · Trop de clics d'un coup — … ». */
  tapsTitle: "Ouh là, ça tourne !",
  tapsSub: "Une seconde, je retrouve mes esprits.",
};

// ---- La vente ------------------------------------------------------------------------------------------------

const FICHE: DrugKnowledge = {
  id: "film-doxycycline",
  name: DRUG,
  inn: "doxycycline",
  atcCode: "J01AA02",
  therapeuticClass: null,
  form: null,
  commonSideEffects: [],
  interactionClasses: [],
  cautionPopulations: [],
  patientExplanation: null,
  intakeAdvice: null,
  sourceName: "démonstration",
  sourceVersion: "1",
  isDemoData: true,
} as DrugKnowledge;

const NO_PATIENT: PatientContext = { patientId: null, ageYears: null, sex: "UNSPECIFIED", isPregnant: null, isBreastfeeding: null, renalImpairment: null, hepaticImpairment: null, allergies: [], chronicConditions: [], currentTreatments: [], hasAdviceConsent: false } as PatientContext;

/** Les messages tels que le poste les reçoit aujourd'hui (titre compris), deux au plus. */
const RAW_ALERTS = buildCounterNotice({
  reference: "FILM",
  prescriptionStatus: "ANALYZED",
  lineNames: [DRUG],
  lineKinds: ["DRUG"],
  alerts: evaluateVigilances([FICHE]).map((v) => ({ severity: v.severity, subjectType: "PRESCRIPTION_LINE", code: `VIGILANCE_${v.kind}`, message: vigilanceMessage(v), acknowledged: false })),
  recommendations: [],
  outcome: null,
  // La bannière du poste ne montre plus les mises en garde (13 oct. 2026) ; ce film d'archive les garde.
  showAlerts: true,
}).alerts;

/**
 * Préalable 1 : le message du comptoir sans son titre (« Interaction potentielle — Antibiotique chélaté… » devient
 * « Antibiotique chélaté… »), et sans le renvoi « (voir « Interaction potentielle ») » de la contre-indication.
 * Le film refuse de se rendre s'il restait « Interaction potentielle » à l'écran.
 */
export const ALERTS = RAW_ALERTS.map((message) => message.replace(/^[^—:]+ — /, "").replace(/\s*\(voir « Interaction potentielle »\)/, ""));
for (const a of ALERTS) if (/Interaction potentielle|interactions?\b/i.test(a)) throw new Error(`Film « Robot » : mise en garde à ne pas filmer : ${a}`);
if (ALERTS.length === 0) throw new Error("Film « Robot » : le moteur ne lève plus de mise en garde sur la doxycycline.");
/** Ce que l'encadré ambre affiche : les mises en garde bout à bout (poste-island.tsx). */
export const ALERT_TEXT = ALERTS.join(" ");
/** Le passage que la lueur ambre souligne. */
export const ALERT_FOCUS = "à distance de l'antibiotique, au moins 2 heures";
if (!ALERT_TEXT.includes(ALERT_FOCUS)) throw new Error(`Film « Robot » : « ${ALERT_FOCUS} » n'est plus dans la mise en garde.`);

const OPPORTUNITIES = detectAdviceOpportunities({
  drugs: [{ lineIndex: 0, drugName: DRUG, knowledge: FICHE, officialSubstance: "DOXYCYCLINE MONOHYDRATÉE" }],
  patient: NO_PATIENT,
});
function reason(rule: string): string {
  const found = OPPORTUNITIES.find((o) => (o.ruleKey ?? o.key) === rule);
  if (!found?.shortReason) throw new Error(`Film « Robot » : la règle « ${rule} » ne propose rien pour ${DRUG}.`);
  return found.shortReason;
}

export type FilmAdvice = { name: string; price: string; priceCents: number; reason: string; challenge: boolean; shortDate?: string; quantity: number; image: string };

/** Les deux conseils (exemples de produits, prix et stocks), avec la raison de leur règle. */
export const ADVICE: FilmAdvice[] = [
  { name: "Crème solaire SPF 50+", price: "16,90 €", priceCents: 1690, reason: reason("skin-doxycycline-photoprotection"), challenge: false, quantity: 18, image: "produits/boites/creme-solaire-spf50.webp" },
  { name: "Flore Équilibre 10 milliards", price: "14,90 €", priceCents: 1490, reason: reason("digestive-tolerance-antibiotics"), challenge: true, shortDate: "30/11/2026", quantity: 29, image: "produits/boites/flore-equilibre-10-milliards.webp" },
];

/** Les lignes qui se cochent pendant l'analyse (banner-flow.ts), la troisième selon le préalable 2. */
export const STEPS = analysisSteps(DRUG, ADVICE.length).map((s) => (/^Règles validées par la pharmacienne/.test(s) ? PREALABLES.rulesLine : s));

export const T = BANNER.text;
export const ADVICE_TITLE = withCount(T.forSaleMany, ADVICE.length);
export const DONE_SUB = `1 conseil vendu · ${ADVICE[0].price}`;
/** La carte « Résultat de la vente » (poste-island.tsx) : les lignes de l'agent, le badge du jour. */
export const RESULT_LINES = ["1 vendu · 1 non vendu · 0 sans réponse", "✓ Bilan envoyé au patient."];
export const RESULT_BADGE = "6e conseil vendu aujourd'hui";

// ---- L'île du logiciel (titulaire) ---------------------------------------------------------------------------

const CHALLENGE = { id: "flore", title: "Flore Équilibre", teamUnits: 37, milestones: [{ units: 40, reached: false }], target: 50, daysRemaining: 12 };

const home = (scanned: number, accepted: number) =>
  officineHome({
    scanned,
    accepted,
    salesCount: accepted,
    attributedCents: 0,
    counter: { label: COUNTER, online: true },
    challenge: { title: CHALLENGE.title, teamUnits: CHALLENGE.teamUnits, target: CHALLENGE.target, toNext: 40 - CHALLENGE.teamUnits },
    shortDates: 3,
    lastSale: null,
  });

/** Avant la vente du film (12 délivrances) et après (13). */
export const HOME_BEFORE = home(12, 5);
export const HOME_AFTER = home(13, 6);

/** Ce que le robot signale au titulaire, dans l'ordre du code. */
export const APP_ALERTS = robotAlerts({
  now: new Date("2026-10-12T09:42:00+02:00"),
  local: { hour: 9, weekday: 1 },
  can: { manageTeam: true, updateStock: true, manageSettings: true },
  isDemo: false,
  challenges: [CHALLENGE],
  challengeHref: "/equipe",
  shortDates: [{ label: "Flore Équilibre 10 milliards", quantity: 3, daysLeft: 49 }],
  stockStale: false,
  stockAgeDays: 1,
  lastDeposit: null,
  posts: [],
  joinRequests: [{ id: "hugo", name: "Hugo", suggestedRole: "PREPARATEUR", roleLabel: "Préparateur" }],
  proposedBonuses: [],
  myReachedObjectives: [],
  teamReachedObjectives: [],
  supportUnread: 0,
  subscription: { status: "ACTIVE" },
  setup: null,
  training: null,
});
if (APP_ALERTS.length !== 3 || APP_ALERTS[0].kind !== "join-request") throw new Error(`Film « Robot » : alertes inattendues (${APP_ALERTS.map((a) => a.kind).join(", ")}).`);

/** Le message du titulaire après « Accepter » (server/actions/team-access.ts). */
export const JOIN_DONE = "Hugo fait maintenant partie de l'équipe. Un e-mail l'en prévient.";

/** La discussion : la suggestion du robot (pharmacySuggestions), puis une réponse d'EXEMPLE. */
export const CHAT_PLACEHOLDER = "Résume ma journée, où en est le challenge…";
export const CHAT_SUGGESTIONS = ["Résume ma journée", "Combien de conseils acceptés cette semaine ?", "Où en est le challenge ?", "Qu'est-ce qui périme bientôt ?", "Qui a le meilleur taux ce mois-ci ?"];
export const CHAT_QUESTION = "Résume ma journée";
export const CHAT_ANSWER = "13 délivrances, 6 conseils acceptés. Challenge à 37 / 50 : plus que 3 ventes pour le palier.";
export const CHAT_FOOTNOTE = "Je lis les chiffres de votre officine, sans rien modifier. Aucune donnée de patient, aucun conseil médical : pour ça, il y a la pharmacienne.";

/** Le dépôt du stock (app-island.tsx, StockDrop) : textes du code, chiffres d'exemple. */
const n = (x: number) => x.toLocaleString("fr-FR");
export const STOCK_FILE = "stock.csv";
export const STOCK_STATS = `${n(3812)} produits lus · ${n(3790)} reconnus · ${n(22)} nouveaux`;
export const STOCK_DONE = `Stock mis à jour : ${n(3812)} lignes.`;

/** La mention, de la première image à la carte de fin. */
export const MENTION = "Illustration · chiffres, produits et prix : exemples";
