/**
 * Ce que PharmaBoost rapporte à une officine : le contrat de calcul.
 *
 * Tout est calculé à partir de lignes déjà enregistrées au comptoir
 * (conseils, décisions, lignes de vente). Rien n'est estimé, rien n'est
 * extrapolé : une donnée absente reste absente (`null`, ou comptée à part),
 * jamais remplacée par une valeur plausible.
 *
 * Deux notions ne se confondent jamais :
 *  - un conseil ACCEPTÉ : l'équipe l'a retenu au comptoir ;
 *  - une vente CONFIRMÉE : une vente enregistrée dans PharmaBoost contient la
 *    ligne issue de ce conseil, avec le prix réellement saisi.
 * Seules les ventes confirmées, au prix connu, font du chiffre d'affaires.
 */

export type PerformancePeriodKey = "today" | "7d" | "month" | "custom";
export type Granularity = "hour" | "day" | "week";

export type PerformancePeriod = {
  key: PerformancePeriodKey;
  label: string;
  /** Début inclus, fin exclue, en instants UTC ; les bornes de jour suivent le fuseau de l'officine. */
  start: Date;
  end: Date;
  /** La période de comparaison, de même durée écoulée, juste avant. */
  previousStart: Date;
  previousEnd: Date;
  granularity: Granularity;
  /** Nombre de jours civils couverts (au moins 1). */
  dayCount: number;
  /** Vrai quand la fin est « maintenant » : la comparaison se fait à durée écoulée égale. */
  inProgress: boolean;
  /** Pour reconstruire l'adresse : `yyyy-mm-dd` (période personnalisée seulement). */
  from?: string;
  to?: string;
};

// --- Lignes d'entrée (ce que le service lit en base) -------------------------

export type AdviceOrigin = "AI" | "RULE" | "MANUAL";

/** État d'un conseil, tel que stocké (RecommendationStatus). */
export type AdviceStatus =
  | "PROPOSED"
  | "ACCEPTED"
  | "MODIFIED"
  | "REPLACED"
  | "REMOVED"
  | "PRESENTED"
  | "PURCHASED"
  | "DECLINED"
  | "IGNORED";

/** Un conseil (une `Recommendation`) de l'officine. */
export type AdviceRow = {
  id: string;
  createdAt: Date;
  origin: AdviceOrigin;
  status: AdviceStatus;
  /** Produit de l'officine ou médicament conseil ; `label` est son nom tel qu'affiché. */
  productId: string | null;
  presentationId: string | null;
  label: string;
  /** Code catégorie du produit (ProductCategoryCode) ou `"MEDICAMENT"` pour un médicament conseil. */
  category: string;
  /** Prix au moment de la proposition, 0 quand il n'était pas connu. Sert seulement de repère, jamais de CA. */
  unitPriceCents: number;
  /** L'ordonnance d'origine a été supprimée : le conseil ne compte plus comme proposé. */
  prescriptionDeleted: boolean;
};

/** Une ligne de vente rattachée à un conseil (`SaleLine.recommendationId` non nul). */
export type ConfirmedLineRow = {
  saleId: string;
  /** Date de la vente (fait foi pour le chiffre d'affaires). */
  saleCreatedAt: Date;
  lineId: string;
  recommendationId: string;
  /** Origine du conseil : un conseil ajouté à la main (`MANUAL`) n'est pas un conseil PharmaBoost. */
  origin: AdviceOrigin;
  productId: string | null;
  presentationId: string | null;
  label: string;
  category: string;
  quantity: number;
  /** Prix unitaire réellement saisi à la vente, TTC, en centimes ; 0 = prix non renseigné. */
  unitPriceCents: number;
  totalCents: number;
  vatRate: number;
};

export type PerformanceInput = {
  period: PerformancePeriod;
  now: Date;
  timeZone: string;
  /** Les conseils proposés dans la période courante et dans la période précédente. */
  advice: AdviceRow[];
  previousAdvice: AdviceRow[];
  /** Les lignes de vente confirmées, datées par la vente. */
  lines: ConfirmedLineRow[];
  previousLines: ConfirmedLineRow[];
  /** Les conseils proposés sur les `RHYTHM_WINDOW_DAYS` derniers jours, quelle que soit la période choisie : le rythme d'une semaine ne dit rien. */
  rhythmAdvice: AdviceRow[];
};

// --- Résultats ---------------------------------------------------------------

