import { describe, expect, it } from "vitest";
import type { DrugKnowledge } from "../../types";
import { LocalDrugKnowledgeProvider } from "../local-drug-knowledge";
import { drug } from "../../__tests__/fixtures";

/**
 * Retrouver un médicament dans la couche éditoriale : par son nom, par sa DCI, ou par le début de son nom (« Amoxicilline 1 g »).
 * Un début trop court ne désigne rien : « fervex » commence par « fer », la DCI du fumarate de fer — et un Fervex était lu comme du
 * fer (retour d'officine du 10 octobre 2026), donc ni l'alerte du paracétamol, ni le bon conseil.
 */

const records: DrugKnowledge[] = [
  drug({ id: "fer", name: "Fumarate de fer", inn: "Fer", atcCode: "B03AA02" }),
  drug({ id: "amox", name: "Amoxicilline", inn: "Amoxicilline", atcCode: "J01CA04" }),
  drug({ id: "doli", name: "Doliprane", inn: "Paracétamol", atcCode: "N02BE01" }),
];
const provider = () => new LocalDrugKnowledgeProvider(async () => records);

describe("la recherche dans la couche éditoriale", () => {
  it("retrouve par le nom exact, par la DCI, et par le premier mot d'une ligne d'ordonnance", async () => {
    const p = provider();
    expect((await p.lookup("Doliprane"))?.id).toBe("doli");
    expect((await p.lookup("paracétamol"))?.id).toBe("doli");
    expect((await p.lookup("Amoxicilline 1 g"))?.id).toBe("amox");
    expect((await p.lookup("AMOXICILLINE ARROW 1 g, comprimé"))?.id).toBe("amox");
  });

  it("un nom qui commence comme une DCI courte n'est pas cette DCI : Fervex n'est pas du fer", async () => {
    const p = provider();
    expect(await p.lookup("FERVEX ADULTES, granulés pour solution buvable en sachet")).toBeNull();
    expect(await p.lookup("Ferrostrane")).toBeNull();
    // Le fer lui-même reste trouvé par son nom.
    expect((await p.lookup("Fumarate de fer"))?.id).toBe("fer");
  });

  it("aucune correspondance : rien n'est deviné", async () => {
    expect(await provider().lookup("Médicament inconnu 10 mg")).toBeNull();
    expect(await provider().lookup("")).toBeNull();
  });
});
