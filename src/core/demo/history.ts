/**
 * L'historique de l'officine de démonstration : cinq semaines de comptoir,
 * assez fournies pour que chaque tableau de bord ait quelque chose à dire
 * (jour, semaine, mois), assez irrégulières pour paraître vraies.
 *
 * Pur et déterministe : mêmes entrées, mêmes lignes. Le planificateur ne
 * touche ni la base ni l'horloge (l'instant est un paramètre) ; l'installation
 * traduit son plan en lignes. Tout est FICTIF, y compris les taux : ils sont
 * réglés pour raconter une histoire crédible (un taux d'acceptation de l'ordre
 * de deux conseils sur trois, qui progresse), jamais présentés comme des
 * résultats réels.
 */

import type { DemoMember } from "./identity";

export type AdviceTarget = { kind: "product"; slug: string } | { kind: "drug"; key: string };
/**
 * Le sort d'un conseil, comme l'application le consigne : jamais tranché (`IGNORED`), retiré par l'équipe
 * (`REMOVED`), proposé au patient puis refusé (`DECLINED`), retenu sans vente confirmée (`ACCEPTED`), acheté (`PURCHASED`).
 */
export type AdviceStatus = "PURCHASED" | "ACCEPTED" | "DECLINED" | "REMOVED" | "IGNORED";

export type PlannedAdvice = {
  ruleKey: string;
  title: string;
  category: string;
  target: AdviceTarget;
  status: AdviceStatus;
  quantity: number;
  unitPriceCents: number;
  marginCents: number;
  reason: string;
  /** Vrai pour un produit ajouté à la main par l'équipe : il n'est pas un conseil de PharmaBoost. */
  manual: boolean;
};

export type PlannedGap = { ruleKey: string; title: string; category: string; cause: "OUT_OF_STOCK" | "NOT_REFERENCED" | "NO_SUITABLE" };

export type PlannedVisit = {
  index: number;
  at: Date;
  member: DemoMember["key"];
  /** Les boîtes passées à la douchette (clés du stock médicament de démonstration). */
  scans: string[];
  advice: PlannedAdvice[];
  gaps: PlannedGap[];
  outcome: "PROPOSALS" | "NO_RELEVANT_NEED" | "OUT_OF_STOCK";
};

export type ShelfEntry = { name: string; category: string; salePriceCents: number; purchasePriceCents: number };

export type HistoryInput = {
  now: Date;
  days: number;
  seed: number;
  shelf: ReadonlyMap<string, ShelfEntry>;
  drugPrices: ReadonlyMap<string, number>;
};

type Proposal = { ruleKey: string; title: string; category: string; targets: AdviceTarget[]; reason: string; shown: number; appeal: number };
type Profile = { key: string; weight: number; scans: string[]; proposals: Proposal[] };

const product = (slug: string): AdviceTarget => ({ kind: "product", slug });
const drug = (key: string): AdviceTarget => ({ kind: "drug", key });

