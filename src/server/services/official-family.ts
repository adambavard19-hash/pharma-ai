import "server-only";
import { prisma } from "@/server/db/client";
import { officialAtcForCis, officialTherapeuticClass } from "@/core/reference/atc/official-atc";
import { nameWords, pickFamilyByName, type FamilyCandidate } from "@/core/reference/atc/family-by-name";

/**
 * La famille officielle d'un médicament d'après son NOM, quand on n'a pas son code CIS (voir core/reference/atc/family-by-name.ts) :
 * les spécialités du catalogue national qui commencent par le même mot, ou dont la substance commence par lui, et leur code ATC
 * officiel. Aucun modèle, aucun crédit : c'est ce qui évite à la pharmacienne de classer à la main oméprazole ou désogestrel.
 */

export type OfficialFamily = { atcCode: string; therapeuticClass: string | null; substance: string | null };

const CANDIDATE_LIMIT = 400;

async function candidatesFor(head: string): Promise<(FamilyCandidate & { substanceLabels: string[] })[]> {
  const substances = await prisma.drugSubstance.findMany({ where: { searchLabel: { startsWith: head } }, select: { id: true }, take: 50 });
  const rows = await prisma.drugSpecialty.findMany({
    where: {
      OR: [
        { searchName: { startsWith: head } },
        { name: { startsWith: head, mode: "insensitive" } },
        ...(substances.length > 0 ? [{ compositions: { some: { nature: "SA", substanceId: { in: substances.map((row) => row.id) } } } }] : []),
      ],
    },
    select: { cisCode: true, name: true, searchName: true, compositions: { where: { nature: "SA" }, select: { substanceLabel: true } } },
    take: CANDIDATE_LIMIT,
  });
  return rows.flatMap((row) => {
    const official = officialAtcForCis(row.cisCode);
    if (!official) return [];
    const substanceLabels = [...new Set(row.compositions.map((composition) => composition.substanceLabel))];
    return [{ searchName: row.searchName || row.name.toUpperCase(), substances: substanceLabels, substanceLabels, atcCode: official.atcCode }];
  });
}

/** La famille officielle d'un nom, ou `null` si le catalogue ne la donne pas sans ambiguïté. */
export async function officialFamilyByName(name: string): Promise<OfficialFamily | null> {
  const head = nameWords(name)[0];
  if (!head) return null;
  let candidates = await candidatesFor(head);
  // « GAVISCONPRO » : aucune spécialité ne commence par le mot entier ; on raccourcit, six lettres au moins.
  for (let length = head.length - 1; candidates.length === 0 && length >= 6; length -= 1) candidates = await candidatesFor(head.slice(0, length));
  const atcCode = pickFamilyByName(name, candidates);
  if (!atcCode) return null;
  const sameFamily = candidates.filter((candidate) => candidate.atcCode.startsWith(atcCode));
  const substances = [...new Set(sameFamily.flatMap((candidate) => candidate.substanceLabels))];
  return { atcCode, therapeuticClass: officialTherapeuticClass(atcCode), substance: substances.length === 1 ? substances[0] : null };
}

/**
 * Les substances que le catalogue national donne aux spécialités de ce nom, quand elles s'accordent (une seule composition) :
 * de quoi éclairer le modèle pour un médicament sans famille officielle (non remboursé).
 */
export async function officialSubstancesByName(name: string): Promise<string[]> {
  const head = nameWords(name)[0];
  if (!head) return [];
  const rows = await prisma.drugSpecialty.findMany({
    where: { OR: [{ searchName: { startsWith: head } }, { name: { startsWith: head, mode: "insensitive" } }] },
    select: { compositions: { where: { nature: "SA" }, select: { substanceLabel: true } } },
    take: 50,
  });
  const sets = [...new Set(rows.map((row) => [...new Set(row.compositions.map((composition) => composition.substanceLabel))].sort().join(" + ")).filter(Boolean))];
  return sets.length === 1 ? sets[0].split(" + ") : [];
}
