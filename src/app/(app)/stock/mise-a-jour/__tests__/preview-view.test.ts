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
    expect(norm(confirmationText(preview({ absent: 12 })))).toBe("Les quantités de 4 306 produits seront mises à jour. Les prix que ce fichier ne contient pas sont conservés (vos prix d'achat restent). 12 produits absents du fichier passeront à 0.");
    expect(norm(confirmationText(preview({ absent: 0 })))).toBe("Les quantités de 4 306 produits seront mises à jour. Les prix que ce fichier ne contient pas sont conservés (vos prix d'achat restent).");
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

describe("plusieurs fichiers, et « Ce fichier complète seulement mes prix »", () => {
  const MERGED = preview({
    products: 4306,
    withBothPrices: 4120,
    merge: { files: [{ fileName: "pamp.pdf", priceKind: "PURCHASE", priceLabel: "PAMP Net" }, { fileName: "pv.pdf", priceKind: "SALE", priceLabel: "PV TTC" }], quantityConflicts: 3 },
  });

  it("dit en clair ce que donnent les fichiers réunis", async () => {
    const { mergeHeadline } = await import("../preview-view");
    expect(norm(mergeHeadline(MERGED) ?? "")).toBe("2 fichiers réunis : prix d'achat (PAMP Net) + prix de vente (PV TTC) — 4 306 produits, dont 4 120 avec les deux prix");
    expect(mergeHeadline(preview())).toBeNull();
  });

  it("compte les produits avec leurs deux prix, et les quantités qui diffèrent entre fichiers", () => {
    const facts = previewFacts(MERGED);
    const both = facts.find((fact) => fact.key === "both")!;
    expect(norm(both.value)).toBe("4 120");
    expect(both.hint).toContain("marge");
    expect(facts.find((fact) => fact.key === "conflicts")).toMatchObject({ value: "3", tone: "warning", hint: "La quantité du fichier le plus récent est retenue." });
  });

  it("un envoi ordinaire : les quantités sont mises à jour, les prix absents conservés — jamais « remplacer » ni « écraser »", () => {
    const text = norm(confirmationText(preview({ products: 4306 })));
    expect(text).toBe("Les quantités de 4 306 produits seront mises à jour. Les prix que ce fichier ne contient pas sont conservés (vos prix d'achat restent).");
    expect(text).not.toMatch(/rempla|écras/i);
  });

  it("mode « prix seulement » : seuls des prix, aucune quantité, aucune case « passera à 0 »", () => {
    const prices = preview({ mode: "PRICES", absent: null, pricesUpdated: 4100, withBothPrices: 4100 });
    expect(norm(confirmationText(prices))).toBe("Seuls les prix de 4 100 produits seront complétés ; aucune quantité ne change, aucun produit n'est ajouté ni mis à 0.");
    expect(needsZeroConsent({ ...prices, absent: 12 })).toBe(false);
    expect(confirmButtonLabel(prices)).toBe("Compléter mes prix");
    expect(previewFacts(prices).map((fact) => fact.key)).toEqual(["prices", "both", "unknown"]);
    expect(JSON.stringify(previewFacts(prices))).not.toMatch(/rempla|écras/i);
  });
});
