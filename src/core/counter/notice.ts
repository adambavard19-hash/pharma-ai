/**
 * L'avis de comptoir : ce que le poste de caisse affiche en coin d'écran,
 * par-dessus le LGO, quand l'analyse d'une vente bipée est prête.
 *
 * Il tient en quelques lignes parce qu'il est lu en une seconde, pendant que
 * le client attend. Les alertes passent avant les conseils : on ne vend rien
 * par-dessus une alerte non lue. Le détail complet reste dans PharmaBoost,
 * un clic sur l'avis l'ouvre.
 */

import type { ViewQuestion } from "./question-tree";
import type { CounterSheet } from "../../../agent/src/counter-sheet";
import { saleTitle } from "./sale-title";

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
/** Une mise en garde qui mérite la bannière du comptoir (et l'île) : ni une note de couverture des données, ni un produit écarté. */
export function isCounterAlert(alert: Pick<NoticeAlert, "acknowledged" | "code" | "severity">): boolean {
  return !alert.acknowledged && !COVERAGE_CODES.has(alert.code) && !DISCARDED_CANDIDATE_CODES.has(alert.code) && (alert.severity === "BLOCKING" || alert.severity === "WARNING");
}

export type NoticeRecommendation = {
  /** L'identifiant du conseil : les boutons « Vendu » / « Non vendu » de la fenêtre le désignent. */
  id?: string;
  name: string;
  /** Le médicament (ou produit) de la vente qui a déclenché ce conseil, tel que le pharmacien le lit sur son écran. */
  forDrug?: string | null;
  /** Le challenge actif auquel ce produit participe, s'il y en a un : son titre. Jamais inventé. */
  challengeTitle?: string | null;
  /** La date de péremption (AAAA-MM-JJ) du lot le plus proche, quand elle est courte. Jamais inventée. */
  shortDateOn?: string | null;
  priceCents: number | null;
  /** La marge HT par unité, quand les deux prix sont connus. Jamais montrée au patient. */
  marginCents?: number | null;
  reason: string | null;
  status: string;
  /** La photo du produit, quand l'officine en a une. Jamais indispensable : la fenêtre s'en passe. */
  imageUrl?: string | null;
  /** Le stock de l'officine pour ce produit, quand il est connu. */
  quantity?: number | null;
  alertThreshold?: number | null;
  /**
   * Ce conseil peut-il parler dans la fenêtre du poste ? Faux pour une règle du moteur que l'équipe PharmaBoost a supprimée
   * depuis (console, « Conseils »), ou qui n'existe plus : un conseil resté dans une analyse ancienne ne s'affiche pas.
   * Absent : oui (comportement historique).
   */
  trusted?: boolean;
  /**
   * Une association écrite par le pharmacien (ou commune à toutes les officines), et non un conseil du moteur : elle a ses
   * propres places dans la fenêtre, en plus des conseils du moteur — un conseil du moteur ne l'en chasse jamais.
   */
  association?: boolean;
  /**
   * Ce que la carte montre une fois DÉPLOYÉE (nom complet, raison complète, phrase du comptoir, contre-indications,
   * conseils d'utilisation) : la fiche complète de la page de vente, bornée (core/counter/advice-sheet.ts, `counterSheetOf`).
   */
  sheet?: CounterSheet | null;
};

/** Ce que le pharmacien lit sur la fenêtre : « En stock », « Stock faible », « Rupture », ou « Stock à vérifier ». */
export type NoticeAvailability = "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK" | "UNKNOWN";

/** Où en est un conseil : pas encore de réponse, « Vendu » ou « Non vendu ». */
export type NoticeOutcome = "NONE" | "SOLD" | "NOT_SOLD";

export function outcomeOf(status: string): NoticeOutcome {
  return status === "PURCHASED" ? "SOLD" : status === "DECLINED" ? "NOT_SOLD" : "NONE";
}

/** Un conseil, prêt à s'afficher sur le poste de caisse. */
export type NoticeItem = {
  id: string | null;
  /** Le médicament de la vente concerné par ce conseil. */
  drug: string | null;
  /** Le titre du challenge actif, ou `null`. */
  challenge: string | null;
  /** La date de péremption du lot à écouler (AAAA-MM-JJ), ou `null`. */
  shortDateOn: string | null;
  outcome: NoticeOutcome;
  name: string;
  /** Le prix de vente, seulement quand le prix ET le stock sont fiables. */
  priceCents: number | null;
  /** La marge HT par unité (prix connus et cohérents), sinon `null`. */
  marginCents?: number | null;
  reason: string | null;
  availability: NoticeAvailability;
  quantity: number | null;
  imageUrl: string | null;
  /** La carte déployée : la fiche complète du conseil, bornée. Null : rien à déployer au-delà du nom et de la raison. */
  sheet: CounterSheet | null;
};

