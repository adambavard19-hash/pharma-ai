import "server-only";
import { prisma } from "@/server/db/client";
import {
  decideAutoAccept,
  identifyDrug,
  normalizeSearchText,
  tokenize,
  type AutoAcceptRefusal,
  type IdentificationMatch,
  type SpecialtyCandidate,
} from "@/core/reference";

/**
 * Rattachement des lignes d'ordonnance au catalogue national.
 *
 * Le texte d'une ordonnance n'est pas une donnée : c'est une chaîne de
 * caractères. Tant qu'elle n'est pas rattachée à une spécialité connue,
 * Pharma.ai ne sait ni ce que contient le médicament, ni sous quelle forme il
 * se présente, ni s'il relève d'une liste. Ce service fait ce rattachement — et
 * s'abstient de le faire dès qu'il y a un doute.
 */

/**
 * Nombre de spécialités confrontées au libellé.
 *
 * La sélection en base est large et grossière ; le classement fin se fait en
 * mémoire, sur des règles lisibles et testées. « DOLIPRANE » compte une
 * quarantaine de spécialités, « PARACÉTAMOL » plusieurs centaines : la borne
 * évite de charger toute une famille pour n'en garder qu'une poignée.
 */
const CANDIDATE_LIMIT = 120;

/** Bornes de la résolution préalable des substances. */
const SUBSTANCE_LIMIT = 200;

type SpecialtyRow = {
  id: string;
  cisCode: string;
  name: string;
  pharmaceuticalForm: string | null;
  marketingStatus: string | null;
  compositions: { substanceLabel: string }[];
};

const MARKETED = "Commercialisée";

function toCandidate(row: SpecialtyRow): SpecialtyCandidate {
  return {
    id: row.id,
    cisCode: row.cisCode,
    name: row.name,
    pharmaceuticalForm: row.pharmaceuticalForm,
    substances: [...new Set(row.compositions.map((item) => item.substanceLabel))],
    marketed: row.marketingStatus === MARKETED,
  };
}

/**
 * Présélection en base à partir du premier terme du libellé.
 *
 * Ce terme est la marque, ou la DCI quand le prescripteur l'emploie. Chercher
 * sur le libellé entier ne donnerait rien : « DOLIPRANE 1000 mg » n'est le nom
 * d'aucune spécialité — elles s'appellent toutes « …, comprimé »,
 * « …, gélule », etc.
 */
export async function findSpecialtyCandidates(drugName: string): Promise<SpecialtyCandidate[]> {
  const head = tokenize(drugName)[0];
  if (!head || head.length < 3) return [];

  // Les substances sont résolues d'abord, en une requête sur une table trente
  // fois plus petite. Sans cela, la recherche textuelle sur les substances est
  // réévaluée pour chacune des 14 442 spécialités — mesuré : c'est ce qui
  // faisait tripler la durée de l'analyse au comptoir.
  const substances = await prisma.drugSubstance.findMany({
    where: { searchLabel: { contains: head } },
    select: { id: true },
    take: SUBSTANCE_LIMIT,
  });
  const substanceIds = substances.map((substance) => substance.id);

  const rows = await prisma.drugSpecialty.findMany({
    where: {
      withdrawnAt: null,
      OR: [
        { searchName: { contains: head } },
        // Repli pour un catalogue importé avant la colonne normalisée : il
        // continue de répondre, à l'accent près.
        { name: { startsWith: head, mode: "insensitive" } },
        ...(substanceIds.length > 0
          ? [{ compositions: { some: { substanceId: { in: substanceIds } } } }]
          : []),
      ],
    },
    select: {
      id: true,
      cisCode: true,
      name: true,
      pharmaceuticalForm: true,
      marketingStatus: true,
      // SA = substance active telle que formulée (« AMOXICILLINE TRIHYDRATÉE »),
      // FT = fraction thérapeutique (« AMOXICILLINE BASE »). Les deux sont
      // officielles et désignent le même composant : les retenir toutes les
      // deux donne au croisement d'interactions deux chances de rencontrer le
      // vocabulaire du référentiel, sans rien interpréter.
      compositions: {
        where: { nature: { in: ["SA", "FT"] } },
        select: { substanceLabel: true, nature: true },
      },
    },
    // Ce qui est encore commercialisé d'abord : si la borne coupe, elle coupe
    // dans ce que l'officine ne peut plus commander.
    orderBy: [{ marketingStatus: "asc" }, { name: "asc" }],
    take: CANDIDATE_LIMIT,
  });

  return rows.map(toCandidate);
}

