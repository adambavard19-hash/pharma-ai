import { BANNER, withCount } from "../../../agent/src/banner-design";
import { analysisSteps } from "../../../src/core/island/banner-flow";
import { evaluateVigilances } from "../../../src/core/ai/engines/vigilance";
import { detectAdviceOpportunities } from "../../../src/core/ai/engines/advice";
import { buildCounterNotice } from "../../../src/core/counter/notice";
import { robotAlerts, moodForAlerts } from "../../../src/core/robot/alerts";
import { officineHome } from "../../../src/core/island/home";
import { robotLook } from "../../../src/core/robot/counter-look";
import type { DrugKnowledge, PatientContext } from "../../../src/core/ai/types";

/* ==========================================================================
 * CE QUE LE FILM « PRÉSENTATION » MONTRE, TIRÉ DU VRAI CODE.
 *
 * Les textes des écrans ne sont pas écrits pour le film : ils sortent des
 * modules du produit, pour la vente d'exemple (une boîte de DOXYCYCLINE
 * 100 mg au Comptoir 2, robot « Pixel ») :
 *  - les lignes d'analyse : analysisSteps (core/island/banner-flow) ;
 *  - les mises en garde : le moteur de vigilances, choisies et ordonnées par
 *    buildCounterNotice (au plus 2, bout à bout, comme le poste les reçoit) ;
 *  - la raison sous chaque conseil : la raison courte de la règle, calculée par
 *    le moteur de conseils pour CETTE vente ;
 *  - l'île du logiciel : officineHome (core/island/home) et les alertes du
 *    robot, robotAlerts (core/robot/alerts) ;
 *  - un robot par comptoir : robotLook (core/robot/counter-look).
 *
 * Produits, prix, stocks, chiffres de la journée, challenge et prénoms : des
 * exemples (la mention reste à l'écran tout le film).
 *
 * Deux corrections demandées au produit avant la publication du film sont
 * appliquées ici, en attendant qu'elles le soient dans le code du site :
 *  1. la 3e ligne d'analyse « Règles validées par la pharmacienne consultées »
 *     devient « Règles de la pharmacienne consultées » (les deux règles filmées
 *     sont encore « PENDING ») ;
 *  2. le poste lit la mise en garde sans son titre « Interaction potentielle — »,
 *     et le renvoi « (voir « Interaction potentielle ») » disparaît.
 * Une fois le site corrigé, les deux remplacements ne trouvent plus rien à faire.
 * ======================================================================== */

export const T = BANNER.text;
export const KC = BANNER.colors;

/** La boîte scannée, telle que l'île la nomme (« Pour : … »). */
export const DRUG = "DOXYCYCLINE 100 mg";
/** La ligne qui s'inscrit dans le logiciel de gestion (générique, sans marque). */
export const LGO_LINE = "DOXYCYCLINE 100 mg — 1 boîte";
/** La première substance publiée par la BDPM pour la doxycycline 100 mg : c'est elle qui nomme le médicament dans la raison courte. */
const BDPM_SUBSTANCE = "DOXYCYCLINE MONOHYDRATÉE";

/** Le robot du Comptoir 2. */
export const PIXEL_LOOK = 1;
export const POSTE_LABEL = "Comptoir 2";

// ---- 1. L'analyse ----------------------------------------------------------------------------------------------

const RULES_LINE_IN_CODE = "Règles validées par la pharmacienne consultées";
const RULES_LINE_FILMED = "Règles de la pharmacienne consultées";
export const ANALYSIS_STEPS = analysisSteps(DRUG, 2).map((line) => (line === RULES_LINE_IN_CODE ? RULES_LINE_FILMED : line));

// ---- 2. Les mises en garde et les conseils, par les moteurs ---------------------------------------------------

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
  sourceName: "film",
  sourceVersion: "1",
  isDemoData: true,
} as DrugKnowledge;

const NO_PATIENT: PatientContext = { patientId: null, ageYears: null, sex: "UNSPECIFIED", isPregnant: null, isBreastfeeding: null, renalImpairment: null, hepaticImpairment: null, allergies: [], chronicConditions: [], currentTreatments: [], hasAdviceConsent: false } as PatientContext;

