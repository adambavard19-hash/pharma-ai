import type { HostEntry } from "../../../agent/src/notice-center";
import type { HostCommand } from "./island-bridge";
import { greetingText } from "../../../agent/src/greeting-text";

/**
 * Une vente d'exemple, écrite EXACTEMENT comme l'agent l'envoie (commandes de agent/src/notice-center.ts) : pour voir
 * l'île sans poste Windows (`/poste/ile?essai=1`, et l'aperçu `/robot-apercu/poste`). Aucune donnée réelle.
 */

export const ESSAI_ENTRY: HostEntry = {
  id: "essai",
  reference: "ESSAI",
  label: "Médicament détecté",
  subject: "CURACNÉ 20 mg · IMODIUM 2 mg",
  url: "https://pharmaboost.app/vente/nouvelle",
  signature: "essai-1",
  quiet: false,
  emailSaved: false,
  emailError: "",
  alerts: [],
  notes: [],
  questions: [],
  guidance: [],
  // La vente des essais de la bannière (fondateur, 29 oct. 2026 : « exactement comme le scan A et C avec la bannière 1 ») : de
  // vrais produits du stock local avec leur photo studio, leurs prix et leurs marges ; « À dire au patient » et les questions
  // sont ceux des essais et du site. Une réponse mène à une autre possibilité du stock.
  boxes: [{ id: "ligne-1", name: "CURACNÉ 20 mg" }, { id: "ligne-2", name: "IMODIUM 2 mg" }],
  // Une équipe d'exemple (prénoms inventés) : « Qui a servi ce patient ? » en fin de vente, Léa choisie d'avance.
  team: [{ id: "essai-lea", name: "Léa M." }, { id: "essai-thomas", name: "Thomas D." }, { id: "essai-elodie", name: "Élodie R." }],
  servedBy: "essai-lea",
  items: [
    { id: "essai-1", drug: "CURACNÉ 20 mg", challenge: "La Roche-Posay · 1 € par boîte", shortDate: "", outcome: "NONE", name: "Cicaplast Lèvres baume réparateur", price: "7,95 €", margin: "2,27 €", reason: "L'isotrétinoïne dessèche les lèvres dès les premières semaines.", availability: "IN_STOCK", quantity: "12", image: "/produits-studio/0000030106659.jpg",
      sheet: {
        name: "Cicaplast Lèvres baume réparateur",
        reasons: ["L'isotrétinoïne dessèche les lèvres dès les premières semaines."],
        script: "",
        contraindications: [],
        usage: [{ text: "« Ce traitement dessèche les lèvres dès les premières semaines : ce baume les répare, plusieurs fois par jour. »" }],
        description: "",
        more: { contraindications: 0, usage: 0 },
        cut: false,
        ask: ["Vos lèvres sont-elles déjà sèches ?", "Avez-vous déjà un baume ?"],
        answers: [
          { ask: 0, label: "Oui, déjà", say: "Appliquez-le dès ce soir, en couche épaisse avant de dormir." },
          { ask: 0, label: "Pas encore", say: "Commencez dès maintenant : la sécheresse arrive vite sous ce traitement." },
          { ask: 1, label: "Oui, il ne suffit plus", say: "Proposez un soin plus intense, en plus du baume :", product: { name: "Eucerin Aquaphor SOS Lèvres", price: "7,40 €", margin: "2,07 €", stock: "IN_STOCK", quantity: 6 } },
          { ask: 1, label: "Non", say: "Ce baume suffit pour commencer : à garder sur soi." },
        ],
      } },
    { id: "essai-2", drug: "IMODIUM 2 mg", challenge: "", shortDate: "30/11/26", outcome: "NONE", name: "Lactibiane Imedia", price: "10,80 €", margin: "4,42 €", reason: "Aider la flore à se remettre de la diarrhée.", availability: "IN_STOCK", quantity: "7", image: "/produits-studio/3401528534805.jpg",
      sheet: {
        name: "Lactibiane Imedia",
        reasons: ["Aider la flore à se remettre de la diarrhée."],
        script: "",
        contraindications: [],
        usage: [{ text: "« Pour aider votre flore à se remettre de la diarrhée, en plus de l'Imodium. »" }],
        description: "",
        more: { contraindications: 0, usage: 0 },
        cut: false,
        ask: ["Depuis combien de temps ?", "Avez-vous de la fièvre ?"],
        answers: [
          { ask: 0, label: "Depuis hier", say: "Proposez Lactibiane Imedia avec l'Imodium, et de l'eau en quantité." },
          { ask: 1, label: "Non", say: "Lactibiane Imedia accompagne l'Imodium." },
        ],
      } },
    // La routine (essai « C » qui clignote) : trois étapes, chacune un conseil de la vente.
    ...([
      ["essai-r1", "Nettoyer", "Cleanance gel nettoyant", "15,70 €", "4,34 €", "6", "/produits-studio/3282770207774.jpg"],
      ["essai-r2", "Hydrater", "Effaclar H Iso-Biome", "16,50 €", "4,44 €", "4", "/produits-studio/3337875777797.jpg"],
      ["essai-r3", "Protéger", "Anthelios UVMune 400", "17,95 €", "4,44 €", "5", "/produits-studio/3337875797665.jpg"],
    ] as const).map(([id, step, name, price, margin, quantity, image], index) => ({
      id, drug: "CURACNÉ 20 mg", challenge: "", shortDate: "", outcome: "NONE" as const, name, price, margin, reason: "Routine peau sous isotrétinoïne", availability: "IN_STOCK", quantity, image,
      sheet: { name, reasons: [], script: "", contraindications: [], usage: [], description: "", more: { contraindications: 0, usage: 0 }, cut: false, routine: { key: "routine-isotretinoine", title: "Routine peau sous isotrétinoïne", step, index, count: 3 } },
    })),
  ],
};