export type LineIdentificationResult = {
  lineId: string;
  position: number;
  drugName: string;
  /** Rattachement retenu, ou `null` si le doute subsiste. */
  specialtyId: string | null;
  score: number | null;
  /** Pourquoi le rattachement automatique n'a pas eu lieu. */
  refusal: AutoAcceptRefusal | null;
  /** Ce qui sera proposé au pharmacien quand il doit trancher. */
  candidates: IdentificationMatch[];
};

/** Nombre de candidats proposés au pharmacien : au-delà, la liste dessert. */
const PROPOSED_CANDIDATES = 6;

/**
 * Rattache ce qui peut l'être, propose le reste.
 *
 * Aucune ligne déjà rattachée par un professionnel n'est retouchée : une
 * décision humaine ne se fait pas écraser par un rapprochement automatique.
 */
export async function identifyPrescriptionLines(
  prescriptionId: string,
): Promise<LineIdentificationResult[]> {
  const lines = await prisma.prescriptionLine.findMany({
    where: { prescriptionId },
    select: {
      id: true,
      position: true,
      drugName: true,
      dosage: true,
      form: true,
      status: true,
      drugSpecialtyId: true,
      identifiedBy: true,
    },
    orderBy: { position: "asc" },
  });

  const results: LineIdentificationResult[] = [];

  for (const line of lines) {
    if (!line.drugName || line.status !== "CONFIRMED") continue;

    if (line.drugSpecialtyId && line.identifiedBy !== "AUTO") {
      results.push({
        lineId: line.id,
        position: line.position,
        drugName: line.drugName,
        specialtyId: line.drugSpecialtyId,
        score: null,
        refusal: null,
        candidates: [],
      });
      continue;
    }

    const candidates = await findSpecialtyCandidates(line.drugName);
    const matches = identifyDrug(
      { drugName: line.drugName, dosage: line.dosage, form: line.form },
      candidates,
    );
    const decision = decideAutoAccept(matches);

    if (decision.accepted) {
      await prisma.prescriptionLine.update({
        where: { id: line.id },
        data: {
          drugSpecialtyId: decision.match.candidate.id,
          identifiedBy: "AUTO",
          identificationScore: decision.match.score,
        },
      });
      results.push({
        lineId: line.id,
        position: line.position,
        drugName: line.drugName,
        specialtyId: decision.match.candidate.id,
        score: decision.match.score,
        refusal: null,
        candidates: [],
      });
      continue;
    }

    // Doute : on efface un rattachement automatique antérieur plutôt que de le
    // laisser traîner. Une donnée dont on n'est plus sûr ne doit pas survivre
    // parce qu'elle était là avant.
    if (line.drugSpecialtyId && line.identifiedBy === "AUTO") {
      await prisma.prescriptionLine.update({
        where: { id: line.id },
        data: { drugSpecialtyId: null, identifiedBy: null, identificationScore: null },
      });
    }

    results.push({
      lineId: line.id,
      position: line.position,
      drugName: line.drugName,
      specialtyId: null,
      score: null,
      refusal: decision.reason,
      candidates: decision.candidates.slice(0, PROPOSED_CANDIDATES),
    });
  }

  return results;
}

/**
 * Propose des candidats sans rien écrire.
 *
 * C'est ce que l'écran de vente affiche quand une ligne n'a pas pu être
 * rattachée seule : le pharmacien voit ce que le catalogue propose, et tranche.
 */
export async function proposeSpecialties(
  query: { drugName: string; dosage?: string | null; form?: string | null },
  limit = PROPOSED_CANDIDATES,
): Promise<IdentificationMatch[]> {
  const candidates = await findSpecialtyCandidates(query.drugName);
  return identifyDrug(query, candidates).slice(0, limit);
}

