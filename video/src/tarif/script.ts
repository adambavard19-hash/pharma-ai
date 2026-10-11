/**
 * LE TEXTE DU FILM « TARIF » — une seule source.
 *
 *  - la voix : scripts/voix-tarif.mjs envoie `say` à ElevenLabs (voix « Yann ») et écrit public/voix/tarif/T1.mp3 … T7 ;
 *  - le montage : src/films/tarif.tsx mesure la durée réelle de chaque fichier et cale dessus les scènes et les
 *    sous-titres (`chunks`, de 2 à 4 mots, le mot clé entre astérisques).
 *
 * Les chiffres ne sont écrits nulle part ici : ils viennent du calcul du site (src/core/pricing/revenue-estimate.ts,
 * mêmes hypothèses, même arrondi) et de l'offre officielle (src/core/pricing/official-offer.ts). Le texte affiché les
 * écrit en chiffres (« 3 500 € »), la voix en toutes lettres (« trois mille cinq cents euros ») : la synthèse lit mieux
 * les mots. Si une hypothèse change, le texte suit ; la voix, elle, est à refaire (`node scripts/voix-tarif.mjs`) — le
 * film refuse de se rendre sur une voix qui dit d'autres chiffres (public/voix/tarif/voix.json).
 *
 * Les règles des films valent ici : pas de « douchette » ni de « bip », pas d'« interactions », jamais « essai » ni
 * « gratuit » ; l'estimation est dite indicative, et c'est du chiffre d'affaires, pas une marge.
 * Ce fichier est lu par Node sans compilation (types effacés) : imports avec leur extension, pas d'enum.
 */
import { ESTIMATE_ASSUMPTIONS, estimateAdditionalRevenue } from "../../../src/core/pricing/revenue-estimate.ts";
import { OFFICIAL_OFFER, formatPriceEuros } from "../../../src/core/pricing/official-offer.ts";

// ---- Les nombres en toutes lettres (orthographe traditionnelle) -------------------------------------------------

const UNITS = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf"];
const TENS = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante"];

function below100(n: number): string {
  if (n < 20) return UNITS[n];
  if (n < 70) {
    const u = n % 10;
    return TENS[Math.floor(n / 10)] + (u === 0 ? "" : u === 1 ? " et un" : `-${UNITS[u]}`);
  }
  if (n < 80) return n === 71 ? "soixante et onze" : `soixante-${UNITS[n - 60]}`;
  return n === 80 ? "quatre-vingts" : `quatre-vingt-${UNITS[n - 80]}`;
}

function below1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (h === 0) return below100(r);
  const head = h === 1 ? "cent" : `${UNITS[h]} cent${r === 0 ? "s" : ""}`;
  return r === 0 ? head : `${head} ${below100(r)}`;
}

/** 200 → « deux cents », 3 500 → « trois mille cinq cents », 126 → « cent vingt-six » (entiers de 0 à 999 999). */
export function frenchNumber(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999_999) throw new Error(`Nombre hors des cas prévus : ${n}`);
  if (n < 1000) return below1000(n);
  const th = Math.floor(n / 1000);
  const r = n % 1000;
  // « deux cents » et « quatre-vingts » perdent leur s devant « mille ».
  const head = th === 1 ? "mille" : `${below1000(th).replace(/(cent|vingt)s$/, "$1")} mille`;
  return r === 0 ? head : `${head} ${below1000(r)}`;
}

/** 700 → « sept euros », 690 → « six euros quatre-vingt-dix ». */
export function frenchEuros(cents: number): string {
  const euros = Math.floor(cents / 100);
  const rest = cents % 100;
  const main = `${frenchNumber(euros)} euro${euros > 1 ? "s" : ""}`;
  return rest === 0 ? main : `${main} ${frenchNumber(rest)}`;
}

// ---- Les chiffres de l'exemple, tirés du code du site -----------------------------------------------------------

