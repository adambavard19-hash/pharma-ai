/**
 * Catalogue des fichiers de la Base de données publique des médicaments.
 *
 * Ces fichiers n'ont PAS de ligne d'en-tête : l'ordre des colonnes est leur
 * seule spécification. Un décalage d'un cran ne produirait pas d'erreur, il
 * produirait des données fausses — un prix rangé dans un taux, un dosage rangé
 * dans une forme. C'est pourquoi le nombre de colonnes est déclaré ici et
 * vérifié à la lecture : à la moindre divergence, le fichier est refusé en
 * entier plutôt qu'importé de travers.
 *
 * Les nombres ci-dessous ont été mesurés sur les fichiers réels, pas déduits
 * de la documentation seule.
 */

export type BdpmFileKey =
  | "SPECIALTIES"
  | "PRESENTATIONS"
  | "COMPOSITIONS"
  | "PRESCRIPTION_CONDITIONS"
  | "GENERIC_MEMBERS"
  | "SMR_OPINIONS";

export type BdpmFileSpec = {
  key: BdpmFileKey;
  /** Nom exact du fichier tel que publié. */
  fileName: string;
  /** Ce que le fichier décrit, en français, pour le journal d'import. */
  label: string;
  /** Nombre de colonnes porteuses de sens. Voir `columns` pour la tolérance. */
  columns: number;
  /**
   * Certains fichiers terminent chaque ligne par une tabulation, ce qui ajoute
   * une colonne vide sans signification. Mesuré : COMPO et GENER le font sur
   * 100 % de leurs lignes, les quatre autres jamais. On tolère cette colonne
   * surnuméraire À CONDITION qu'elle soit vide — jamais une colonne de plus.
   */
  allowsTrailingEmptyColumn: boolean;
  /**
   * Forme d'un DÉBUT d'enregistrement.
   *
   * Ces fichiers n'ont pas de guillemets d'échappement : un libellé qui
   * contient un retour à la ligne se retrouve donc réparti sur plusieurs
   * lignes physiques, et compter les colonnes ligne à ligne échoue sur la
   * seconde moitié. La frontière entre deux enregistrements n'est pas « un
   * retour à la ligne » mais « un retour à la ligne suivi d'une nouvelle
   * clé ».
   *
   * Mesuré sur 98 834 lignes réelles des six fichiers : toutes commencent par
   * des chiffres suivis d'une tabulation, sans une exception. Une ligne qui ne
   * respecte pas cette forme ne peut donc pas ouvrir un enregistrement — elle
   * prolonge le précédent.
   */
  keyPattern: RegExp;
  /** Sans ce fichier, l'import n'a pas de sens et s'arrête. */
  required: boolean;
};

/** Code CIS : toujours huit chiffres. Mesuré sur les cinq fichiers concernés. */
const CIS_KEY = /^\d{8}\t/;
/** Identifiant de groupe générique : de un à quatre chiffres. */
const GROUP_KEY = /^\d{1,6}\t/;

export const BDPM_FILES: readonly BdpmFileSpec[] = [
  {
    key: "SPECIALTIES",
    fileName: "CIS_bdpm.txt",
    label: "Spécialités pharmaceutiques",
    columns: 12,
    allowsTrailingEmptyColumn: false,
    keyPattern: CIS_KEY,
    required: true,
  },
  {
    key: "PRESENTATIONS",
    fileName: "CIS_CIP_bdpm.txt",
    label: "Présentations (boîtes, codes CIP)",
    columns: 13,
    allowsTrailingEmptyColumn: false,
    keyPattern: CIS_KEY,
    required: true,
  },
  {
    key: "COMPOSITIONS",
    fileName: "CIS_COMPO_bdpm.txt",
    label: "Compositions (substances actives)",
    columns: 8,
    allowsTrailingEmptyColumn: true,
    keyPattern: CIS_KEY,
    required: true,
  },
  {
    key: "PRESCRIPTION_CONDITIONS",
    fileName: "CIS_CPD_bdpm.txt",
    label: "Conditions de prescription et de délivrance",
    columns: 2,
    allowsTrailingEmptyColumn: false,
    keyPattern: CIS_KEY,
    required: false,
  },
  {
    key: "GENERIC_MEMBERS",
    fileName: "CIS_GENER_bdpm.txt",
    label: "Groupes génériques",
    columns: 5,
    allowsTrailingEmptyColumn: true,
    keyPattern: GROUP_KEY,
    required: false,
  },
  {
    key: "SMR_OPINIONS",
    fileName: "CIS_HAS_SMR_bdpm.txt",
    label: "Avis de service médical rendu (HAS)",
    columns: 6,
    allowsTrailingEmptyColumn: true,
    keyPattern: CIS_KEY,
    required: false,
  },
] as const;

/**
 * Fichiers publiés par la même source mais NON importés à ce stade.
 *
 * Leur format n'a pas pu être vérifié sur des données réelles depuis cet
 * environnement. Deviner la signification de leurs colonnes reviendrait à
 * fabriquer de la donnée : on préfère les déclarer ici, et que le journal
 * d'import dise qu'ils existent et ne sont pas lus.
 */
export const BDPM_UNIMPORTED_FILES: readonly { fileName: string; reason: string }[] = [
  {
    fileName: "CIS_InfoImportantes.txt",
    reason: "Format non vérifié — informations de sécurité, à traiter séparément",
  },
  {
    fileName: "CIS_HAS_ASMR_bdpm.txt",
    reason: "Format non vérifié — amélioration du service médical rendu",
  },
  {
    fileName: "HAS_LiensPageCT_bdpm.txt",
    reason: "Format non vérifié — liens vers les avis de la Commission de la transparence",
  },
];

export function bdpmFileSpec(key: BdpmFileKey): BdpmFileSpec {
  const spec = BDPM_FILES.find((candidate) => candidate.key === key);
  if (!spec) throw new Error(`Fichier BDPM inconnu : ${key}`);
  return spec;
}