const PROFILES: Profile[] = [
  {
    key: "antibiotique", weight: 20, scans: ["augmentin-adulte", "doliprane-1000"],
    proposals: [
      { ruleKey: "digestive-tolerance-antibiotics", title: "Tolérance digestive pendant l'antibiothérapie", category: "PROBIOTIQUES", targets: [drug("ultra-levure"), product("probio-flore-10"), product("probio-confort")], reason: "Antibiotique : la flore intestinale peut être perturbée pendant la cure.", shown: 0.95, appeal: 0.92 },
      { ruleKey: "convalescence-immunity-vitamins", title: "Vitamines pendant la convalescence", category: "VITAMINES", targets: [product("multivitamines-immunite"), product("vitamine-c-1000")], reason: "Infection en cours : un soutien des défenses peut aider la convalescence.", shown: 0.55, appeal: 0.62 },
      { ruleKey: "antibiotic-intimate-care", title: "Confort intime pendant l'antibiothérapie", category: "HYGIENE", targets: [product("gel-intime-flore")], reason: "Un antibiotique peut déséquilibrer la flore intime.", shown: 0.3, appeal: 0.5 },
    ],
  },
  {
    key: "antibio-enfant", weight: 7, scans: ["augmentin-enfant", "doliprane-suppo"],
    proposals: [
      { ruleKey: "digestive-tolerance-antibiotics", title: "Tolérance digestive pendant l'antibiothérapie", category: "PROBIOTIQUES", targets: [product("probio-enfant")], reason: "Antibiotique de l'enfant : la flore intestinale peut être perturbée.", shown: 0.95, appeal: 1.0 },
      { ruleKey: "fever-thermometer", title: "Surveillance de la température", category: "DISPOSITIFS_MEDICAUX", targets: [product("thermometre-frontal")], reason: "Fièvre de l'enfant : suivre la température à la maison.", shown: 0.45, appeal: 0.45 },
    ],
  },
  {
    key: "douleur", weight: 14, scans: ["ibuprofene-400", "ixprim", "spasfon"],
    proposals: [
      { ruleKey: "gastric-protection-nsaid", title: "Confort gastrique sous anti-inflammatoire", category: "SOINS", targets: [drug("gaviscon"), product("argile-gastrique")], reason: "Anti-inflammatoire : l'inconfort gastrique fait souvent arrêter le traitement.", shown: 0.8, appeal: 0.78 },
      { ruleKey: "pain-cold-hot-pack", title: "Chaud ou froid sur la douleur", category: "DISPOSITIFS_MEDICAUX", targets: [product("poche-chaud-froid")], reason: "Douleur musculaire : le chaud ou le froid soulage en complément.", shown: 0.6, appeal: 0.6 },
      { ruleKey: "opioid-transit", title: "Transit sous antalgique opioïde", category: "NUTRITION", targets: [product("fibres-transit")], reason: "Antalgique opioïde : la constipation est fréquente.", shown: 0.5, appeal: 0.58 },
    ],
  },
  {
    key: "allergie", weight: 11, scans: ["cetirizine", "nasonex"],
    proposals: [
      { ruleKey: "eye-irritation-allergy", title: "Yeux irrités en contexte allergique", category: "SOINS", targets: [drug("cromabak"), product("serum-physiologique")], reason: "Allergie : les yeux sont souvent atteints en même temps que le nez.", shown: 0.7, appeal: 0.7 },
      { ruleKey: "nasal-hygiene-orl", title: "Hygiène nasale en contexte ORL", category: "SOINS", targets: [product("spray-nasal-marin"), product("spray-nasal-hypertonique")], reason: "Un lavage du nez prépare l'action du spray prescrit.", shown: 0.65, appeal: 0.74 },
    ],
  },
  {
    key: "chronique", weight: 12, scans: ["amlodipine", "ramipril", "omeprazole"],
    proposals: [
      { ruleKey: "hypertension-self-measurement", title: "Automesure de la tension", category: "DISPOSITIFS_MEDICAUX", targets: [product("tensiometre-bras")], reason: "Traitement antihypertenseur : mesurer sa tension à domicile aide le suivi.", shown: 0.35, appeal: 0.4 },
      { ruleKey: "magnesium-ppi-longterm", title: "Magnésium sous IPP au long cours", category: "MAGNESIUM", targets: [product("magnesium-marin-b6"), product("magnesium-bisglycinate")], reason: "Un inhibiteur de la pompe à protons au long cours peut abaisser le magnésium.", shown: 0.5, appeal: 0.55 },
    ],
  },
  {
    key: "peau", weight: 6, scans: ["isotretinoine"],
    proposals: [
      { ruleKey: "isotretinoin-skin-routine", title: "Routine peau sous isotrétinoïne", category: "DERMOCOSMETIQUE", targets: [product("gel-nettoyant-doux"), product("creme-emolliente")], reason: "Le traitement dessèche la peau : une routine douce est indispensable.", shown: 1, appeal: 0.85 },
      { ruleKey: "lip-care-isotretinoin", title: "Lèvres sous isotrétinoïne", category: "DERMOCOSMETIQUE", targets: [product("stick-levres-spf")], reason: "Les lèvres sèchent très vite sous isotrétinoïne.", shown: 0.9, appeal: 0.88 },
    ],
  },
  {
    key: "herpes", weight: 6, scans: ["valaciclovir"],
    proposals: [
      { ruleKey: "herpes-labial-patch", title: "Bouton de fièvre", category: "SOINS", targets: [product("patch-bouton-fievre")], reason: "Un patch protège la lésion et limite la contamination.", shown: 0.8, appeal: 0.66 },
      { ruleKey: "herpes-zona-antiseptic", title: "Soin des lésions d'herpès ou de zona", category: "SOINS", targets: [drug("biseptine"), product("antiseptique-cutane")], reason: "Une lésion ouverte se désinfecte.", shown: 0.5, appeal: 0.55 },
      { ruleKey: "hand-hygiene-contagious", title: "Hygiène des mains, lésions contagieuses", category: "HYGIENE", targets: [product("gel-hydroalcoolique")], reason: "Les lésions restent contagieuses : se frictionner les mains après chaque contact.", shown: 0.8, appeal: 0.82 },
    ],
  },
  {
    key: "asthme", weight: 5, scans: ["ventoline", "flixotide"],
    proposals: [
      { ruleKey: "inhaler-spacer-chamber", title: "Chambre d'inhalation avec un aérosol-doseur", category: "DISPOSITIFS_MEDICAUX", targets: [product("chambre-inhalation")], reason: "Une chambre améliore la délivrance de l'aérosol-doseur.", shown: 0.7, appeal: 0.55 },
      { ruleKey: "mouth-rinse-inhaled-corticosteroid", title: "Rinçage de bouche après corticoïde inhalé", category: "HYGIENE", targets: [product("bain-bouche-doux")], reason: "Se rincer la bouche limite les mycoses après un corticoïde inhalé.", shown: 0.7, appeal: 0.72 },
    ],
  },
  {
    key: "diabete", weight: 5, scans: ["lantus", "metformine"],
    proposals: [
      { ruleKey: "self-injection-sharps-container", title: "Collecteur d'aiguilles pour les injections à domicile", category: "DISPOSITIFS_MEDICAUX", targets: [product("collecteur-aiguilles")], reason: "Les aiguilles usagées s'éliminent dans un collecteur sécurisé.", shown: 0.75, appeal: 0.82 },
      { ruleKey: "diabetes-foot-care", title: "Soin des pieds sous traitement antidiabétique", category: "SOINS", targets: [product("creme-pieds-uree")], reason: "Le diabète fragilise la peau des pieds.", shown: 0.6, appeal: 0.6 },
    ],
  },
  {
    key: "corticoide", weight: 4, scans: ["prednisolone", "omeprazole"],
    proposals: [{ ruleKey: "corticosteroid-oral-calcium", title: "Calcium sous corticothérapie orale prolongée", category: "MINERAUX", targets: [product("calcium-vitamine-d")], reason: "Une corticothérapie prolongée fragilise l'os : calcium et vitamine D.", shown: 0.8, appeal: 0.65 }],
  },
  {
    key: "fatigue", weight: 6, scans: ["escitalopram"],
    proposals: [{ ruleKey: "magnesium-fatigue", title: "Fatigue et tension musculaire", category: "MAGNESIUM", targets: [product("magnesium-bisglycinate"), product("magnesium-marin-b6")], reason: "Fatigue et tension musculaire fréquentes dans ce contexte.", shown: 0.7, appeal: 0.55 }],
  },
  {
    key: "gastro-enfant", weight: 5, scans: ["tiorfan-enfant", "doliprane-suppo"],
    proposals: [
      { ruleKey: "rehydration-digestive", title: "Réhydratation", category: "NUTRITION", targets: [product("solution-rehydratation")], reason: "Une diarrhée de l'enfant expose à la déshydratation.", shown: 0.95, appeal: 0.9 },
      { ruleKey: "fever-thermometer", title: "Surveillance de la température", category: "DISPOSITIFS_MEDICAUX", targets: [product("thermometre-frontal")], reason: "Surveiller la température de l'enfant.", shown: 0.4, appeal: 0.5 },
    ],
  },
  // Des ordonnances sans besoin repéré : un moteur honnête ne propose pas à chaque fois.
  { key: "sans-besoin", weight: 9, scans: ["levothyrox", "atorvastatine"], proposals: [] },
];