/** Un nombre avec sa valeur de comparaison. `deltaPct` est `null` quand la période précédente vaut 0. */
export type Metric = {
  value: number;
  previous: number;
  deltaPct: number | null;
  trend: "up" | "down" | "flat" | "none";
};

/** Un taux (0 → 1) ; `null` quand le dénominateur est nul. `deltaPoints` est en points de pourcentage. */
export type RateMetric = {
  value: number | null;
  previous: number | null;
  deltaPoints: number | null;
  trend: "up" | "down" | "flat" | "none";
};

export type FunnelStats = {
  /** Conseils PharmaBoost proposés dans la période (hors ajouts manuels, hors ordonnances supprimées). */
  proposed: Metric;
  /** Proposés il y a moins de 24 h et pas encore tranchés : exclus du dénominateur du taux. */
  pending: number;
  /** Retenus par l'équipe : acceptés, modifiés, remplacés, présentés, achetés ou refusés par le patient ensuite. */
  accepted: Metric;
  /** Retenus puis refusés par le patient. */
  declinedByPatient: number;
  /** Retirés par l'équipe (non pertinents). */
  removedByTeam: number;
  /** Jamais tranchés (la vente s'est terminée, ou plus de 24 h). */
  unanswered: number;
  /** Conseils achetés : le conseil a donné lieu à une ligne de vente. */
  purchased: Metric;
  /** Acceptés mais sans vente confirmée (ni refus du patient) : ce n'est PAS du chiffre d'affaires. */
  acceptedNotConfirmed: number;
  /** accepté ÷ (proposé − en attente). */
  acceptanceRate: RateMetric;
  /** acheté ÷ accepté. */
  conversionRate: RateMetric;
};

export type RevenueStats = {
  /** CA TTC des ventes confirmées dont le prix est connu, daté par la vente. */
  confirmedTtcCents: Metric;
  /**
   * Nombre de ventes confirmées : des TICKETS (une vente enregistrée) contenant au
   * moins une ligne issue d'un conseil au prix connu. Un mot, une unité : « ventes
   * confirmées » ne compte jamais des conseils ni des lignes.
   */
  confirmedSales: Metric;
  /** Lignes de vente confirmées au prix connu / sans prix (exclues du CA). */
  pricedLines: number;
  unpricedLines: number;
  unitsSold: number;
  /** CA ÷ ventes confirmées (tickets) ; `null` sans vente. */
  averageBasketCents: number | null;
  previousAverageBasketCents: number | null;
};

export type SeriesBucket = {
  index: number;
  startsAt: Date;
  /** Libellé prêt à afficher (« 12 oct. », « 14 h », « sem. du 6 oct. »). */
  label: string;
  proposed: number;
  accepted: number;
  purchased: number;
  revenueTtcCents: number;
  /** Taux d'acceptation du créneau ; `null` sous 3 conseils tranchés (un taux sur 1 ou 2 conseils ne veut rien dire). */
  acceptanceRate: number | null;
};

export type ProductRow = {
  /** `p:<productId>` ou `m:<presentationId>` ; sert de clé stable. */
  key: string;
  label: string;
  category: string;
  proposed: number;
  accepted: number;
  purchased: number;
  /** Unités vendues sur des lignes confirmées (prix connu ou non). */
  unitsSold: number;
  revenueTtcCents: number;
  acceptanceRate: number | null;
};

export type UniverseRow = {
  category: string;
  label: string;
  proposed: number;
  accepted: number;
  purchased: number;
  revenueTtcCents: number;
  acceptanceRate: number | null;
};

export type RhythmCell = {
  /** 0 = lundi … 6 = dimanche. */
  weekday: number;
  hour: number;
  proposed: number;
  accepted: number;
  decided: number;
};

export type RhythmStats = {
  /** Fenêtre d'observation, en jours (toujours les 90 derniers jours, pas la période choisie). */
  windowDays: number;
  cells: RhythmCell[];
  /** Assez de conseils tranchés pour que le rythme dise quelque chose (≥ 30 sur la période). */
  enoughData: boolean;
  bestWeekday: { weekday: number; label: string; acceptanceRate: number; decided: number } | null;
  bestWindow: { fromHour: number; toHour: number; acceptanceRate: number; decided: number } | null;
};

export type DataQuality = {
  /** Produits ajoutés à la main par l'équipe : non comptés comme conseils PharmaBoost. */
  manualExcluded: number;
  /** Lignes de vente issues d'un conseil mais sans prix : jamais comptées dans le chiffre d'affaires, signalées à part. */
  unpricedConfirmedLines: number;
  /** Conseils d'ordonnances supprimées : ignorés. */
  deletedPrescriptionAdvice: number;
  /** Conseils en attente de décision (moins de 24 h). */
  pendingAdvice: number;
};

