import { describe, expect, it } from "vitest";
import { detectAdviceOpportunities } from "../engines/advice";
import { drug, patient } from "./fixtures";

/**
 * Couverture : les classes les plus prescrites en ville doivent toutes
 * déclencher au moins un conseil, sinon le comptoir se tait sans raison.
 *
 * Chaque entrée nomme la classe ATC et ce qu'on attend. Ajouter une classe
 * ici sans règle fait échouer le test : c'est voulu.
 */
const COMMON_CLASSES: { atc: string; label: string; example: string }[] = [
  { atc: "J01CA04", label: "Antibiotique pénicilline", example: "AMOXICILLINE" },
  { atc: "J01AA02", label: "Cycline", example: "DOXYCYCLINE" },
  { atc: "J05AB11", label: "Antiviral antiherpétique", example: "VALACICLOVIR" },
  { atc: "M01AE01", label: "AINS", example: "IBUPROFENE" },
  { atc: "N02AX02", label: "Opioïde faible", example: "TRAMADOL" },
  { atc: "N02AA01", label: "Opioïde fort", example: "MORPHINE" },
  { atc: "A02BC05", label: "IPP", example: "ESOMEPRAZOLE" },
  { atc: "A10BA02", label: "Antidiabétique oral", example: "METFORMINE" },
  { atc: "A10AB05", label: "Insuline", example: "INSULINE ASPARTE" },
  { atc: "C09AA05", label: "IEC", example: "RAMIPRIL" },
  { atc: "C07AB07", label: "Bêtabloquant", example: "BISOPROLOL" },
  { atc: "C08CA01", label: "Inhibiteur calcique", example: "AMLODIPINE" },
  { atc: "C03CA01", label: "Diurétique de l'anse", example: "FUROSEMIDE" },
  { atc: "R03BA01", label: "Corticoïde inhalé", example: "BECLOMETASONE" },
  { atc: "R06AX27", label: "Antihistaminique", example: "DESLORATADINE" },
  { atc: "D10BA01", label: "Isotrétinoïne", example: "ISOTRETINOINE" },
  { atc: "N05BA06", label: "Anxiolytique", example: "LORAZEPAM" },
  { atc: "N06AB06", label: "Antidépresseur ISRS", example: "SERTRALINE" },
  { atc: "M05BA04", label: "Bisphosphonate", example: "ACIDE ALENDRONIQUE" },
  { atc: "B03AA07", label: "Fer", example: "SULFATE FERREUX" },
  { atc: "H02AB07", label: "Corticoïde oral", example: "PREDNISONE" },
  { atc: "S01XA20", label: "Substitut lacrymal", example: "LACRIFLUID" },
];

describe("couverture des classes courantes", () => {
  for (const entry of COMMON_CLASSES) {
    it(`${entry.label} (${entry.atc}) déclenche au moins un conseil`, () => {
      const opportunities = detectAdviceOpportunities({
        drugs: [{ lineIndex: 0, drugName: entry.example, knowledge: drug({ name: entry.example, inn: entry.example, atcCode: entry.atc, therapeuticClass: null, commonSideEffects: [] }) }],
        patient: patient(),
        needs: [],
      });
      expect(opportunities.length, `${entry.label} : aucune règle ne parle`).toBeGreaterThan(0);
    });
  }

  it("valaciclovir : antiseptique en tête, puis réparation, bouton de fièvre en question, mains", () => {
    const opportunities = detectAdviceOpportunities({
      drugs: [{ lineIndex: 0, drugName: "ZELITREX 500 mg", knowledge: drug({ name: "ZELITREX 500 mg", inn: "VALACICLOVIR", atcCode: "J05AB11", therapeuticClass: "Antiviral", commonSideEffects: [] }) }],
      patient: patient(),
      needs: [],
    });
    const keys = opportunities.map((o) => o.key);
    expect(keys[0]).toBe("herpes-zona-antiseptic");
    expect(keys).toEqual(expect.arrayContaining(["herpes-lysine", "herpes-zona-skin-repair", "herpes-labial-patch", "hand-hygiene-contagious"]));
    expect(opportunities.find((o) => o.key === "herpes-labial-patch")?.requiresConfirmation).toBe(true);
  });
});

describe("sécheresse oculaire", () => {
  it("un substitut lacrymal prescrit appelle un lubrifiant à l'acide hyaluronique, et la question des paupières", () => {
    const opportunities = detectAdviceOpportunities({
      drugs: [{ lineIndex: 0, drugName: "LACRIFLUID 0,13 %", knowledge: drug({ name: "LACRIFLUID 0,13 %", inn: "CARBOMERE", atcCode: "S01XA20", therapeuticClass: "Substitut lacrymal", commonSideEffects: [] }) }],
      patient: patient(),
      needs: [],
    });
    const keys = opportunities.map((o) => o.key);
    expect(keys[0]).toBe("dry-eye-screen-lubricant");
    expect(keys).toContain("dry-eye-eyelid-care");
    expect(opportunities.find((o) => o.key === "dry-eye-eyelid-care")?.requiresConfirmation).toBe(true);
  });
});