/** Les besoins que le rayon n'a pas couverts : ils nourrissent « Assortiment ». */
const GAP_PROPOSALS: PlannedGap[] = [
  { ruleKey: "herpes-lysine", title: "Lysine en accompagnement de l'herpès", category: "NUTRITION", cause: "OUT_OF_STOCK" },
  { ruleKey: "orlistat-fat-soluble-vitamins", title: "Vitamines liposolubles sous orlistat", category: "VITAMINES", cause: "NOT_REFERENCED" },
  { ruleKey: "dry-eye-eyelid-care", title: "Hygiène des paupières", category: "SOINS", cause: "NO_SUITABLE" },
];

/** Le taux d'acceptation de chacun : de quoi comparer l'équipe sans caricature. */
const MEMBER_ACCEPTANCE: Record<DemoMember["key"], { weight: number; acceptance: number }> = {
  owner: { weight: 3, acceptance: 0.8 },
  pharmacist: { weight: 4, acceptance: 1.12 },
  technician: { weight: 4, acceptance: 1.0 },
  student: { weight: 2, acceptance: 0.78 },
};

/** Générateur congruentiel : déterministe, sans dépendance. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function pickWeighted<T>(items: readonly T[], weightOf: (item: T) => number, random: () => number): T {
  const total = items.reduce((sum, item) => sum + weightOf(item), 0);
  let cursor = random() * total;
  for (const item of items) {
    cursor -= weightOf(item);
    if (cursor <= 0) return item;
  }
  return items[items.length - 1];
}

const DAY_MS = 86_400_000;

/** Combien de passages un jour donné : l'officine ferme le dimanche, ralentit le samedi. */
function visitsForDay(date: Date, isToday: boolean, random: () => number): number {
  const weekday = date.getUTCDay();
  if (isToday) return 7 + Math.floor(random() * 4);
  if (weekday === 0) return 0;
  if (weekday === 6) return 8 + Math.floor(random() * 5);
  return 13 + Math.floor(random() * 6);
}

