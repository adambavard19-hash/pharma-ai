import "server-only";
import { prisma } from "@/server/db/client";
import { normalizeSearchText } from "@/core/reference/search";
import { officialAtcForCis, officialTherapeuticClass } from "@/core/reference/atc/official-atc";
import { nameWords, pickFamilyByName, type FamilyCandidate } from "@/core/reference/atc/family-by-name";

/**
 * La famille officielle d'un médicament d'après son NOM, quand on n'a pas son code CIS (voir core/reference/atc/family-by-name.ts) :
 * les spécialités du catalogue national qui commencent par le même mot, ou dont la substance commence par lui, et leur code ATC
 * officiel. Aucun modèle, aucun crédit : c'est ce qui évite à la pharmacienne de classer à la main oméprazole ou désogestrel.
 *
 * Le catalogue (≈ 15 000 spécialités) est lu UNE fois par serveur et gardé en mémoire : chercher en base médicament par médicament
 * prenait plusieurs secondes chacun (27 oct. 2026 : 22 médicaments rangés en 5 minutes, puis coupé).
 */

export type OfficialFamily = { atcCode: string; therapeuticClass: string | null; substance: string | null };

type Entry = FamilyCandidate & { substanceLabels: string[] };
type Catalog = { byWord: Map<string, Entry[]> };

const CATALOG_TTL_MS = 6 * 60 * 60 * 1000;
let catalog: { loadedAt: number; value: Promise<Catalog> } | null = null;

async function readCatalog(): Promise<Catalog> {
  const rows = await prisma.drugSpecialty.findMany({ select: { cisCode: true, name: true, searchName: true, compositions: { where: { nature: "SA" }, select: { substanceLabel: true } } } });
  const byWord = new Map<string, Entry[]>();
  for (const row of rows) {
    const substanceLabels = [...new Set(row.compositions.map((composition) => composition.substanceLabel))];
    const searchName = row.searchName || normalizeSearchText(row.name);
    const entry: Entry = { searchName, substances: substanceLabels, substanceLabels, atcCode: officialAtcForCis(row.cisCode)?.atcCode ?? "" };
    // Indexé par le premier mot du nom et par le premier mot de chaque substance.
    const words = new Set([nameWords(searchName)[0], ...substanceLabels.map((label) => nameWords(label)[0])].filter((word): word is string => Boolean(word)));
    for (const word of words) {
      const list = byWord.get(word);
      if (list) list.push(entry);
      else byWord.set(word, [entry]);
    }
  }
  return { byWord };
}

function loadCatalog(): Promise<Catalog> {
  if (!catalog || Date.now() - catalog.loadedAt > CATALOG_TTL_MS) {
    const value = readCatalog();
    catalog = { loadedAt: Date.now(), value };
    // Une lecture ratée ne reste pas en mémoire : la suivante réessaie.
    value.catch(() => { catalog = null; });
  }
  return catalog.value;
}

/** Les spécialités dont le nom ou une substance commence par ce mot ; « GAVISCONPRO » se raccourcit jusqu'à six lettres. */
function candidatesFor(store: Catalog, head: string, keep: (entry: Entry) => boolean = () => true): Entry[] {
  const exact = (store.byWord.get(head) ?? []).filter(keep);
  if (exact.length > 0) return exact;
  for (let length = head.length - 1; length >= 6; length -= 1) {
    const prefix = head.slice(0, length);
    const found = [...store.byWord.entries()].filter(([word]) => word.startsWith(prefix)).flatMap(([, list]) => list).filter(keep);
    if (found.length > 0) return found;
  }
  return [];
}

/** La famille officielle d'un nom, ou `null` si le catalogue ne la donne pas sans ambiguïté. */
export async function officialFamilyByName(name: string): Promise<OfficialFamily | null> {
  const head = nameWords(name)[0];
  if (!head) return null;
  const candidates = candidatesFor(await loadCatalog(), head, (entry) => Boolean(entry.atcCode));
  const atcCode = pickFamilyByName(name, candidates);
  if (!atcCode) return null;
  const substances = [...new Set(candidates.filter((candidate) => candidate.atcCode.startsWith(atcCode)).flatMap((candidate) => candidate.substanceLabels))];
  return { atcCode, therapeuticClass: officialTherapeuticClass(atcCode), substance: substances.length === 1 ? substances[0] : null };
}

/**
 * Les substances que le catalogue national donne aux spécialités de ce nom, quand elles s'accordent (une seule composition) :
 * de quoi éclairer le modèle pour un médicament sans famille officielle (non remboursé).
 */
export async function officialSubstancesByName(name: string): Promise<string[]> {
  const head = nameWords(name)[0];
  if (!head) return [];
  const sets = [...new Set(candidatesFor(await loadCatalog(), head).map((entry) => [...entry.substanceLabels].sort().join(" + ")).filter(Boolean))];
  return sets.length === 1 ? sets[0].split(" + ") : [];
}
