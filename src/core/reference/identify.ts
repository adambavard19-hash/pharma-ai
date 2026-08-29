/**
 * Rattachement d'une ligne d'ordonnance au catalogue national.
 *
 * Une ordonnance écrit « DOLIPRANE 1000 mg ». Le catalogue connaît
 * « DOLIPRANE 1000 mg, comprimé », « DOLIPRANE 1000 mg, gélule », et une
 * cinquantaine d'autres formes. Rattacher la ligne à la bonne spécialité, c'est
 * ce qui permet ensuite d'afficher la vraie composition, la vraie forme et les
 * vraies conditions de délivrance — au lieu du texte brut de l'ordonnance.
 *
 * Deux dangers, traités séparément :
 *
 *   • se tromper de médicament. Le score ne suffit pas à s'en prémunir : on
 *     exige en plus qu'aucun autre candidat proche ne porte une AUTRE substance.
 *   • se tromper de dosage. Même substance, même nom, un zéro de différence :
 *     on exige donc aussi que les candidats proches partagent le même dosage.
 *
 * Quand l'une des deux conditions n'est pas remplie, rien n'est rattaché
 * automatiquement — les candidats sont proposés au pharmacien, qui tranche.
 * C'est la traduction de « ne fabrique aucune donnée manquante » : un
 * rattachement incertain est une donnée fabriquée.
 */

import { normalizeSearchText } from "./search";

export type SpecialtyCandidate = {
  id: string;
  cisCode: string;
  /** Nom officiel, tel que publié. */
  name: string;
  pharmaceuticalForm: string | null;
  /** Substances actives, telles que publiées. */
  substances: string[];
  /** Encore commercialisé selon la source. */
  marketed: boolean;
};

export type IdentificationQuery = {
  /** Ce qui est écrit sur l'ordonnance, tel que lu. */
  drugName: string;
  dosage?: string | null;
  form?: string | null;
};

export type IdentificationMatch = {
  candidate: SpecialtyCandidate;
  /** De 0 à 1 : tête du libellé, dosage et reste, pondérés. */
  score: number;
  /**
   * Sur quoi la tête du libellé a été retrouvée.
   *
   * `NAME` : l'ordonnance nomme la spécialité (« DOLIPRANE »).
   * `SUBSTANCE` : elle nomme la molécule (« Paracétamol »), ce qui ne désigne
   * aucune spécialité en particulier — des dizaines la contiennent.
   */
  matchedOn: "NAME" | "SUBSTANCE";
  /** Ce qui a joué, pour que la décision reste explicable. */
  reasons: string[];
};

/** En dessous, aucun candidat n'est même proposé : le bruit dessert. */
export const IDENTIFICATION_MIN_SCORE = 0.75;

/** Au-dessus, ET sans ambiguïté de substance ni de dosage, on rattache seul. */
export const IDENTIFICATION_AUTO_SCORE = 0.95;

/** Écart en deçà duquel deux candidats sont considérés à égalité. */
const AMBIGUITY_MARGIN = 0.05;

/**
 * Découpe un texte en termes comparables.
 *
 * Les unités collées au nombre sont séparées (« 1000mg » → « 1000 », « MG »)
 * parce que l'ordonnance et le catalogue ne les écrivent pas pareil.
 */
export function tokenize(text: string): string[] {
  return normalizeSearchText(text)
    .replace(/(\d)([A-Z])/g, "$1 $2")
    .replace(/([A-Z])(\d)/g, "$1 $2")
    .split(/[^A-Z0-9]+/)
    .filter((token) => token.length > 0);
}

/** Termes sans pouvoir discriminant : ils ne comptent ni pour ni contre. */
const STOP_TOKENS = new Set(["DE", "DU", "LA", "LE", "ET", "A", "EN", "POUR", "PAR", "MG", "G", "ML"]);

function meaningful(tokens: string[]): string[] {
  return tokens.filter((token) => !STOP_TOKENS.has(token));
}

/** Les termes qui portent un dosage : un nombre, ou un nombre et son unité. */
function dosageSignature(tokens: string[]): string {
  const numbers = tokens.filter((token) => /^\d+$/.test(token));
  return [...new Set(numbers)].sort().join(" ");
}

function substanceSignature(candidate: SpecialtyCandidate): string {
  return [...new Set(candidate.substances.map(normalizeSearchText))].sort().join(" | ");
}

/**
 * Poids des trois composantes du score.
 *
 * Ils traduisent ce qui discrimine vraiment un médicament d'un autre. La tête
 * du libellé (la marque, ou la DCI quand le prescripteur l'emploie) et le
 * dosage font l'essentiel ; le reste — forme galénique, mentions de
 * conditionnement — départage sans jamais décider seul.
 *
 * Une simple couverture des termes ne conviendrait pas : une ordonnance écrit
 * souvent PLUS que le catalogue (« comprimé pelliculé sécable » là où la
 * spécialité s'appelle « …, comprimé »), et chaque mot en trop ferait chuter un
 * rapprochement pourtant juste.
 */
const HEAD_WEIGHT = 0.5;
const DOSAGE_WEIGHT = 0.35;
const REST_WEIGHT = 0.15;

/**
 * Classe les candidats selon ce qu'ils expliquent de l'ordonnance.
 */
