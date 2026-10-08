import { describe, expect, it } from "vitest";
import { runAnalysisPipeline } from "../pipeline";
import { evaluateVigilances, VIGILANCE_RULES } from "../engines/vigilance";
import { VETERINARY_VIGILANCES } from "../engines/vigilance-veterinaire";
import { isVeterinaryKnowledge, readVeterinaryProduct, veterinaryKnowledge } from "../engines/veterinary";
import { drug, patient } from "./fixtures";

/**
 * Antiparasitaires pour chiens et chats : reconnus à leur libellé, et rien
 * d'autre que ce que deux publications de l'ANSES établissent.
 */

function vigilanceKeys(name: string): string[] {
  const knowledge = veterinaryKnowledge(name);
  return knowledge ? evaluateVigilances([knowledge]).map((v) => v.key) : [];
}

describe("reconnaissance d'un produit pour animaux", () => {
  it("lit l'espèce, la forme et la substance écrites dans le libellé", () => {
    expect(readVeterinaryProduct("SPOT ON CHIEN 10-25KG 4 PIP")).toMatchObject({ species: ["CHIEN"], form: "SPOT_ON", cutaneous: true });
    expect(readVeterinaryProduct("Collier anti-tiques grand chien")).toMatchObject({ species: ["CHIEN"], form: "COLLIER", cutaneous: true });
    expect(readVeterinaryProduct("SHAMPOOING ANTIPUCES CHAT")).toMatchObject({ species: ["CHAT"], form: "SHAMPOOING", cutaneous: true });
    expect(readVeterinaryProduct("ANTIPUCES SPRAY CHIEN ET CHAT")).toMatchObject({ species: ["CHIEN", "CHAT"], form: "SPRAY" });
    expect(readVeterinaryProduct("PIPETTES FIPRONIL CHIEN 4 x 2,68 ml")?.substances).toEqual(["fipronil"]);
  });

  it("un vermifuge en comprimé est reconnu, mais n'est pas un antiparasitaire cutané", () => {
    expect(readVeterinaryProduct("MILBETEL VERMIFUGE PETIT CHAT 2 comprimés")).toMatchObject({ species: ["CHAT"], form: "COMPRIME", cutaneous: false });
    expect(readVeterinaryProduct("milbémycine praziquantel chien 5 kg")).toMatchObject({ cutaneous: false });
  });

  it("une substance en comprimé ou de forme inconnue n'est jamais lue comme cutanée au hasard", () => {
    expect(readVeterinaryProduct("AFOXOLANER CHIEN 10 kg comprimé à croquer")?.cutaneous).toBe(false);
    expect(readVeterinaryProduct("FLURALANER CHIEN")?.cutaneous).toBe(false);
  });

  it("ne reconnaît ni un aliment, ni un accessoire, ni un shampooing ordinaire, ni un outil", () => {
    for (const name of ["CROQUETTES CHIEN ADULTE 12 kg", "SHAMPOOING DOUX CHIEN 250 ml", "TIRE-TIQUE CHIEN CHAT", "TIRE TIQUES lot de 2 chien", "COLLIER ELISABETHAIN CHAT", "ANTIPUCES"]) {
      expect(readVeterinaryProduct(name), name).toBeNull();
    }
  });

  it("une substance sans espèce ne prouve rien : un produit humain à la perméthrine n'est jamais vétérinaire", () => {
    for (const name of ["TOPISCAB 5 % crème perméthrine", "PERMETHRINE 5 % crème gale", "SPRAY-PAX pou deltaméthrine"]) {
      expect(readVeterinaryProduct(name), name).toBeNull();
    }
  });

  it("n'invente rien à partir d'une marque", () => {
    expect(readVeterinaryProduct("ADVANTIX 25-40 kg")).toBeNull();
    expect(readVeterinaryProduct("FRONTLINE COMBO")).toBeNull();
  });

  it("la fiche remise au moteur est vide : aucun ATC, aucune classe, aucun effet — aucune règle humaine ne s'y accroche", () => {
    const knowledge = veterinaryKnowledge("SPOT ON CHIEN 10-25KG 4 PIP")!;
    expect(isVeterinaryKnowledge(knowledge)).toBe(true);
    expect(knowledge).toMatchObject({ atcCode: null, therapeuticClass: null, inn: null, commonSideEffects: [], origin: "VETERINARY_NAME" });
    expect(veterinaryKnowledge("CROQUETTES CHIEN")).toBeNull();
  });
});

