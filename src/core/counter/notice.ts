/**
 * L'avis de comptoir : ce que le poste de caisse affiche en coin d'écran,
 * par-dessus le LGO, quand l'analyse d'une vente bipée est prête.
 *
 * Il tient en quelques lignes parce qu'il est lu en une seconde, pendant que
 * le client attend. Les alertes passent avant les conseils : on ne vend rien
 * par-dessus une alerte non lue. Le détail complet reste dans PharmaBoost,
 * un clic sur l'avis l'ouvre.
 */

export type NoticeAlert = { severity: string; subjectType: string; code: string; message: string; acknowledged: boolean };

/**
 * Les avertissements qui parlent de la couverture des données (référentiel
 * absent, classement par l'IA) : ils comptent sur l'écran complet, pas en coin
 * d'écran pendant que le client attend.
 */
const COVERAGE_CODES = new Set(["DRUG_NO_INTERACTION_DATA", "INTERACTION_NO_REFERENTIAL", "DEMO_REFERENTIAL", "DRUG_CLASSIFIED_BY_AI", "DRUG_NOT_IN_REFERENTIAL"]);

/**
 * Les « écarté » : un produit que le moteur n'a PAS proposé (déjà présent dans la vente, allergie, grossesse, ordonnance
 * obligatoire…). Ce sont des explications sur nos propres propositions, une par produit du catalogue qui a été écarté,
 * pas des alertes sur ce que le client emporte : elles ne disent rien au pharmacien qui a la boîte en main. Elles restent
 * lisibles sur l'écran complet de la vente ; elles n'ont rien à faire en coin d'écran.
 */
const DISCARDED_CANDIDATE_CODES = new Set([
  "SUBSTANCE_ALREADY_PRESCRIBED",
  "PRESCRIPTION_REQUIRED",
  "PATIENT_ALLERGY",
  "PRODUCT_CONTRAINDICATED_PREGNANCY",
  "PRODUCT_CONTRAINDICATED_BREASTFEEDING",
  "PRODUCT_CONTRAINDICATED_CHILD",
  "PRODUCT_CONTRAINDICATED_DECLARED",
  "VIGILANCE_PRODUCT_EXCLUDED",
]);
export type NoticeRecommendation = {
  name: string;
  priceCents: number | null;
  reason: string | null;
  status: string;
  /** La photo du produit, quand l'officine en a une. Jamais indispensable : la fenêtre s'en passe. */
  imageUrl?: string | null;
  /** Le stock de l'officine pour ce produit, quand il est connu. */
  quantity?: number | null;
  alertThreshold?: number | null;
};

/** Ce que le pharmacien lit sur la fenêtre : « En stock », « Stock faible », « Rupture », ou « Stock à vérifier ». */
export type NoticeAvailability = "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK" | "UNKNOWN";

/** Un conseil, prêt à s'afficher sur le poste de caisse. */
export type NoticeItem = {
  name: string;
  /** Le prix de vente, seulement quand le prix ET le stock sont fiables. */
  priceCents: number | null;
  reason: string | null;
  availability: NoticeAvailability;
  quantity: number | null;
  imageUrl: string | null;
};

export type CounterNoticeInput = {
  reference: string;
  prescriptionStatus: string;
  lineNames: string[];
  alerts: NoticeAlert[];
  recommendations: NoticeRecommendation[];
  outcome: string | null;
  /**
   * Le stock a-t-il été mis à jour récemment ? Faux : on n'affiche ni prix ni « En stock » — un chiffre ancien
   * donnerait au pharmacien une certitude qu'on n'a pas. Absent : fiable (comportement historique).
   */
  stockReliable?: boolean;
  /** Ce que chaque ligne bipée est : un médicament du catalogue national, ou un produit de l'officine. */
  lineKinds?: ("DRUG" | "PRODUCT")[];
};

export type CounterNotice = {
  /** PENDING : l'analyse n'est pas finie. READY : à afficher. CLOSED : plus rien à dire. */
  state: "PENDING" | "READY" | "CLOSED";
  title: string;
  /** Ce qui a été bipé, en une ligne. */
  subject: string;
  alerts: string[];
  /** Jusqu'à trois conseils : « Produit · 8,90 € · pourquoi ». */
  advice: string[];
  /** Les mêmes conseils, structurés (photo, disponibilité, prix) : c'est ce que la fenêtre du poste dessine. */
  items: NoticeItem[];
  /** Les médicaments ou produits bipés, un par élément, sans la forme galénique. */
  drugs: string[];
  /** « Médicament détecté », « Produit détecté » ou « Détecté » : le titre au-dessus de ce qui a été bipé. */
  detectedLabel: string;
  /** Une empreinte : si elle ne change pas, on ne réaffiche pas. */
  signature: string;
};

