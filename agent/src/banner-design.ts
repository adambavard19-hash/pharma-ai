/**
 * Le design de la bannière PharmaBoost du poste de caisse : UNE source, deux lecteurs.
 *
 *  - la bannière Windows (notice-host.ts) lit ces valeurs pour dessiner : couleurs, cotes, durées, textes ;
 *  - l'aperçu pour Mac (banner-preview.ts → agent/apercu/banniere.html) lit les mêmes valeurs pour dessiner la même chose.
 *
 * Un changement de couleur, de taille ou de phrase se fait ici, une fois, et les deux suivent. Un test garde l'aperçu à jour.
 * Les cotes sont en pixels « à 100 % d'affichage » : Windows les multiplie par l'échelle de l'écran (125 %, 150 %…).
 */

export const BANNER = {
  colors: {
    // La carte : un bleu-vert profond, très légèrement transparent, avec un liseré qui brille.
    cardTop: "#0F3F54",
    cardBottom: "#082638",
    cardAlpha: 0.94,
    glow: "#36E8C8",
    text: "#F4FBFF",
    muted: "#A9CBD8",
    // L'accent PharmaBoost : le vert des boutons et de la coche.
    accent: "#22C88F",
    accentDark: "#14A06F",
    // Le panneau clair des conseils.
    panel: "#F5FAFC",
    ink: "#10222F",
    inkSoft: "#5A7280",
    line: "#DCE8EE",
    // Les pastilles.
    challengeBg: "#FFF0C7",
    challengeFg: "#8A5A00",
    challengeIcon: "#F2A516",
    dateBg: "#FFE1DE",
    dateFg: "#B42318",
    stockBg: "#D8F6E6",
    stockFg: "#087443",
    lowBg: "#FEF0C7",
    lowFg: "#B54708",
    outBg: "#FEE4E2",
    outFg: "#B42318",
    unknownBg: "#EAF0F3",
    unknownFg: "#475467",
    // Les réponses du pharmacien.
    soldBg: "#22C88F",
    soldFg: "#FFFFFF",
    notSoldBg: "#E6EDF1",
    notSoldFg: "#4B5F6C",
    waitingBg: "#FFF0C7",
    waitingFg: "#8A5A00",
    alertBg: "#FFF3D6",
    alertFg: "#9A5B00",
    // La mascotte.
    shellTop: "#FFFFFF",
    shellBottom: "#C4E1EC",
    shellEdge: "#8FBCD0",
    screenTop: "#0A2234",
    screenBottom: "#0E3550",
    eye: "#58F2D8",
    ear: "#27C9B0",
  },
  sizes: {
    /** Marge autour de la carte, pour l'ombre douce. */
    margin: 20,
    radius: 24,
    widthIdle: 400,
    widthReady: 400,
    widthExpanded: 520,
    widthDone: 420,
    widthReduced: 256,
    heightIdle: 100,
    heightReady: 134,
    heightDone: 132,
    heightReduced: 64,
    header: 88,
    buttonHeight: 40,
    finishHeight: 46,
    mascot: 84,
    thumb: 46,
    iconButton: 26,
  },
  timing: {
    /** Le temps où « 3 conseils disponibles » reste seul, avant que la bannière s'agrandisse d'elle-même. */
    readyPauseMs: 1100,
    /** « Rien à ajouter » reste affiché ce temps, puis la bannière redevient « en attente ». */
    quietMs: 8000,
    /** « Vente terminée ! » reste affiché ce temps. */
    doneMs: 7000,
    /** Une analyse qui ne répond pas ne garde pas la bannière en « analyse en cours » plus longtemps. */
    scanTimeoutMs: 45000,
    idleFps: 15,
    motionFps: 40,
    /** Part de l'écart rattrapée à chaque image quand la bannière s'agrandit ou se réduit (0 à 1). */
    ease: 0.22,
  },
  text: {
    brand: "PharmaBoost",
    idle: "En attente de scan…",
    scanTitle: "Scan détecté !",
    scanSub: "Analyse en cours…",
    readyOne: "1 conseil disponible",
    readyMany: "{n} conseils disponibles",
    readyButton: "Voir les conseils",
    forSaleOne: "1 conseil pour cette délivrance",
    forSaleMany: "{n} conseils pour cette délivrance",
    duringSale: "Pendant la vente",
    readFirst: "À lire avant de conseiller",
    questionTitle: "Une question à poser",
    questionSub: "Pour choisir le bon conseil",
    quiet: "Rien à ajouter",
    quietSub: "Aucun conseil pour cette vente",
    sold: "Vendu",
    notSold: "Non vendu",
    change: "Modifier",
    detail: "Voir le détail",
    emailAdd: "Ajouter l'e-mail du patient",
    emailSaved: "E-mail enregistré",
    emailRemove: "Retirer",
    finish: "Vente terminée",
    finishing: "Enregistrement…",
    doneTitle: "Vente terminée !",
    challenge: "Challenge",
    shortDate: "Date courte",
    inStock: "En stock",
    lowStock: "Stock faible",
    outOfStock: "Rupture",
    unknownStock: "Stock à vérifier",
    reducedIdle: "En attente",
    allDone: "Tous traités",
    reducedMany: "{n} conseils",
    reducedOne: "1 conseil",
    forDrug: "Pour : ",
    pinTip: "Verrouiller la position",
    minTip: "Réduire",
    closeTip: "Masquer",
  },
} as const;

export type BannerSpec = typeof BANNER;

/** « #22C88F » → « 34, 200, 143 » : les trois composantes, pour le code Windows. */
export function rgbOf(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
}

/** Une couleur du design, écrite pour C# : `Color.FromArgb(255, 34, 200, 143)`. */
export function csColor(hex: string, alpha = 1): string {
  const [r, g, b] = rgbOf(hex);
  return `Color.FromArgb(${Math.round(alpha * 255)}, ${r}, ${g}, ${b})`;
}

/** Une phrase du design avec son nombre : « {n} conseils disponibles » → « 3 conseils disponibles ». */
export function withCount(template: string, count: number): string {
  return template.replace("{n}", String(count));
}
