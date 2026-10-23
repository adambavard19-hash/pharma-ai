import { describe, expect, it } from "vitest";
import { adviceCsv } from "../advice-export";

describe("le fichier des conseils proposés, pour la relecture avec Donna", () => {
  it("une ligne par conseil, lisible dans Excel (« ; », accents), une colonne vide pour l'avis de Donna", () => {
    const csv = adviceCsv(
      [{ at: new Date("2026-10-23T08:30:00Z"), saleReference: "V-0012", who: "Donna B.", boxes: ["DOXYCYCLINE 100 mg", "PARACÉTAMOL"], forDrug: "DOXYCYCLINE 100 mg", product: "Ultra-Levure 200 mg", reason: 'La flore ; « perturbée »', status: "SOLD", priceCents: 890 }],
      "Europe/Paris",
    );
    expect(csv.startsWith("﻿Date;Heure;Vente;Collaborateur")).toBe(true);
    expect(csv).toContain("Avis de Donna");
    expect(csv).toContain('23/10/2026;10:30;V-0012;Donna B.;DOXYCYCLINE 100 mg + PARACÉTAMOL;DOXYCYCLINE 100 mg;Ultra-Levure 200 mg;"La flore ; « perturbée »";Vendu;8,90 €;');
  });
});