const vigilances = evaluateVigilances([FICHE]);
const opportunities = detectAdviceOpportunities({
  drugs: [{ lineIndex: 0, drugName: `${DRUG}, comprimé`, knowledge: FICHE, officialSubstance: BDPM_SUBSTANCE }],
  patient: NO_PATIENT,
} as Parameters<typeof detectAdviceOpportunities>[0]);
const reasonOf = (rule: string) => {
  const found = opportunities.find((o) => (o.ruleKey ?? o.key) === rule);
  if (!found) throw new Error(`Film « Présentation » : la règle « ${rule} » ne se déclenche plus sur ${DRUG}.`);
  return found.shortReason;
};

export type FilmAdvice = { name: string; price: string; reason: string; challenge: boolean; shortDate?: string; quantity: number; image: string };

/** Les deux conseils, dans l'ordre du moteur (priorité 86 puis 72) : produits, prix et stocks d'exemple. */
export const ADVICE: FilmAdvice[] = [
  { name: "Crème solaire SPF 50+", price: "16,90 €", reason: reasonOf("skin-doxycycline-photoprotection"), challenge: false, quantity: 18, image: "produits/boites/creme-solaire-spf50.webp" },
  { name: "Ultra-Levure 200 mg", price: "8,90 €", reason: reasonOf("digestive-tolerance-antibiotics"), challenge: true, shortDate: "30/11/2026", quantity: 29, image: "produits/boites/ultra-levure-200-mg.webp" },
];

const notice = buildCounterNotice({
  reference: "FILM",
  prescriptionStatus: "ANALYZED",
  lineNames: [`${DRUG}, comprimé`],
  lineKinds: ["DRUG"],
  // Le message tel que le poste le lira après la correction : sans le titre de la vigilance.
  alerts: vigilances.map((v) => ({ severity: v.severity, subjectType: "PRESCRIPTION_LINE", code: `VIGILANCE_${v.kind}`, message: `${v.subtitle} : ${v.explanation}`, acknowledged: false })),
  recommendations: [],
  outcome: null,
  // La bannière ne montre plus les mises en garde (13 oct. 2026), et ce film non plus ; le texte reste calculé, jamais affiché.
  showAlerts: true,
});

const ALERTS = notice.alerts.map((message) => message.replace(/\s*\(voir « Interaction potentielle »\)/g, ""));
if (ALERTS.length === 0) throw new Error(`Film « Présentation » : plus aucune mise en garde pour ${DRUG}.`);
if (ALERTS.some((a) => /interaction/i.test(a))) throw new Error("Film « Présentation » : le mot « interaction » ne doit jamais être à l'écran.");

/** Les mises en garde, bout à bout (le poste les joint par une espace). */
export const ALERT_TEXT = ALERTS.join(" ");
/** Le passage que la lueur ambre balaie. */
export const ALERT_FOCUS = "à distance de l'antibiotique, au moins 2 heures";
if (!ALERT_TEXT.includes(ALERT_FOCUS)) throw new Error(`Film « Présentation » : la mise en garde ne dit plus « ${ALERT_FOCUS} ».`);

export const FOR_SALE = withCount(T.forSaleMany, ADVICE.length);

// ---- 3. La fin de la vente ------------------------------------------------------------------------------------

/** Ce que le poste écrit sous l'île (agent/src/notice-center.ts, buildDoneInfo) : 1 vendu, 1 non vendu, bilan envoyé, 6e conseil du jour. */
export const DONE_LINES = ["1 vendu · 1 non vendu · 0 sans réponse", "✓ Bilan envoyé au patient."];
export const DONE_BADGE = "6e conseil vendu aujourd'hui";
export const DONE_SUB = `1 conseil vendu · ${ADVICE[0].price}`;
export const EMAIL = "patient@exemple.fr";

// ---- 4. L'île du logiciel ------------------------------------------------------------------------------------

const CHALLENGE = { id: "flore", title: "Ultra-Levure", teamUnits: 37, milestones: [{ units: 40, reached: false }, { units: 50, reached: false }], target: 50, daysRemaining: 12 };