export type SpecialtyFacts = {
  id: string;
  cisCode: string;
  name: string;
  pharmaceuticalForm: string | null;
  administrationRoutes: string[];
  /** Substances actives telles que formulées (SA) — ce qui s'affiche. */
  substances: string[];
  /**
   * SA + fraction thérapeutique (FT). Les deux graphies officielles du même
   * composant, utilisées pour rencontrer le vocabulaire d'un référentiel
   * d'interactions. Jamais affichées : elles feraient doublon à l'écran.
   */
  interactionSubstances: string[];
  prescriptionConditions: string[];
  marketed: boolean;
  withdrawn: boolean;
};

/**
 * Les faits officiels d'une spécialité.
 *
 * Rien de rédigé ici : uniquement ce que la source publie. Ce qui relève de
 * l'explication au patient ou du conseil de prise vit dans une autre couche et
 * porte une autre origine.
 */
export async function loadSpecialtyFacts(
  specialtyIds: string[],
): Promise<Map<string, SpecialtyFacts>> {
  if (specialtyIds.length === 0) return new Map();

  const rows = await prisma.drugSpecialty.findMany({
    where: { id: { in: [...new Set(specialtyIds)] } },
    select: {
      id: true,
      cisCode: true,
      name: true,
      pharmaceuticalForm: true,
      administrationRoutes: true,
      marketingStatus: true,
      withdrawnAt: true,
      // SA = substance active telle que formulée (« AMOXICILLINE TRIHYDRATÉE »),
      // FT = fraction thérapeutique (« AMOXICILLINE BASE »). Les deux sont
      // officielles et désignent le même composant : les retenir toutes les
      // deux donne au croisement d'interactions deux chances de rencontrer le
      // vocabulaire du référentiel, sans rien interpréter.
      compositions: {
        where: { nature: { in: ["SA", "FT"] } },
        select: { substanceLabel: true, nature: true },
      },
      prescriptionConditions: { select: { label: true } },
    },
  });

  return new Map(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        cisCode: row.cisCode,
        name: row.name,
        pharmaceuticalForm: row.pharmaceuticalForm,
        administrationRoutes: row.administrationRoutes,
        substances: [
          ...new Set(
            row.compositions
              .filter((item) => item.nature === "SA")
              .map((item) => item.substanceLabel),
          ),
        ],
        interactionSubstances: [
          ...new Set(row.compositions.map((item) => item.substanceLabel)),
        ],
        prescriptionConditions: row.prescriptionConditions.map((item) => item.label),
        marketed: row.marketingStatus === MARKETED,
        withdrawn: row.withdrawnAt !== null,
      },
    ]),
  );
}

/** Recherche libre, pour l'écran où le pharmacien choisit lui-même. */
export async function searchSpecialties(query: string, limit = 12): Promise<SpecialtyCandidate[]> {
  const text = query.trim();
  if (text.length < 3) return [];

  const normalized = normalizeSearchText(text);
  const rows = await prisma.drugSpecialty.findMany({
    where: {
      withdrawnAt: null,
      OR: [
        { searchName: { contains: normalized } },
        { name: { contains: text, mode: "insensitive" } },
        { compositions: { some: { substance: { searchLabel: { contains: normalized } } } } },
      ],
    },
    select: {
      id: true,
      cisCode: true,
      name: true,
      pharmaceuticalForm: true,
      marketingStatus: true,
      // SA = substance active telle que formulée (« AMOXICILLINE TRIHYDRATÉE »),
      // FT = fraction thérapeutique (« AMOXICILLINE BASE »). Les deux sont
      // officielles et désignent le même composant : les retenir toutes les
      // deux donne au croisement d'interactions deux chances de rencontrer le
      // vocabulaire du référentiel, sans rien interpréter.
      compositions: {
        where: { nature: { in: ["SA", "FT"] } },
        select: { substanceLabel: true, nature: true },
      },
    },
    orderBy: [{ marketingStatus: "asc" }, { name: "asc" }],
    take: limit,
  });

  return rows.map(toCandidate);
}
