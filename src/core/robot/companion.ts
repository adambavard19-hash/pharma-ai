import type { RobotMood } from "./mascot";

/**
 * Le robot au centre de l'expérience (demande du fondateur, 11 oct. 2026) : grand sur l'accueil du site et sur
 * « Nouvelle vente », et un petit compagnon dans le coin de l'écran qui réagit à ce qu'on regarde. Module pur : les
 * règles (quelle section, quelle phrase, où se cacher, quel bonjour) se testent sans navigateur ; le dessin vit dans
 * `components/robot`.
 *
 * Ce que le robot dit sur le site est honnête : il présente, il montre, il ne promet rien (ni chiffre, ni résultat).
 */

// ---------------------------------------------------------------------------------------------------------------
// Le site : l'accueil et le compagnon qui suit la lecture
// ---------------------------------------------------------------------------------------------------------------

/** Les phrases de la bulle du grand robot de l'accueil, à tour de rôle. La première est celle du rendu serveur. */
export const HERO_LINES = ["Bonjour ! Je suis le robot PharmaBoost.", "Au scan, je vous montre le bon conseil.", "Cliquez-moi !"] as const;

/** Combien de temps chaque phrase de l'accueil reste affichée. */
export const HERO_LINE_MS = 4200;

export type SectionReaction = { mood: RobotMood; line: string | null };

/**
 * Ce que fait le compagnon du site quand une section entre dans la lecture (par son `id`). Null : rien de neuf, il
 * garde son humeur. La phrase est courte ; sans phrase, seule l'expression change.
 */
const SITE_SECTIONS: Record<string, SectionReaction> = {
  accueil: { mood: "idle", line: null },
  banniere: { mood: "curious", line: "Regardez, c'est moi au comptoir !" },
  questions: { mood: "thinking", line: "D'abord la bonne question, puis le conseil." },
  "stock-marge": { mood: "happy", line: "Votre stock, vos produits." },
  equipe: { mood: "happy", line: "Toute l'équipe au comptoir." },
  securite: { mood: "concerned", line: "Le pharmacien garde la main, toujours." },
  tarif: { mood: "happy", line: "Faites le calcul !" },
  faq: { mood: "thinking", line: null },
  "appel-final": { mood: "curious", line: "On se voit en démo ?" },
};

export const SITE_SECTION_IDS = Object.keys(SITE_SECTIONS);

export function siteSectionReaction(sectionId: string | null | undefined): SectionReaction | null {
  if (!sectionId) return null;
  return SITE_SECTIONS[sectionId] ?? null;
}

/** La phrase quand on clique « Réserver une démo » : le robot fait la fête. */
export const DEMO_CLICK_LINE = "Super ! À très vite.";

/** Un lien qui mène à la réservation d'une démo (le compagnon fête le clic). */
export function isDemoLink(href: string | null | undefined): boolean {
  if (!href) return false;
  try {
    return new URL(href, "https://pharmaboost.app").pathname.replace(/\/+$/, "") === "/decouvrir/demo";
  } catch {
    return false;
  }
}

/**
 * Le compagnon du site ne gêne jamais : il disparaît là où un formulaire se remplit (réserver une démo, s'abonner,
 * devenir partenaire, postuler à l'affiliation) — sur téléphone, il couvrirait les champs et le bouton d'envoi.
 */
const SITE_FORM_PAGES = ["/decouvrir/demo", "/decouvrir/abonnement", "/decouvrir/partenaires", "/decouvrir/affiliation"];

export function siteCompanionAllowed(pathname: string, narrow: boolean): boolean {
  if (!narrow) return true;
  return !SITE_FORM_PAGES.some((page) => pathname === page || pathname.startsWith(`${page}/`));
}

/** Chaque phrase de section ne se dit qu'une fois par visite (gardé dans la session du navigateur). */
export const SITE_COMPANION_KEY = "pharmaboost:robot-compagnon";

export type CompanionMemory = { minimised: boolean; said: string[] };

export function parseCompanionMemory(raw: string | null | undefined): CompanionMemory {
  try {
    const value = JSON.parse(raw ?? "") as Partial<CompanionMemory> | null;
    return {
      minimised: value?.minimised === true,
      said: Array.isArray(value?.said) ? value.said.filter((entry): entry is string => typeof entry === "string") : [],
    };
  } catch {
    return { minimised: false, said: [] };
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Le logiciel : le bonjour, et où le petit compagnon se pose
// ---------------------------------------------------------------------------------------------------------------

/** « Bonjour Paul ! » jusqu'à 18 h, « Bonsoir Paul ! » ensuite (et la nuit). Sans prénom : « Bonjour ! ». */
export function robotGreeting(hour: number, firstName: string | null | undefined): string {
  const word = hour >= 18 || hour < 4 ? "Bonsoir" : "Bonjour";
  const name = firstName?.trim();
  return name ? `${word} ${name} !` : `${word} !`;
}

/**
 * Où le petit compagnon du logiciel NE se pose PAS : l'écran de vente (le robot vit déjà dans sa barre du bas, et le
 * compagnon couvrirait les boutons « Confirmer » / « Vente terminée »), et l'impression du plan patient.
 * Ni sur « Nouvelle vente » (l'accueil du logiciel) : le grand robot y est déjà, en tête de page, et la saisie manuelle
 * y garde son bouton « Continuer » collé en bas de l'écran.
 */
export function appCompanionAllowed(pathname: string): boolean {
  if (pathname === "/" || /^\/vente\/[^/]+\/?$/.test(pathname)) return false;
  if (/\/imprimer(?:\/|$)/.test(pathname) || /\/plan(?:\/|$)/.test(pathname)) return false;
  return true;
}

/**
 * Une fête à rejouer après un changement de page : « Vente terminée » ouvre la page de fin, et c'est là que le
 * compagnon doit sauter de joie (gardé le temps de la navigation, dans la session du navigateur).
 */
export const PENDING_CHEER_KEY = "pharmaboost:robot-fete";

/**
 * Ce que dit le robot de « Nouvelle vente » quand il n'a pas de phrase utile (challenge, date courte, stock) : ce
 * qu'il est en train de faire, rien de plus. Jamais de conseil, jamais de promesse.
 */
export function counterMoodLine(mood: RobotMood): string {
  if (mood === "thinking") return "Je cherche les conseils utiles pour cette vente…";
  if (mood === "curious") return "Un bip ! Je regarde la vente qui arrive.";
  if (mood === "happy" || mood === "celebrate") return "Bravo, un conseil de plus aujourd'hui !";
  if (mood === "concerned") return "Une mise en garde est à relire.";
  return "Au prochain scan, je vous montre le bon conseil.";
}