const homeOf = (accepted: number) =>
  officineHome({
    scanned: 13,
    accepted,
    salesCount: accepted,
    attributedCents: 0,
    counter: { label: POSTE_LABEL, online: true },
    challenge: { title: CHALLENGE.title, teamUnits: CHALLENGE.teamUnits, target: CHALLENGE.target, toNext: 3 },
    shortDates: 3,
    lastSale: null,
  });

/** L'Accueil de l'île, avant et après la vente du film (seul le compteur du jour change). */
export const HOME_BEFORE = homeOf(5);
export const HOME_AFTER = homeOf(6);

/** Ce que le robot du logiciel signale : la demande d'Hugo, la date courte, le challenge (titulaire, officine réelle). */
export const LOGICIEL_ALERTS = robotAlerts({
  now: new Date("2026-10-13T08:30:00Z"),
  local: { hour: 10, weekday: 2 },
  can: { manageTeam: true, updateStock: true, manageSettings: true },
  isDemo: false,
  challenges: [CHALLENGE],
  challengeHref: "/pilotage",
  shortDates: [{ label: "Ultra-Levure 200 mg", quantity: 3, daysLeft: 48 }],
  stockStale: false,
  stockAgeDays: 0,
  lastDeposit: null,
  posts: [],
  joinRequests: [{ id: "hugo", name: "Hugo", suggestedRole: "TECHNICIAN", roleLabel: "Préparateur" }],
  proposedBonuses: [],
  myReachedObjectives: [],
  teamReachedObjectives: [],
  supportUnread: 0,
  subscription: { status: "ACTIVE" },
  setup: { status: "DONE", scheduledAt: null },
  training: null,
});
if (LOGICIEL_ALERTS.length !== 3 || LOGICIEL_ALERTS[0].kind !== "join-request") throw new Error("Film « Présentation » : les alertes du logiciel ont changé.");
/** L'humeur du robot du logiciel devant ces alertes (curieux : une chose à faire en tête). */
export const LOGICIEL_MOOD = moodForAlerts(LOGICIEL_ALERTS);
/** Le message du produit quand la demande est acceptée (server/actions/team-access.ts). */
export const JOINED_TOAST = "Hugo fait maintenant partie de l'équipe. Un e-mail l'en prévient.";

/** La discussion : les suggestions du titulaire (core/pharmacy-assistant/assistant.ts) et la note du bas (app-island.tsx). */
export const CHAT_SUGGESTIONS = ["Résume ma journée", "Combien de conseils acceptés cette semaine ?", "Où en est le challenge ?", "Qu'est-ce qui périme bientôt ?", "Qui a le meilleur taux ce mois-ci ?"];
export const CHAT_PLACEHOLDER = "Résume ma journée, où en est le challenge…";
export const CHAT_FOOTNOTE = "Je lis les chiffres de votre officine, sans rien modifier. Aucune donnée de patient, aucun conseil médical : pour ça, il y a la pharmacienne.";
export const CHAT_QUESTION = "Résume ma journée";
/** La réponse d'exemple : les chiffres de l'île, aucun produit recommandé. */
export const CHAT_ANSWER = "13 délivrances, 6 conseils acceptés. Challenge à 37 / 50 : plus que 3 ventes pour le palier.";

// ---- 5. L'équipe -------------------------------------------------------------------------------------------

/** Les robots de quatre comptoirs : Pixel (Comptoir 2), Nova, Gizmo, Zéphyr. */
export const TEAM_ROBOTS = [1, 2, 3, 4].map((index) => ({ look: index, caption: `${robotLook(index).name} · Comptoir ${index + 1}` }));
if (TEAM_ROBOTS[0].caption !== "Pixel · Comptoir 2") throw new Error("Film « Présentation » : le robot du Comptoir 2 n'est plus Pixel.");

export const CHALLENGE_TITLE = CHALLENGE.title;
export const CHALLENGE_UNITS = CHALLENGE.teamUnits;
export const CHALLENGE_TARGET = CHALLENGE.target;