/** L'exemple du site : la valeur de départ du simulateur. */
export const EXAMPLE_CLIENTS = 200;
/** Le nombre que le pointeur choisit au curseur du simulateur, à la fin : « votre propre nombre » (un exemple). */
export const OWN_CLIENTS = 300;

export const A = ESTIMATE_ASSUMPTIONS;
/** Le calcul du site, tel quel (le simulateur de la fin le refait pour le nombre tapé). */
export const estimateFor = estimateAdditionalRevenue;
export const ESTIMATE = estimateAdditionalRevenue(EXAMPLE_CLIENTS);
export const RATE_PERCENT = Math.round(A.adviceRate * 100);
export const MONTHLY_PRICE_CENTS = OFFICIAL_OFFER.monthlyPriceCents;

/** Les montants tels que le site les écrit : « 7 € », « 3 500 € » (espaces insécables). */
export const money = formatPriceEuros;
const NB = " ";
/** « 3 500 » → « 3 500 » insécable, pour les nombres sans unité. */
export const num = (n: number) => n.toLocaleString("fr-FR").replace(/\s/g, NB);

const T = {
  clients: num(ESTIMATE.clientsPerDay),
  rate: `${RATE_PERCENT}${NB}%`,
  advised: num(ESTIMATE.advisedClientsPerDay),
  product: money(A.averageProductCents),
  perDay: money(ESTIMATE.perDayCents),
  days: num(A.openDaysPerMonth),
  perMonth: money(ESTIMATE.perMonthCents),
  price: money(MONTHLY_PRICE_CENTS),
};

const V = {
  clients: frenchNumber(ESTIMATE.clientsPerDay),
  rate: `${frenchNumber(RATE_PERCENT)} pour cent`,
  advised: frenchNumber(ESTIMATE.advisedClientsPerDay),
  product: frenchEuros(A.averageProductCents),
  perDay: frenchEuros(ESTIMATE.perDayCents),
  days: frenchNumber(A.openDaysPerMonth),
  perMonth: frenchEuros(ESTIMATE.perMonthCents),
  price: frenchEuros(MONTHLY_PRICE_CENTS),
};

// ---- Le script --------------------------------------------------------------------------------------------------

export type TarifLine = {
  /** Le nom du fichier de voix (public/voix/tarif/<id>.mp3). */
  id: string;
  /** Ce qui est dit, tel qu'on l'écrit (chiffres en chiffres). */
  text: string;
  /** Ce qui est envoyé à la voix : nombres en toutes lettres, « Pharma Boost » en deux mots. */
  say: string;
  /** Les sous-titres incrustés, dans l'ordre : 2 à 4 mots, le mot clé `*entre astérisques*` ; l'espace insécable lie. */
  chunks: string[];
  /** Le silence après la phrase, en secondes, avant la suivante (ou la carte de fin). */
  gapAfter: number;
};