const ALERT_ENTRY: HostEntry = {
  ...ESSAI_ENTRY,
  id: "essai-garde",
  reference: "ESSAI-2",
  subject: "DOXYCYCLINE 100 mg",
  signature: "essai-garde",
  alerts: ["Doxycycline et minéraux (fer, calcium, magnésium, zinc) : à prendre à 2 heures d'écart."],
  items: [],
};

/**
 * La vente d'exemple ouverte par une QUESTION du patient, sans scan (`/poste/ile?essai=question`, fondateur, 23 oct. 2026) :
 * la demande écrite est le sujet, le conseil du stock arrive comme après un bip. Mêmes textes que la vente d'exemple (aucun
 * texte médical inventé).
 */
export const QUESTION_TEXT = "Diarrhée depuis hier, adulte";
export const QUESTION_ENTRY: HostEntry = {
  ...ESSAI_ENTRY,
  id: "essai-question",
  reference: "ESSAI-3",
  label: "Demande",
  subject: QUESTION_TEXT,
  signature: "essai-question-1",
  boxes: [],
  items: [{ ...ESSAI_ENTRY.items[1], id: "essai-q1", drug: "", reason: "Diarrhée passagère de l'adulte", ...(ESSAI_ENTRY.items[1].sheet ? { sheet: { ...ESSAI_ENTRY.items[1].sheet, reasons: ["Diarrhée passagère de l'adulte"] } } : {}) }],
};

/** Une vente d'exemple n'a pas de page dans PharmaBoost : ses cartes se lisent sans s'ouvrir. */
export const isEssaiSale = (id: string) => id === ESSAI_ENTRY.id || id === ALERT_ENTRY.id || id === QUESTION_ENTRY.id;

export type TimedCommand = { at: number; command: HostCommand };

/** Le scénario : bonjour du robot, repos, scan, analyse, conseils (une réponse donnée au comptoir), fin de vente, puis une mise en garde. */
export const ESSAI_SEQUENCE: TimedCommand[] = [
  { at: 0, command: { op: "init", look: 3, position: "haut-centre", postLabel: "Comptoir 1" } },
  // Le bonjour du robot à l'ouverture de session (agent/src/greeting.ts), avec un prénom d'exemple ; il se range seul.
  { at: 600, command: { op: "greet", text: greetingText("Léa") } },
  { at: 12500, command: { op: "scan" } },
  { at: 14200, command: { op: "show", entry: ESSAI_ENTRY } },
  // La bannière reste une demi-minute : le temps d'ouvrir les cartes, les questions et la routine. Puis Cicaplast est bipé, la
  // vente validée dans LGPI (l'e-mail du bilan et son compte à rebours), et le Bravo avec « Qui a servi ce patient ? ».
  { at: 44000, command: { op: "show", entry: { ...ESSAI_ENTRY, signature: "essai-2", items: [{ ...ESSAI_ENTRY.items[0], outcome: "SOLD" }, ...ESSAI_ENTRY.items.slice(1)] } } },
  { at: 50000, command: { op: "validated", id: ESSAI_ENTRY.id } },
  { at: 63500, command: { op: "done", info: { id: "essai", title: "Vente terminée — résultats enregistrés", lines: ["1 vendu · 0 non vendu · 1 sans réponse", "✓ Bilan envoyé au patient."], badge: "3e conseil vendu aujourd'hui", warning: false } } },
  // « Qui a servi ce patient ? » tient l'écran de fin jusqu'à 8 s, puis la confirmation : la vente suivante vient après.
  { at: 86000, command: { op: "scan" } },
  { at: 87500, command: { op: "show", entry: ALERT_ENTRY } },
  { at: 94000, command: { op: "remove", id: "essai-garde" } },
];

export const ESSAI_LENGTH_MS = 97000;

/**
 * Le scénario de la question, de A à Z (les instants comptent depuis l'envoi de la question) : analyse, conseil, produit bipé
 * (« Vendu »), vente validée dans LGPI (compte à rebours de l'e-mail du bilan), fin de vente et « Qui a servi ce patient ? ».
 */
export const QUESTION_SEQUENCE: TimedCommand[] = [
  { at: 0, command: { op: "scan" } },
  { at: 1700, command: { op: "show", entry: QUESTION_ENTRY } },
  { at: 9000, command: { op: "show", entry: { ...QUESTION_ENTRY, signature: "essai-question-2", items: [{ ...QUESTION_ENTRY.items[0], outcome: "SOLD" }] } } },
  { at: 14000, command: { op: "validated", id: QUESTION_ENTRY.id } },
  { at: 27000, command: { op: "done", info: { id: QUESTION_ENTRY.id, title: "Vente terminée — résultats enregistrés", lines: ["1 vendu", "✓ Bilan envoyé au patient."], badge: "1er conseil vendu aujourd'hui", warning: false } } },
];