describe("vigilances vétérinaires", () => {
  it("chaque règle est sourcée par l'ANSES et ne lit que les produits vétérinaires", () => {
    expect(VETERINARY_VIGILANCES.length).toBeGreaterThan(0);
    for (const rule of VETERINARY_VIGILANCES) {
      expect(VIGILANCE_RULES).toContain(rule);
      expect(rule.veterinary?.cutaneous).toBe(true);
      expect(rule.atcPrefixes).toEqual([]);
      expect(rule.substances).toEqual([]);
      expect(rule.sources.join(" ")).toMatch(/ANSES/);
      expect(rule.explanationTemplate).toContain("{drug}");
    }
  });

  it("pipette pour chien : le danger pour le chat, le bon usage, le léchage et la famille", () => {
    const keys = vigilanceKeys("SPOT ON CHIEN 10-25KG 4 PIP");
    expect(keys).toEqual(expect.arrayContaining(["vet-chien-permethrine-chat", "vet-espece-poids-age", "vet-spot-on-lechage", "vet-protection-famille"]));
    expect(keys).not.toContain("vet-non-unidose-surdosage");
  });

  it("spray ou shampooing pour chien : le risque de surdosage remplace le léchage", () => {
    for (const name of ["SPRAY ANTIPUCES CHIEN", "SHAMPOOING ANTIPUCES CHIEN"]) {
      const keys = vigilanceKeys(name);
      expect(keys, name).toContain("vet-non-unidose-surdosage");
      expect(keys, name).toContain("vet-chien-permethrine-chat");
      expect(keys, name).not.toContain("vet-spot-on-lechage");
    }
  });

  it("pipette pour chat, ou pour chien ET chat : pas d'alerte « danger pour le chat »", () => {
    expect(vigilanceKeys("SPOT ON CHAT 4 PIP")).not.toContain("vet-chien-permethrine-chat");
    expect(vigilanceKeys("SPOT ON CHIEN ET CHAT 4 PIP")).not.toContain("vet-chien-permethrine-chat");
    expect(vigilanceKeys("SPOT ON CHAT 4 PIP")).toContain("vet-spot-on-lechage");
  });

  it("un vermifuge en comprimé ne déclenche aucune vigilance : aucune source lue ne le couvre", () => {
    expect(vigilanceKeys("MILBETEL VERMIFUGE PETIT CHAT 2 comprimés")).toEqual([]);
  });

  it("le danger pour le chat est une contre-indication, avec le geste à faire en cas d'exposition", () => {
    const hit = evaluateVigilances([veterinaryKnowledge("SPOT ON CHIEN 4 PIP")!]).find((v) => v.key === "vet-chien-permethrine-chat")!;
    expect(hit.kind).toBe("CONTRAINDICATION");
    expect(hit.severity).toBe("WARNING");
    expect(hit.explanation).toMatch(/toxiques pour le chat/);
    expect(hit.explanation).toMatch(/SPOT ON CHIEN 4 PIP/);
    expect(hit.patientAdvice).toMatch(/eau tiède/);
    expect(hit.patientAdvice).toMatch(/vétérinaire/);
  });

  it("un médicament humain à la perméthrine ne déclenche aucune vigilance vétérinaire", () => {
    const topiscab = drug({ name: "TOPISCAB 5 % crème", inn: "PERMETHRINE", atcCode: "P03AC04", therapeuticClass: "Antiparasitaire externe", commonSideEffects: [] });
    expect(evaluateVigilances([topiscab]).map((v) => v.key).filter((key) => key.startsWith("vet-"))).toEqual([]);
    // Même un libellé qui parle de chien, sans reconnaissance vétérinaire, reste du côté humain.
    const homonym = drug({ name: "SPOT ON CHIEN", inn: null, atcCode: null, therapeuticClass: null, commonSideEffects: [] });
    expect(evaluateVigilances([homonym]).map((v) => v.key).filter((key) => key.startsWith("vet-"))).toEqual([]);
  });

  it("un produit pour animaux ne déclenche aucune règle du médicament humain", () => {
    const keys = vigilanceKeys("ANTIPUCES SPOT ON CHIEN LEVOTHYROXINE ZINC");
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((key) => key.startsWith("vet-"))).toBe(true);
  });
});

describe("dans l'analyse complète", () => {
  const name = "SPOT ON CHIEN 10-25KG 4 PIP";
  const result = runAnalysisPipeline({
    lines: [{ lineIndex: 0, drugName: name, posology: null, durationDays: null, confirmed: true }],
    knowledge: new Map([[name.toLowerCase(), veterinaryKnowledge(name)]]),
    patient: patient(),
    catalog: [],
    rules: [],
    history: {},
    explanations: [],
    extractionFindings: [],
    usedSimulatedProviders: false,
  });

  it("les vigilances vétérinaires arrivent à l'écran du comptoir", () => {
    const keys = (result.vigilances ?? []).map((v) => v.key);
    expect(keys).toContain("vet-chien-permethrine-chat");
    expect(result.safetyFindings.find((f) => f.code === "VIGILANCE_CONTRAINDICATION")?.details?.subtitle).toBe("Antiparasitaire externe pour chien");
  });

  it("aucun conseil de médicament humain (le conseil anti-poux) n'est déclenché", () => {
    expect(result.recommendations).toEqual([]);
    expect(result.opportunities.map((o) => o.ruleKey).join(" ")).not.toMatch(/lice|poux|pediculi/i);
  });

  it("le produit est dit « pour animaux », pas « absent du référentiel »", () => {
    const codes = result.safetyFindings.map((f) => f.code);
    expect(codes).toContain("VETERINARY_PRODUCT");
    expect(codes).not.toContain("DRUG_NOT_IN_REFERENTIAL");
    expect(codes).not.toContain("DRUG_NOT_IDENTIFIED");
    expect(codes).not.toContain("DRUG_NO_INTERACTION_DATA");
  });
});
