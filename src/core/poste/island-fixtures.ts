import type { HostEntry } from "../../../agent/src/notice-center";
import type { HostCommand } from "./island-bridge";
import { greetingText } from "../../../agent/src/greeting-text";

/**
 * Une vente d'exemple, écrite EXACTEMENT comme l'agent l'envoie (commandes de agent/src/notice-center.ts) : pour voir
 * l'île sans poste Windows (`/poste/ile?essai=1`, et l'aperçu `/robot-apercu/poste`). Aucune donnée réelle.
 */

const ENTRY: HostEntry = {
  id: "essai",
  reference: "ESSAI",
  label: "Médicament détecté",
  subject: "DOLIPRANE 1000 mg · AMOXICILLINE 1 g",
  url: "https://pharmaboost.app/vente/nouvelle",
  signature: "essai-1",
  quiet: false,
  emailSaved: false,
  emailError: "",
  alerts: [],
  notes: [],
  questions: [],
  guidance: [],
  items: [
    { id: "essai-1", drug: "AMOXICILLINE 1 g", challenge: "Challenge probiotiques", shortDate: "30/11/2026", outcome: "NONE", name: "PROBIOTIQUE 30 gélules", price: "14,90 €", reason: "Protéger la flore pendant l'antibiotique", availability: "IN_STOCK", quantity: "12", image: "",
      // La carte déployée d'exemple : sans contre-indication ni conseil d'utilisation écrits (aucun texte médical inventé) —
      // l'île dit alors qu'ils ne sont pas renseignés et renvoie à la notice.
      sheet: { name: "PROBIOTIQUE 30 gélules", reasons: ["Protéger la flore pendant l'antibiotique"], script: "", contraindications: [], usage: [], description: "", more: { contraindications: 0, usage: 0 }, cut: false } },
    { id: "essai-2", drug: "DOLIPRANE 1000 mg", challenge: "", shortDate: "", outcome: "NONE", name: "SÉRUM PHYSIOLOGIQUE 30 unidoses", price: "5,90 €", reason: "Hygiène du nez pendant le rhume", availability: "LOW_STOCK", quantity: "3", image: "" },
    { id: "essai-3", drug: "DOLIPRANE 1000 mg", challenge: "", shortDate: "", outcome: "NONE", name: "MOUCHOIRS DOUX x 10", price: "2,50 €", reason: "Pour le rhume", availability: "IN_STOCK", quantity: "40", image: "" },
  ],
};

const ALERT_ENTRY: HostEntry = {
  ...ENTRY,
  id: "essai-garde",
  reference: "ESSAI-2",
  subject: "DOXYCYCLINE 100 mg",
  signature: "essai-garde",
  alerts: ["Doxycycline et minéraux (fer, calcium, magnésium, zinc) : à prendre à 2 heures d'écart."],
  items: [],
};

/** Une vente d'exemple n'a pas de page dans PharmaBoost : ses cartes se lisent sans s'ouvrir. */
export const isEssaiSale = (id: string) => id === ENTRY.id || id === ALERT_ENTRY.id;

export type TimedCommand = { at: number; command: HostCommand };

/** Le scénario : bonjour du robot, repos, scan, analyse, conseils (une réponse donnée au comptoir), fin de vente, puis une mise en garde. */
export const ESSAI_SEQUENCE: TimedCommand[] = [
  { at: 0, command: { op: "init", look: 3, position: "haut-centre", postLabel: "Comptoir 1" } },
  // Le bonjour du robot à l'ouverture de session (agent/src/greeting.ts), avec un prénom d'exemple ; il se range seul.
  { at: 600, command: { op: "greet", text: greetingText("Léa") } },
  { at: 12500, command: { op: "scan" } },
  { at: 14200, command: { op: "show", entry: ENTRY } },
  { at: 19000, command: { op: "show", entry: { ...ENTRY, signature: "essai-2", items: [{ ...ENTRY.items[0], outcome: "SOLD" }, ENTRY.items[1]] } } },
  { at: 24000, command: { op: "done", info: { id: "essai", title: "Vente terminée — résultats enregistrés", lines: ["1 vendu · 0 non vendu · 1 sans réponse", "✓ Bilan envoyé au patient."], badge: "3e conseil vendu aujourd'hui", warning: false } } },
  { at: 33000, command: { op: "scan" } },
  { at: 34500, command: { op: "show", entry: ALERT_ENTRY } },
  { at: 41000, command: { op: "remove", id: "essai-garde" } },
];

export const ESSAI_LENGTH_MS = 44000;
