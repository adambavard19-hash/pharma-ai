/**
 * Les interactions médicamenteuses.
 *
 * Règle unique et non négociable : Pharma.ai ne produit aucune interaction.
 * Chaque couple vient d'un référentiel chargé par l'officine, avec son nom, sa
 * version et sa date. Ce qui n'est pas dans le fichier n'existe pas ici — rien
 * n'est déduit, complété, ni extrapolé.
 *
 * Le corollaire est aussi important : tant qu'aucun référentiel n'est chargé,
 * l'écran doit dire que les interactions ne sont PAS analysées. Un écran sans
 * alerte se lit « rien à signaler » ; le laisser croire serait le mensonge le
 * plus dangereux que ce produit puisse faire.
 */

export type InteractionSeverity =
  | "CONTRAINDICATION"
  | "NOT_RECOMMENDED"
  | "PRECAUTION"
  | "TO_CONSIDER";

export type InteractionSideKind = "SUBSTANCE" | "CLASS";

/** Les libellés officiels des quatre niveaux, dans les termes de la source. */
export const SEVERITY_LABELS: Record<InteractionSeverity, string> = {
  CONTRAINDICATION: "Contre-indication",
  NOT_RECOMMENDED: "Association déconseillée",
  PRECAUTION: "Précaution d'emploi",
  TO_CONSIDER: "À prendre en compte",
};

/**
 * Ordre de gravité décroissant. Sert à trier l'affichage : au comptoir, la
 * contre-indication se lit avant tout le reste.
 */
export const SEVERITY_ORDER: InteractionSeverity[] = [
  "CONTRAINDICATION",
  "NOT_RECOMMENDED",
  "PRECAUTION",
  "TO_CONSIDER",
];

/**
 * Traduction vers les niveaux du moteur de sécurité.
 *
 * Contre-indication et association déconseillée exigent un acquittement
 * explicite du pharmacien : elles ferment la zone des conseils tant qu'il n'a
 * pas dit qu'il les avait vues. Elles n'empêchent pas la délivrance — cette
 * décision reste professionnelle — mais elles ne peuvent pas être survolées.
 */
export const SEVERITY_TO_FINDING: Record<
  InteractionSeverity,
  "BLOCKING" | "WARNING" | "INFO"
> = {
  CONTRAINDICATION: "BLOCKING",
  NOT_RECOMMENDED: "BLOCKING",
  PRECAUTION: "WARNING",
  TO_CONSIDER: "INFO",
};

/** Une règle du référentiel, telle qu'elle a été chargée. */
export type InteractionRule = {
  leftLabel: string;
  rightLabel: string;
  leftKey: string;
  rightKey: string;
  leftKind: InteractionSideKind;
  rightKind: InteractionSideKind;
  severity: InteractionSeverity;
  /** Le risque, mot pour mot depuis la source. */
  risk: string;
  /** La conduite à tenir, mot pour mot. `null` si la source ne la donne pas. */
  guidance: string | null;
  sourceName: string;
  sourceVersion: string;
};

/**
 * L'appartenance d'une substance à une classe du référentiel — ou, quand
 * `isAlias` est vrai, une correspondance de vocabulaire entre le libellé du
 * catalogue national et celui du référentiel. Les deux se rapprochent de la
 * même façon ; seul l'affichage diffère, car un alias n'est pas un
 * raisonnement par classe.
 */
export type InteractionClassMember = {
  classKey: string;
  classLabel: string;
  substanceKey: string;
  isAlias?: boolean;
};

/**
 * Une ligne d'ordonnance vue par le moteur d'interactions.
 *
 * `substances` est vide quand la ligne n'a pas été rattachée au catalogue
 * national. C'est une information capitale : cette ligne n'a alors PAS pu être
 * analysée, et l'écran doit le dire plutôt que d'afficher un vert trompeur.
 */
export type InteractionLine = {
  id: string;
  label: string;
  /** Substances actives issues du catalogue national, normalisées. */
  substances: { key: string; label: string }[];
};

export type InteractionMatch = {
  severity: InteractionSeverity;
  /** Les deux lignes concernées de l'ordonnance. */
  lineIds: [string, string];
  /** Ce que le pharmacien lit : « X + Y ». */
  leftLabel: string;
  rightLabel: string;
  /** Vrai lorsque le rapprochement passe par une classe et non une substance. */
  viaClass: boolean;
  risk: string;
  guidance: string | null;
  sourceName: string;
  sourceVersion: string;
};

/**
 * Deux lignes qui apportent la même substance active.
 *
 * Ce n'est pas une interaction : c'est un fait de composition, tiré du
 * catalogue national. On le distingue soigneusement — il est détectable SANS
 * aucun référentiel d'interactions, et le confondre avec une interaction
 * laisserait croire à une couverture qu'on n'a pas.
 */
export type SubstanceOverlap = {
  substanceLabel: string;
  lineIds: [string, string];
  lineLabels: [string, string];
};

export type InteractionAnalysis = {
  matches: InteractionMatch[];
  overlaps: SubstanceOverlap[];
  /** Lignes effectivement analysables (rattachées au catalogue national). */
  analysedLineIds: string[];
  /** Lignes qu'on n'a pas pu analyser, faute de composition connue. */
  unanalysedLineIds: string[];
};