export type Insight = {
  kind: "revenue" | "adoption" | "acceptance" | "product" | "universe" | "weekday" | "window" | "data";
  tone: "positive" | "neutral" | "attention";
  text: string;
};

export type Narrative = {
  /** Une phrase, lisible en trois secondes. */
  headline: string;
  /** Une seconde phrase, sur les ventes confirmées. */
  revenueLine: string | null;
  insights: Insight[];
};

export type PerformanceReport = {
  period: PerformancePeriod;
  generatedAt: Date;
  /** Aucun conseil proposé ni vente confirmée sur la période courante. */
  empty: boolean;
  funnel: FunnelStats;
  revenue: RevenueStats;
  series: { current: SeriesBucket[]; previous: SeriesBucket[] };
  products: ProductRow[];
  universes: UniverseRow[];
  rhythm: RhythmStats;
  quality: DataQuality;
  narrative: Narrative;
};

// --- Retour sur abonnement ----------------------------------------------------

export type SubscriptionReturnHiddenReason =
  | "no_subscription"
  | "shared_subscription"
  | "no_price"
  | "not_enough_sales"
  | "prices_unreliable"
  | "no_data";

export type SubscriptionReturn =
  | { status: "hidden"; reason: SubscriptionReturnHiddenReason; detail: string }
  | {
      status: "shown";
      /** Le mois civil (fuseau de l'officine), « octobre 2026 ». */
      monthLabel: string;
      /** Prix mensuel HT figé au contrat. */
      monthlyPriceHtCents: number;
      trialing: boolean;
      confirmedTtcCents: number;
      /** Chaque ligne ramenée hors taxes avec SON taux de TVA enregistré à la vente. */
      confirmedHtCents: number;
      /** Lignes de vente confirmées AU PRIX CONNU : celles qui font le chiffre d'affaires ci-dessus. */
      confirmedLines: number;
      /** Part des lignes de vente confirmées du mois dont le prix est connu (0 → 1). */
      pricedShare: number;
      /** CA HT confirmé ÷ prix mensuel HT. */
      ratio: number;
      /** « 4,2 fois », prêt à afficher. */
      ratioLabel: string;
      sentence: string;
    };

export type SubscriptionInfo = {
  status: string;
  /** Tarif mensuel HT figé à la souscription ; `null` quand il n'est pas connu. */
  monthlyPriceHtCents: number | null;
  /**
   * L'abonnement appartient à une organisation qui compte PLUS D'UNE officine
   * active (hors démonstration) : son prix est celui du groupe, le chiffre
   * d'affaires d'une seule officine ne se compare pas à lui. Absent = non partagé.
   */
  shared?: boolean;
};

// --- Portefeuille (Super Admin) -----------------------------------------------

export type PortfolioHealth = "high_value" | "on_track" | "needs_support" | "getting_started" | "no_data";

export type PortfolioInput = {
  pharmacyId: string;
  name: string;
  city: string | null;
  createdAt: Date;
  subscription: SubscriptionInfo | null;
  /** Mois en cours + période de comparaison, calculés comme pour le titulaire. */
  proposed: number;
  accepted: number;
  decided: number;
  /** « Conseils achetés » : conseils DISTINCTS ayant donné lieu à une ligne de vente ce mois-ci (horloge de la vente). */
  purchased: number;
  confirmedTtcCents: number;
  previousConfirmedTtcCents: number;
  /** Lignes de vente confirmées sans prix ce mois-ci (des lignes, pas des conseils : ce n'est pas un sous-ensemble de `purchased`). */
  unpricedConfirmedLines: number;
  /** Analyses d'ordonnance faites sur les 30 derniers jours (le conseil est-il utilisé ?). */
  recentAnalyses: number;
  lastProposalAt: Date | null;
  lastSaleAt: Date | null;
  roi: SubscriptionReturn;
};

export type PortfolioRow = PortfolioInput & {
  acceptanceRate: number | null;
  deltaPct: number | null;
  health: PortfolioHealth;
  /** Les raisons de la classe, en phrases courtes, pour que l'équipe sache quoi dire au titulaire. */
  reasons: string[];
  /** Plus grand = à voir en premier (accompagnement) ; sert au tri. */
  priority: number;
};