export function planHistory(input: HistoryInput): PlannedVisit[] {
  const random = seededRandom(input.seed);
  const visits: PlannedVisit[] = [];
  const nowMs = input.now.getTime();
  const todayStart = new Date(Date.UTC(input.now.getUTCFullYear(), input.now.getUTCMonth(), input.now.getUTCDate()));

  for (let back = input.days - 1; back >= 0; back -= 1) {
    const dayStart = new Date(todayStart.getTime() - back * DAY_MS);
    const isToday = back === 0;
    // Une progression douce : la dernière semaine accepte un peu plus que la première.
    const trend = 0.86 + 0.2 * ((input.days - 1 - back) / (input.days - 1));
    const count = visitsForDay(dayStart, isToday, random);
    for (let n = 0; n < count; n += 1) {
      // Les horaires d'ouverture (9 h – 19 h 30, heure de Paris ≈ UTC+1/+2) ; aujourd'hui : les dernières heures écoulées.
      const at = isToday
        ? new Date(nowMs - (12 + Math.floor(random() * 170)) * 60_000)
        : new Date(dayStart.getTime() + (7 * 60 + Math.floor(random() * 10.5 * 60)) * 60_000);
      if (at.getTime() >= nowMs) continue;
      const profile = pickWeighted(PROFILES, (item) => item.weight, random);
      const member = pickWeighted(Object.entries(MEMBER_ACCEPTANCE), ([, value]) => value.weight, random)[0] as DemoMember["key"];
      const memberFactor = MEMBER_ACCEPTANCE[member].acceptance;

      const advice: PlannedAdvice[] = [];
      for (const proposal of profile.proposals) {
        if (random() > proposal.shown) continue;
        const target = proposal.targets[Math.floor(random() * proposal.targets.length)];
        const price = target.kind === "product" ? input.shelf.get(target.slug)?.salePriceCents ?? 0 : input.drugPrices.get(target.key) ?? 0;
        if (price <= 0) continue;
        const margin = target.kind === "product" ? price - (input.shelf.get(target.slug)?.purchasePriceCents ?? 0) : Math.round(price * 0.3);
        // D'abord l'équipe : elle laisse certains conseils sans réponse, en retire d'autres. Puis le patient : il achète, ou refuse.
        const chance = Math.min(0.97, proposal.appeal * 1.02 * memberFactor * trend);
        const stance = random();
        const status: AdviceStatus = stance < 0.08 ? "IGNORED" : stance < 0.08 + 0.13 ? "REMOVED" : random() < chance ? (random() < 0.9 ? "PURCHASED" : "ACCEPTED") : "DECLINED";
        // Une cure se prend souvent en deux boîtes : de temps en temps, le patient en emporte deux.
        const quantity = status === "PURCHASED" && target.kind === "product" && price < 2500 && random() < 0.18 ? 2 : 1;
        advice.push({ ruleKey: proposal.ruleKey, title: proposal.title, category: proposal.category, target, status, quantity, unitPriceCents: price, marginCents: margin, reason: proposal.reason, manual: false });
      }
      // Parfois, l'équipe ajoute un produit à la main : il compte dans le chiffre d'affaires, pas dans les conseils.
      if (advice.some((entry) => entry.status === "PURCHASED") && random() < 0.1) {
        const extra = input.shelf.get("gel-hydroalcoolique");
        if (extra) advice.push({ ruleKey: "manual", title: "Ajout au comptoir", category: extra.category, target: product("gel-hydroalcoolique"), status: "PURCHASED", quantity: 1, unitPriceCents: extra.salePriceCents, marginCents: extra.salePriceCents - extra.purchasePriceCents, reason: "Ajouté par l'équipe au comptoir.", manual: true });
      }

      // Le rayon n'a pas tout couvert : un besoin réel, sans produit à proposer.
      const gaps: PlannedGap[] = [];
      if (profile.proposals.length > 0 && random() < 0.14) gaps.push(GAP_PROPOSALS[Math.floor(random() * GAP_PROPOSALS.length)]);

      const proposed = advice.filter((entry) => !entry.manual).length;
      visits.push({
        index: visits.length,
        at,
        member,
        scans: profile.scans,
        advice,
        gaps,
        outcome: proposed > 0 ? "PROPOSALS" : gaps.length > 0 ? "OUT_OF_STOCK" : "NO_RELEVANT_NEED",
      });
    }
  }
  return visits.sort((a, b) => a.at.getTime() - b.at.getTime()).map((visit, index) => ({ ...visit, index }));
}

export type HistorySummary = { visits: number; proposed: number; offered: number; decided: number; accepted: number; acceptanceRate: number; attributedCents: number };

/** Les chiffres que le plan produira : pour le contrôle, et pour les tests. */
export function summarizeHistory(visits: PlannedVisit[]): HistorySummary {
  let proposed = 0;
  let offered = 0;
  let decided = 0;
  let accepted = 0;
  let attributedCents = 0;
  for (const visit of visits) {
    for (const entry of visit.advice) {
      if (entry.manual) continue;
      proposed += 1;
      if (entry.status === "IGNORED" || entry.status === "REMOVED") continue;
      // Proposé au patient : acheté, retenu, ou refusé.
      offered += 1;
      decided += 1;
      if (entry.status === "PURCHASED" || entry.status === "ACCEPTED") accepted += 1;
      if (entry.status === "PURCHASED") attributedCents += entry.unitPriceCents * entry.quantity;
    }
  }
  return { visits: visits.length, proposed, offered, decided, accepted, acceptanceRate: decided > 0 ? accepted / decided : 0, attributedCents };
}