const MAX_ALERTS = 2;
const MAX_ADVICE = 3;
const RANK: Record<string, number> = { BLOCKING: 0, WARNING: 1, CAUTION: 2, INFO: 3 };
const SHOWN_STATUSES = new Set(["PROPOSED", "ACCEPTED", "MODIFIED"]);

function euros(cents: number | null): string | null {
  if (cents === null || cents <= 0) return null;
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`;
}

function shortName(name: string): string {
  // « DOLIPRANE 1000 mg, comprimé » → « DOLIPRANE 1000 mg » : la forme n'aide pas en coin d'écran.
  return name.replace(/,.*$/, "").trim();
}

/** La disponibilité d'un produit, dite honnêtement : sans stock fiable, « à vérifier » plutôt qu'un chiffre périmé. */
export function availabilityOf(quantity: number | null | undefined, alertThreshold: number | null | undefined, reliable: boolean): NoticeAvailability {
  if (!reliable || quantity === null || quantity === undefined) return "UNKNOWN";
  if (quantity <= 0) return "OUT_OF_STOCK";
  return quantity <= (alertThreshold ?? 0) ? "LOW_STOCK" : "IN_STOCK";
}

/** Le titre de ce qui a été bipé : exact quand on sait ce que c'est, neutre sinon (jamais « médicament » pour un produit). */
export function detectedLabelOf(kinds: ("DRUG" | "PRODUCT")[] | undefined): string {
  if (!kinds || kinds.length === 0) return "Détecté";
  if (kinds.every((kind) => kind === "DRUG")) return "Médicament détecté";
  if (kinds.every((kind) => kind === "PRODUCT")) return "Produit détecté";
  return "Détecté";
}

export function buildCounterNotice(input: CounterNoticeInput): CounterNotice {
  const drugs = input.lineNames.map(shortName).filter(Boolean);
  const subject = drugs.join(" · ");
  const base = { title: `PharmaBoost · ${input.reference}`, subject, drugs, detectedLabel: detectedLabelOf(input.lineKinds) };
  const reliable = input.stockReliable !== false;
  if (["CANCELLED", "DELIVERED", "FAILED"].includes(input.prescriptionStatus)) {
    return { ...base, state: "CLOSED", alerts: [], advice: [], items: [], signature: `closed:${input.reference}` };
  }
  if (!["ANALYZED", "VALIDATED"].includes(input.prescriptionStatus)) {
    return { ...base, state: "PENDING", alerts: [], advice: [], items: [], signature: `pending:${input.reference}:${input.lineNames.length}` };
  }
  const alerts = [...input.alerts]
    .filter((alert) => !alert.acknowledged && !COVERAGE_CODES.has(alert.code) && !DISCARDED_CANDIDATE_CODES.has(alert.code) && (alert.severity === "BLOCKING" || alert.severity === "WARNING"))
    .sort((a, b) => (RANK[a.severity] ?? 9) - (RANK[b.severity] ?? 9))
    .slice(0, MAX_ALERTS)
    .map((alert) => alert.message);
  const shown = input.recommendations.filter((rec) => SHOWN_STATUSES.has(rec.status)).slice(0, MAX_ADVICE);
  // Le prix ne s'affiche que si le stock est fiable : les deux viennent du même export du logiciel de gestion.
  const items: NoticeItem[] = shown.map((rec) => ({
    name: shortName(rec.name),
    priceCents: reliable && rec.priceCents !== null && rec.priceCents > 0 ? rec.priceCents : null,
    reason: rec.reason,
    availability: availabilityOf(rec.quantity, rec.alertThreshold, reliable),
    quantity: reliable ? (rec.quantity ?? null) : null,
    imageUrl: rec.imageUrl ?? null,
  }));
  const advice = items.map((item) => [item.name, euros(item.priceCents), item.reason].filter(Boolean).join(" · "));
  if (advice.length === 0 && alerts.length === 0) {
    const why =
      input.outcome === "OUT_OF_STOCK" ? "Conseil possible mais produit absent du stock."
      : input.outcome === "SAFETY_FILTERED" ? "Conseils écartés par la sécurité."
      : "Rien à ajouter pour cette délivrance.";
    return { ...base, state: "READY", alerts: [], advice: [why], items: [], signature: `ready:${input.reference}:${input.lineNames.length}:none` };
  }
  return { ...base, state: "READY", alerts, advice, items, signature: `ready:${input.reference}:${input.lineNames.length}:${alerts.length}:${advice.join("|")}` };
}