export type CounterNoticeInput = {
  reference: string;
  prescriptionStatus: string;
  lineNames: string[];
  alerts: NoticeAlert[];
  /** Envoyer les mises en garde à la bannière. Absent : `SHOW_ALERTS_ON_BANNER` (coupé pour l'instant). */
  showAlerts?: boolean;
  recommendations: NoticeRecommendation[];
  outcome: string | null;
  /**
   * Le stock a-t-il été mis à jour récemment ? Faux : on n'affiche ni prix ni « En stock » — un chiffre ancien
   * donnerait au pharmacien une certitude qu'on n'a pas. Absent : fiable (comportement historique).
   */
  stockReliable?: boolean;
  /** Ce que chaque ligne bipée est : un médicament du catalogue national, ou un produit de l'officine. */
  lineKinds?: ("DRUG" | "PRODUCT")[];
  /** Les boîtes bipées, avec leur identifiant : la bannière du poste peut en retirer une. Absent (appel ancien) : aucune. */
  lines?: { id: string; name: string }[];
  /**
   * Les questions ouvertes de l'arbre du comptoir (« pourquoi le patient prend-il son paracétamol ? », « où a-t-il mal ? »)
   * et les phrases d'orientation des réponses cochées. Les conseils qu'elles débloquent arrivent dans `recommendations` ;
   * ceux qui attendent une réponse n'y sont pas.
   */
  questions?: ViewQuestion[];
  guidance?: string[];
};

export type CounterNotice = {
  /** PENDING : l'analyse n'est pas finie. READY : à afficher. CLOSED : plus rien à dire. */
  state: "PENDING" | "READY" | "CLOSED";
  title: string;
  /** Ce qui a été bipé, en une ligne. */
  subject: string;
  alerts: string[];
  /** Jusqu'à trois conseils du moteur, puis jusqu'à six associations du pharmacien (deux par boîte scannée) : « Produit · 8,90 € · pourquoi ». */
  advice: string[];
  /** Les mêmes conseils, structurés (photo, disponibilité, prix) : c'est ce que la fenêtre du poste dessine. */
  items: NoticeItem[];
  /** Les questions ouvertes de l'arbre du comptoir, avec le choix coché. Vide : rien à demander. */
  questions: ViewQuestion[];
  /** Les phrases d'orientation des réponses cochées (« fièvre depuis 3 jours : voir le médecin »). */
  guidance: string[];
  /** Les médicaments ou produits bipés, un par élément, sans la forme galénique. */
  drugs: string[];
  /** Les mêmes boîtes, avec leur identifiant (pour « Retirer » sur la bannière du poste). */
  boxes: { id: string; name: string }[];
  /** « Médicament détecté », « Produit détecté » ou « Détecté » : le titre au-dessus de ce qui a été bipé. */
  detectedLabel: string;
  /** Une empreinte : si elle ne change pas, on ne réaffiche pas. */
  signature: string;
};

const MAX_ALERTS = 2;
const RANK: Record<string, number> = { BLOCKING: 0, WARNING: 1, CAUTION: 2, INFO: 3 };
/** Trois conseils du moteur au plus à l'écran du comptoir : on en propose en moyenne trois, un seul quand il n'y en a qu'un de pertinent. */
const MAX_ADVICE = 3;
/**
 * Et, EN PLUS, jusqu'à six associations du pharmacien (deux par boîte scannée) — la limite du moteur d'associations (`MAX_ASSOCIATION_ADVICE`,
 * core/ai/engines/associations.ts ; un test vérifie qu'elles restent égales, ce module ne dépendant de rien pour que la
 * fenêtre du poste et le site l'embarquent seul) : ce sont ses choix, ils ne se disputent pas la place avec les conseils
 * du moteur. Neuf cartes au plus, que l'île fait défiler, rangées par boîte scannée.
 */
const MAX_ASSOCIATION_CARDS = 6;
export const MAX_COUNTER_CARDS = MAX_ADVICE + MAX_ASSOCIATION_CARDS;
/** Un conseil reste sous les yeux du pharmacien après sa réponse : « Vendu » et « Non vendu » le marquent, ils ne le font pas disparaître. */
const SHOWN_STATUSES = new Set(["PROPOSED", "ACCEPTED", "MODIFIED", "PURCHASED", "DECLINED"]);

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

/** Les mises en garde sur la bannière du poste : coupées pour l'instant (voir `buildCounterNotice`). */
export const SHOW_ALERTS_ON_BANNER = false;