export const SCRIPT: TarifLine[] = [
  {
    id: "T1",
    text: "Combien PharmaBoost peut-il vous rapporter ? Faisons le calcul, simplement.",
    say: "Combien Pharma Boost peut-il vous rapporter ? Faisons le calcul, simplement.",
    chunks: ["Combien *PharmaBoost*", `peut-il vous *rapporter*${NB}?`, "Faisons le *calcul*,", "simplement."],
    gapAfter: 0.3,
  },
  {
    id: "T2",
    text: `Prenez une pharmacie qui reçoit ${T.clients} clients par jour.`,
    say: `Prenez une pharmacie qui reçoit ${V.clients} clients par jour.`,
    chunks: ["Prenez une *pharmacie*", `qui reçoit *${T.clients}${NB}clients*`, `par${NB}jour.`],
    gapAfter: 0.35,
  },
  {
    id: "T3",
    text: `Si seulement ${T.rate} d'entre eux prennent un conseil en plus, cela fait ${T.advised} clients par jour.`,
    say: `Si seulement ${V.rate} d'entre eux prennent un conseil en plus, cela fait ${V.advised} clients par jour.`,
    chunks: [`Si seulement *${T.rate}*`, "d'entre eux", `prennent un *conseil* en${NB}plus,`, `cela fait *${T.advised}${NB}clients*`, `par${NB}jour.`],
    gapAfter: 0.35,
  },
  {
    id: "T4",
    text: `À ${T.product} le produit en moyenne : ${T.perDay} par jour.`,
    say: `À ${V.product} le produit en moyenne : ${V.perDay} par jour.`,
    chunks: [`À *${T.product}* le${NB}produit`, `en${NB}moyenne${NB}:`, `*${T.perDay}* par${NB}jour.`],
    gapAfter: 0.4,
  },
  {
    id: "T5",
    text: `Sur ${T.days} jours d'ouverture : ${T.perMonth} de chiffre d'affaires en plus, chaque mois.`,
    say: `Sur ${V.days} jours d'ouverture : ${V.perMonth} de chiffre d'affaires en plus, chaque mois.`,
    chunks: [`Sur *${T.days}${NB}jours* d'ouverture${NB}:`, `*${T.perMonth}*`, `de chiffre d'affaires en${NB}plus,`, `chaque${NB}mois.`],
    // Le temps de lire le total et « Chiffre d'affaires, pas une marge. ».
    gapAfter: 0.55,
  },
  {
    id: "T6",
    text: `Pour un abonnement de ${T.price} HT par mois.`,
    say: `Pour un abonnement de ${V.price} hors taxe par mois.`,
    chunks: ["Pour un *abonnement*", `de *${T.price}${NB}HT*`, `par${NB}mois.`],
    // Les deux barres, à la même échelle : on les laisse se lire.
    gapAfter: 0.7,
  },
  {
    id: "T7",
    text: "Faites le calcul avec votre propre nombre de clients, juste en dessous.",
    say: "Faites le calcul avec votre propre nombre de clients, juste en dessous.",
    chunks: ["Faites le *calcul*", `avec votre *propre${NB}nombre*`, "de clients,", `juste *en${NB}dessous.*`],
    // Le simulateur reste un instant, avec le nombre choisi et son résultat, avant la carte de fin.
    gapAfter: 0.9,
  },
];

/**
 * Les mêmes sous-titres, comme la voix les prononce : sert à répartir leur temps au prorata des syllabes (« 3 500 € »
 * n'a aucune voyelle écrite, « trois mille cinq cents euros » en a sept).
 */
export function spokenChunk(chunk: string): string {
  const plain = chunk.replace(/\*/g, "");
  // Un nombre, avec ses espaces de milliers (« 3 500 ») ; l'espace qui le suit reste.
  const n = String.raw`(\d+(?:[\s  ]\d{3})*)`;
  const words = (digits: string) => frenchNumber(Number(digits.replace(/\D/g, "")));
  return plain
    .replace(new RegExp(String.raw`${n}[\s  ]?€`, "g"), (_, d: string) => `${words(d)} euros`)
    .replace(new RegExp(String.raw`${n}[\s  ]?%`, "g"), (_, d: string) => `${words(d)} pour cent`)
    .replace(new RegExp(n, "g"), (_, d: string) => words(d))
    .replace(/\bHT\b/g, "hors taxe")
    .replace(/PharmaBoost/g, "Pharma Boost");
}

/** Le dossier des voix, sous public/ (staticFile). */
export const VOICE_DIR = "voix/tarif";
/** La voix et le modèle d'ElevenLabs. */
export const VOICE = { name: "Yann", id: "nr2EGJNe96rzn9FRlTId", model: "eleven_multilingual_v2" };

/** Les durées de la voix « Yann » du 10 octobre 2026, si un fichier manque : le film reste calculable. */
export const FALLBACK_DURATIONS = [3.62, 2.8, 5.17, 4.18, 6.13, 3.31, 3.66];