export function identifyDrug(
  query: IdentificationQuery,
  candidates: SpecialtyCandidate[],
): IdentificationMatch[] {
  const nameTokens = meaningful(tokenize(query.drugName));
  const head = nameTokens[0];
  if (!head) return [];

  const wanted = [
    ...new Set([...nameTokens, ...tokenize(query.dosage ?? ""), ...tokenize(query.form ?? "")]),
  ].filter((token) => !STOP_TOKENS.has(token));

  const numbers = wanted.filter((token) => /^\d+$/.test(token));
  const rest = wanted.filter((token) => token !== head && !/^\d+$/.test(token));

  const matches: IdentificationMatch[] = [];

  for (const candidate of candidates) {
    const nameTokensOf = new Set(tokenize(candidate.name));
    const candidateTokens = new Set([
      ...nameTokensOf,
      ...tokenize(candidate.pharmaceuticalForm ?? ""),
      ...candidate.substances.flatMap(tokenize),
    ]);

    const headFound = candidateTokens.has(head);
    const matchedOn = nameTokensOf.has(head) ? ("NAME" as const) : ("SUBSTANCE" as const);
    // Un dosage écrit sur l'ordonnance et absent de la spécialité est une
    // divergence, pas un détail : c'est le cas du 500 pris pour du 1000.
    const dosageFound = numbers.filter((token) => candidateTokens.has(token));
    const restFound = rest.filter((token) => candidateTokens.has(token));

    const dosageRatio = numbers.length === 0 ? 1 : dosageFound.length / numbers.length;
    const restRatio = rest.length === 0 ? 1 : restFound.length / rest.length;
    const score =
      (headFound ? HEAD_WEIGHT : 0) + DOSAGE_WEIGHT * dosageRatio + REST_WEIGHT * restRatio;

    if (score < IDENTIFICATION_MIN_SCORE) continue;

    const reasons: string[] = [];
    if (headFound) reasons.push(`« ${head} » retrouvé`);
    if (numbers.length > 0) reasons.push(`dosage ${dosageFound.length}/${numbers.length}`);
    const bySubstance = candidate.substances.filter((substance) =>
      tokenize(substance).some((token) => wanted.includes(token)),
    );
    if (bySubstance.length > 0) reasons.push(`substance ${bySubstance.join(", ")}`);
    if (headFound && matchedOn === "SUBSTANCE") {
      reasons.push("désigné par sa substance, pas par son nom de spécialité");
    }
    if (!candidate.marketed) reasons.push("commercialisation arrêtée");

    matches.push({ candidate, score, matchedOn, reasons });
  }

  // À score égal, ce qui est encore commercialisé passe devant : c'est ce que
  // le patient a le plus de chances d'avoir dans les mains.
  return matches.sort(
    (a, b) =>
      b.score - a.score ||
      Number(b.candidate.marketed) - Number(a.candidate.marketed) ||
      a.candidate.name.localeCompare(b.candidate.name, "fr"),
  );
}

export type AutoAcceptRefusal =
  | "NO_MATCH"
  | "SCORE_TOO_LOW"
  | "AMBIGUOUS_SUBSTANCE"
  | "AMBIGUOUS_DOSAGE"
  | "SUBSTANCE_ONLY";

export type AutoAcceptDecision =
  | { accepted: true; match: IdentificationMatch }
  | { accepted: false; reason: AutoAcceptRefusal; candidates: IdentificationMatch[] };

export const AUTO_ACCEPT_REFUSAL_MESSAGES: Record<AutoAcceptRefusal, string> = {
  NO_MATCH: "Aucune spécialité du catalogue national ne correspond à ce libellé.",
  SCORE_TOO_LOW: "Le libellé de l'ordonnance ne correspond pas assez précisément à une spécialité.",
  AMBIGUOUS_SUBSTANCE:
    "Plusieurs spécialités correspondent, avec des substances actives différentes. Le choix revient au pharmacien.",
  AMBIGUOUS_DOSAGE:
    "Plusieurs dosages correspondent également bien. Le choix revient au pharmacien.",
  SUBSTANCE_ONLY:
    "L'ordonnance désigne une substance, pas une spécialité précise : plusieurs correspondent. Scannez la boîte délivrée, ou choisissez-la.",
};

/**
 * Décide si le rattachement peut se faire sans le pharmacien.
 *
 * Un bon score ne suffit jamais : deux spécialités homonymes de substances
 * différentes obtiennent le même score, et en choisir une au hasard produirait
 * une analyse de sécurité portant sur le mauvais médicament.
 */
export function decideAutoAccept(matches: IdentificationMatch[]): AutoAcceptDecision {
  if (matches.length === 0) return { accepted: false, reason: "NO_MATCH", candidates: [] };

  const best = matches[0];
  if (best.score < IDENTIFICATION_AUTO_SCORE) {
    return { accepted: false, reason: "SCORE_TOO_LOW", candidates: matches };
  }

  const contenders = matches.filter((match) => best.score - match.score <= AMBIGUITY_MARGIN);

  const substances = new Set(contenders.map((match) => substanceSignature(match.candidate)));
  if (substances.size > 1) {
    return { accepted: false, reason: "AMBIGUOUS_SUBSTANCE", candidates: contenders };
  }

  const dosages = new Set(
    contenders.map((match) => dosageSignature(tokenize(match.candidate.name))),
  );
  if (dosages.size > 1) {
    return { accepted: false, reason: "AMBIGUOUS_DOSAGE", candidates: contenders };
  }

  // Une ordonnance écrite en DCI (« Paracétamol 1 g ») ne nomme aucune
  // spécialité : des dizaines contiennent cette substance à ce dosage, et
  // elles n'ont pas toutes les mêmes conditions de délivrance. Retenir la
  // première reviendrait à afficher au pharmacien une marque que le
  // prescripteur n'a pas écrite. On ne tranche donc que s'il n'y a
  // effectivement qu'une seule spécialité possible.
  if (best.matchedOn === "SUBSTANCE" && contenders.length > 1) {
    return { accepted: false, reason: "SUBSTANCE_ONLY", candidates: contenders };
  }

  return { accepted: true, match: best };
}