export function buildCounterNotice(input: CounterNoticeInput): CounterNotice {
  const drugs = input.lineNames.map(shortName).filter(Boolean);
  const subject = drugs.join(" · ");
  const questions = input.questions ?? [];
  const guidance = input.guidance ?? [];
  const boxes = (input.lines ?? []).map((line) => ({ id: line.id, name: shortName(line.name) })).filter((box) => box.name);
  const base = { title: `PharmaBoost · ${saleTitle(input.reference)}`, subject, drugs, boxes, detectedLabel: detectedLabelOf(input.lineKinds), questions: [] as ViewQuestion[], guidance: [] as string[] };
  const reliable = input.stockReliable !== false;
  if (["CANCELLED", "DELIVERED", "FAILED"].includes(input.prescriptionStatus)) {
    return { ...base, state: "CLOSED", alerts: [], advice: [], items: [], signature: `closed:${input.reference}` };
  }
  if (!["ANALYZED", "VALIDATED"].includes(input.prescriptionStatus)) {
    return { ...base, state: "PENDING", alerts: [], advice: [], items: [], signature: `pending:${input.reference}:${boxes.map((box) => box.id).join(",") || input.lineNames.length}` };
  }
  // Pour l'instant, la bannière ne pousse QUE des produits conseils (fondateur, 13 oct. 2026 : « personne ne lit les
  // contre-indications, trop de mots ») : aucune mise en garde n'y est envoyée. La sécurité, elle, tourne toujours — un
  // produit dangereux reste écarté des conseils — et les mises en garde restent sur la page de la vente.
  const alerts = ((input.showAlerts ?? SHOW_ALERTS_ON_BANNER) ? [...input.alerts] : [])
    .filter(isCounterAlert)
    .sort((a, b) => (RANK[a.severity] ?? 9) - (RANK[b.severity] ?? 9))
    .slice(0, MAX_ALERTS)
    .map((alert) => alert.message);
  // Un produit n'est conseillé qu'une fois : le mieux classé reste, les doublons (même produit pour deux médicaments) s'effacent.
  const seenProducts = new Set<string>();
  const shownable = input.recommendations
    .filter((rec) => SHOWN_STATUSES.has(rec.status) && rec.trusted !== false)
    .filter((rec) => {
      const key = shortName(rec.name).toLowerCase();
      if (seenProducts.has(key)) return false;
      seenProducts.add(key);
      return true;
    });
  // Deux files, deux plafonds : les conseils du moteur d'abord (la priorité clinique), puis les associations du pharmacien.
  const shown = [
    ...shownable.filter((rec) => !rec.association).slice(0, MAX_ADVICE),
    ...shownable.filter((rec) => rec.association).slice(0, MAX_ASSOCIATION_CARDS),
  ];
  // Le prix ne s'affiche que si le stock est fiable : les deux viennent du même export du logiciel de gestion.
  const items: NoticeItem[] = shown.map((rec) => ({
    id: rec.id ?? null,
    drug: rec.forDrug ? shortName(rec.forDrug) : null,
    challenge: rec.challengeTitle ?? null,
    shortDateOn: rec.shortDateOn ?? null,
    outcome: outcomeOf(rec.status),
    name: shortName(rec.name),
    priceCents: reliable && rec.priceCents !== null && rec.priceCents > 0 ? rec.priceCents : null,
    // Une marge négative ou nulle trahit un prix mal lu : on ne l'affiche pas plutôt que d'afficher un chiffre faux.
    ...(rec.marginCents != null && rec.marginCents > 0 ? { marginCents: rec.marginCents } : {}),
    reason: rec.reason,
    availability: availabilityOf(rec.quantity, rec.alertThreshold, reliable),
    quantity: reliable ? (rec.quantity ?? null) : null,
    imageUrl: rec.imageUrl ?? null,
    sheet: rec.sheet ?? null,
  }));
  const advice = items.map((item) => [item.name, euros(item.priceCents), item.reason].filter(Boolean).join(" · "));
  // Ce qui a été répondu fait partie de l'état : sans lui dans l'empreinte, la fenêtre ne se redessinerait pas après un choix.
  const answered = questions.map((question) => `${question.node}=${question.choices.filter((choice) => choice.selected).map((choice) => choice.key).join("+")}`).join(",");
  if (advice.length === 0 && alerts.length === 0 && questions.length === 0) {
    const why =
      input.outcome === "OUT_OF_STOCK" ? "Conseil possible mais produit absent du stock."
      : input.outcome === "SAFETY_FILTERED" ? "Conseils écartés par la sécurité."
      : "Rien à ajouter pour cette délivrance.";
    return { ...base, state: "READY", alerts: [], advice: [why], items: [], signature: `ready:${input.reference}:${boxes.map((box) => box.id).join(",") || input.lineNames.length}:none` };
  }
  const marks = items.map((item) => `${item.outcome[0]}${item.challenge ? "c" : ""}${item.shortDateOn ? "d" : ""}`).join("");
  return { ...base, questions, guidance, state: "READY", alerts, advice, items, signature: `ready:${input.reference}:${boxes.map((box) => box.id).join(",") || input.lineNames.length}:${alerts.length}:${advice.join("|")}:${marks}:${answered}` };
}
