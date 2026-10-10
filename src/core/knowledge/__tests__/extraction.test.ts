import { describe, expect, it } from "vitest";
import { chunkText, nameIsInDocument, normalizeText, quoteIsInDocument, validateExtraction, MAX_PROPOSALS_PER_DOCUMENT } from "../extraction";

const DOC = [
  "Fiche de comptoir — antibiotiques.",
  "Sous antibiotique, la flore intestinale est perturbée : conseiller un probiotique comme Ergyphilus Intima pour protéger la flore.",
  "Coryzalia : proposer aussi un sirop pour la toux grasse chez l'adulte.",
].join("\n");

const rule = (over: Record<string, unknown> = {}) => ({
  title: "Probiotique sous antibiotique",
  kind: "TOLERANCE",
  atc_prefixes: ["J01"],
  therapeutic_classes: [],
  category: "PROBIOTIQUES",
  matching_tags: ["probiotique"],
  short_reason: "Sous {drug}, la flore intestinale peut être perturbée.",
  counter_script: "Avec cet antibiotique, je vous conseille {product} pour protéger votre flore.",
  ...over,
});

describe("la citation doit exister dans le document", () => {
  it("accepte une citation recopiée, malgré les accents, la casse et la ponctuation", () => {
    expect(quoteIsInDocument("sous antibiotique la flore intestinale est perturbee conseiller un probiotique", DOC)).toBe(true);
  });
  it("refuse une citation inventée, trop courte, ou qui change un mot", () => {
    expect(quoteIsInDocument("la flore intestinale est protégée par la vitamine C", DOC)).toBe(false);
    expect(quoteIsInDocument("flore", DOC)).toBe(false);
    expect(quoteIsInDocument("Sous antibiotique, la flore vaginale est perturbée : conseiller", DOC)).toBe(false);
  });
  it("un nom cité doit être écrit dans le document", () => {
    expect(nameIsInDocument("Ergyphilus Intima", DOC)).toBe(true);
    expect(nameIsInDocument("Intima Ergyphilus", DOC)).toBe(true);
    expect(nameIsInDocument("Lactibiane Tolérance", DOC)).toBe(false);
  });
  it("normalise accents, majuscules et ponctuation", () => {
    expect(normalizeText("Éléphant,  d'Été!")).toBe("elephant d ete");
  });
});

describe("ce qui reste après vérification", () => {
  it("garde une association citée et nommée dans le document", () => {
    const { proposals, discarded } = validateExtraction(
      { items: [{ type: "ASSOCIATION", quote: "Coryzalia : proposer aussi un sirop pour la toux grasse chez l'adulte.", association: { trigger_kind: "PRODUCT", trigger_name: "Coryzalia", advice_product_name: "sirop toux grasse" } }] },
      DOC,
      "Fiche",
    );
    expect(discarded).toEqual([]);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({ kind: "ASSOCIATION", title: "Coryzalia → sirop toux grasse", payload: { triggerKind: "PRODUCT", sentence: null } });
  });

  it("écarte une association dont un nom n'est pas dans le document, même citée", () => {
    const { proposals, discarded } = validateExtraction(
      { items: [{ type: "ASSOCIATION", quote: "Coryzalia : proposer aussi un sirop pour la toux grasse chez l'adulte.", association: { trigger_kind: "PRODUCT", trigger_name: "Coryzalia", advice_product_name: "Humex Rhume" } }] },
      DOC,
      "Fiche",
    );
    expect(proposals).toEqual([]);
    expect(discarded[0].reason).toContain("nom cité");
  });

  it("garde un conseil conforme, avec la source du document", () => {
    const { proposals } = validateExtraction({ items: [{ type: "RULE", quote: "Sous antibiotique, la flore intestinale est perturbée : conseiller un probiotique", rule: rule() }] }, DOC, "Fiche antibiotiques");
    expect(proposals).toHaveLength(1);
    expect(proposals[0].kind).toBe("RULE");
    if (proposals[0].kind === "RULE") expect(proposals[0].payload.source).toBe("Document déposé : Fiche antibiotiques");
  });

  it("écarte un conseil hors règles : étiquette inconnue, sans {product}, type « sécurité »", () => {
    const quote = "Sous antibiotique, la flore intestinale est perturbée : conseiller un probiotique";
    const bad = [rule({ matching_tags: ["étiquette-inventée"] }), rule({ counter_script: "Je vous conseille ce produit pour protéger votre flore." }), rule({ kind: "SAFETY" })];
    const { proposals, discarded } = validateExtraction({ items: bad.map((r) => ({ type: "RULE", quote, rule: r })) }, DOC, "Fiche");
    expect(proposals).toEqual([]);
    expect(discarded).toHaveLength(3);
  });

  it("écarte une citation inventée, un type inconnu, une réponse illisible", () => {
    const { proposals, discarded } = validateExtraction({ items: [{ type: "RULE", quote: "Un texte que le document ne contient absolument pas.", rule: rule() }, { type: "AUTRE", quote: "Sous antibiotique, la flore intestinale est perturbée" }] }, DOC, "Fiche");
    expect(proposals).toEqual([]);
    expect(discarded.map((d) => d.reason)).toEqual(["la citation n'existe pas dans le document", "type de proposition inconnu"]);
    expect(validateExtraction(null, DOC, "Fiche")).toEqual({ proposals: [], discarded: [] });
    expect(validateExtraction({ items: "pas une liste" }, DOC, "Fiche")).toEqual({ proposals: [], discarded: [] });
  });

  it("ne garde pas deux fois la même proposition, et plafonne le nombre", () => {
    const quote = "Sous antibiotique, la flore intestinale est perturbée : conseiller un probiotique";
    const twice = validateExtraction({ items: [{ type: "RULE", quote, rule: rule() }, { type: "RULE", quote, rule: rule() }] }, DOC, "Fiche");
    expect(twice.proposals).toHaveLength(1);
    const many = Array.from({ length: 80 }, (_, i) => ({ type: "RULE", quote, rule: rule({ title: `Conseil numéro ${i}` }) }));
    expect(validateExtraction({ items: many }, DOC, "Fiche").proposals).toHaveLength(MAX_PROPOSALS_PER_DOCUMENT);
  });
});

describe("le découpage d'un long document", () => {
  it("ne perd aucun mot et coupe aux fins de paragraphes", () => {
    const paragraphs = Array.from({ length: 40 }, (_, i) => `Paragraphe ${i} ${"mot ".repeat(60)}`.trim());
    const text = paragraphs.join("\n\n");
    const chunks = chunkText(text, 2000);
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks.every((chunk) => chunk.length <= 2000)).toBe(true);
    expect(chunks.join(" ").replace(/\s+/g, " ")).toBe(text.replace(/\s+/g, " "));
  });
  it("un texte court reste en un morceau", () => {
    expect(chunkText("court")).toEqual(["court"]);
  });
});
