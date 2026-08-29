import type { DrugKnowledgeProvider, ProviderInfo } from "../ports";
import type { DrugKnowledge } from "../types";

/**
 * La couche ÉDITORIALE du référentiel : ce que Pharma.ai raconte d'un
 * médicament — explication au patient, conseils de prise, classes
 * d'interaction, populations à surveiller.
 *
 * Elle est distincte du catalogue national, qui dit ce qu'un médicament EST
 * (composition, forme, conditions de délivrance) et le dit avec sa source et sa
 * date. Les deux ne doivent jamais être présentées comme une seule information :
 * l'une est publiée par l'ANSM, l'autre est rédigée ici.
 *
 * ⚠️ POINT CRITIQUE DU PRODUIT — le jeu livré est FICTIF (`isDemoData = true`).
 * Le catalogue national, lui, peut être réel : identifier correctement un
 * médicament ne dit donc RIEN de ses interactions. Le moteur de sécurité
 * signale explicitement chaque ligne identifiée mais non couverte, pour qu'une
 * absence d'alerte ne se lise jamais comme une absence de risque.
 */

export type DrugRecordLoader = () => Promise<DrugKnowledge[]>;

export class LocalDrugKnowledgeProvider implements DrugKnowledgeProvider {
  readonly info: ProviderInfo;

  private cache: Map<string, DrugKnowledge> | null = null;

  constructor(
    private readonly load: DrugRecordLoader,
    options?: { label?: string; capability?: ProviderInfo["capability"] },
  ) {
    this.info = {
      id: "local-demo",
      label: options?.label ?? "Couche éditoriale (jeu de démonstration)",
      capability: options?.capability ?? "SIMULATED",
      description:
        "Table `drug_references` : interactions, populations à surveiller, explication patient et conseils de prise. Distincte du catalogue national, qui fournit la composition et les conditions de délivrance. Le jeu livré est fictif et signalé comme tel ; il doit être remplacé par une base médicamenteuse validée avant toute mise en production.",
    };
  }

  private async index(): Promise<Map<string, DrugKnowledge>> {
    if (this.cache) return this.cache;

    const records = await this.load();
    const map = new Map<string, DrugKnowledge>();
    for (const record of records) {
      map.set(record.name.toLowerCase(), record);
      if (record.inn) map.set(record.inn.toLowerCase(), record);
    }
    this.cache = map;
    return map;
  }

  /** Vide le cache après une mise à jour du référentiel. */
  invalidate(): void {
    this.cache = null;
  }

  async lookup(drugName: string): Promise<DrugKnowledge | null> {
    if (!drugName) return null;
    const index = await this.index();
    const key = drugName.toLowerCase().trim();

    const direct = index.get(key);
    if (direct) return direct;

    // Correspondance sur le premier mot (« Amoxicilline 1 g » → « amoxicilline »).
    const firstWord = key.split(/[\s,]+/)[0];
    if (firstWord && firstWord.length > 3) {
      const partial = index.get(firstWord);
      if (partial) return partial;

      for (const [name, record] of index) {
        if (name.startsWith(firstWord) || firstWord.startsWith(name)) return record;
      }
    }

    // Aucune correspondance : on renvoie `null`. Rien n'est deviné.
    return null;
  }

  async lookupMany(drugNames: string[]): Promise<Map<string, DrugKnowledge | null>> {
    const result = new Map<string, DrugKnowledge | null>();
    for (const name of drugNames) {
      result.set(name.toLowerCase(), await this.lookup(name));
    }
    return result;
  }

  async search(query: string, limit = 10): Promise<DrugKnowledge[]> {
    const index = await this.index();
    const q = query.toLowerCase().trim();
    if (!q) return [];

    const seen = new Set<string>();
    const results: DrugKnowledge[] = [];
    for (const [name, record] of index) {
      if (name.includes(q) && !seen.has(record.id)) {
        seen.add(record.id);
        results.push(record);
        if (results.length >= limit) break;
      }
    }
    return results;
  }
}
