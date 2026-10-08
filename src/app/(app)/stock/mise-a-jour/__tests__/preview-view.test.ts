import { describe, expect, it } from "vitest";
import type { StockPreview } from "@/core/stock-deposit/types";
import { UPDATE_STEPS, confirmButtonLabel, confirmationText, needsZeroConsent, previewFacts, zeroConsentLabel } from "../preview-view";

const norm = (value: string) => value.replace(/[  ]/g, " ");

const preview = (extra: Partial<StockPreview> = {}): StockPreview => ({
  fileName: "stock.csv",
  products: 4306,
  recognized: 4300,
  created: 6,
  invalid: 0,
  knownStock: 4306,
  absent: 0,
  verdict: "APPLY",
  reason: null,
  warnings: [],
  ...extra,
});

describe("l'étape « Vérifier »", () => {
  it("les trois étapes, dans l'ordre", () => {
    expect(UPDATE_STEPS).toEqual(["Choisir le fichier", "Vérifier", "Confirmer"]);
  });

  it("dit ce que le fichier contient, sans jargon", () => {
    const facts = previewFacts(preview({ created: 6, invalid: 3, absent: 12 }));
    expect(facts.map((fact) => fact.key)).toEqual(["recognized", "created", "invalid", "absent"]);
    expect(facts.find((fact) => fact.key === "invalid")).toMatchObject({ label: "Lignes illisibles", value: "3", tone: "warning" });
    expect(facts.find((fact) => fact.key === "absent")).toMatchObject({ tone: "warning", hint: "Ils passeront à 0 en stock." });
    expect(JSON.stringify(facts)).not.toMatch(/CIP|EAN|agent|PowerShell/i);
  });

  it("une ligne n'apparaît que si elle dit quelque chose", () => {
    const keys = previewFacts(preview({ created: 0, invalid: 0, absent: 0 })).map((fact) => fact.key);
    expect(keys).toEqual(["recognized", "absent"]);
    expect(previewFacts(preview({ created: 0, absent: 0 })).find((fact) => fact.key === "absent")).toMatchObject({ value: "0", tone: "neutral", hint: "Aucun produit ne passe à 0." });
  });

  it("un fichier retenu ne promet pas de passage à 0 : il dit « passeraient »", () => {
    const facts = previewFacts(preview({ verdict: "HOLD", reason: "moins de 80 %", absent: 400 }));
    expect(facts.find((fact) => fact.key === "absent")?.hint).toBe("Ils passeraient à 0 si ce fichier était appliqué.");
  });

  it("à la première mise à jour (aucun stock connu), rien n'est comparé : pas de ligne « absents »", () => {
    expect(previewFacts(preview({ knownStock: 0, absent: null })).map((fact) => fact.key)).toEqual(["recognized", "created"]);
  });

  it("une seule ligne illisible, au singulier", () => {
    expect(previewFacts(preview({ invalid: 1 })).find((fact) => fact.key === "invalid")?.label).toBe("Ligne illisible");
  });
});

describe("la confirmation explicite d'un passage à zéro", () => {
  it("demandée dès qu'un produit passerait à 0 dans un fichier qui sera appliqué", () => {
    expect(needsZeroConsent(preview({ absent: 1 }))).toBe(true);
    expect(needsZeroConsent(preview({ absent: 0 }))).toBe(false);
    expect(needsZeroConsent(preview({ absent: null }))).toBe(false);
  });

  it("pas demandée pour un fichier retenu : rien ne change tant que l'équipe n'a pas tranché", () => {
    expect(needsZeroConsent(preview({ verdict: "HOLD", absent: 400, reason: "moins de 80 %" }))).toBe(false);
  });

  it("la case dit combien de produits passent à 0", () => {
    expect(norm(zeroConsentLabel(preview({ absent: 33 })))).toBe("Je confirme que ce fichier contient tout mon stock : 33 produits passeront à 0.");
    expect(norm(zeroConsentLabel(preview({ absent: 1 })))).toBe("Je confirme que ce fichier contient tout mon stock : 1 produit passera à 0.");
  });
});

describe("ce qui va se passer, dit sans détour", () => {
  it("un fichier appliqué remplace le stock, et dit combien passent à 0", () => {
    expect(norm(confirmationText(preview({ absent: 12 })))).toBe("Votre stock va être remplacé par ce fichier : 4 306 produits. 12 produits absents du fichier passeront à 0.");
    expect(norm(confirmationText(preview({ absent: 0 })))).toBe("Votre stock va être remplacé par ce fichier : 4 306 produits.");
  });

  it("un fichier retenu part à l'équipe : le stock ne change pas", () => {
    const text = confirmationText(preview({ verdict: "HOLD", reason: "x" }));
    expect(text).toMatch(/ne sera pas appliqué tout de suite/);
    expect(text).toMatch(/votre stock ne change pas/);
  });

  it("le bouton dit la vérité : confirmer, ou envoyer pour vérification", () => {
    expect(confirmButtonLabel(preview())).toBe("Confirmer la mise à jour");
    expect(confirmButtonLabel(preview({ verdict: "HOLD", reason: "x" }))).toBe("Envoyer pour vérification");
  });
});
