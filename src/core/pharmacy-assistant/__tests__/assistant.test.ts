import { describe, expect, it } from "vitest";
import { clampDays, pharmacySuggestions, pharmacySystemPrompt, pharmacyToolsFor, safeAppHref, type PharmacyViewer } from "../assistant";

const OWNER: PharmacyViewer = { role: "OWNER", manageTeam: true, teamPerformance: true, stock: true };
const TECH: PharmacyViewer = { role: "TECHNICIAN", manageTeam: false, teamPerformance: false, stock: true };
const VIEWER: PharmacyViewer = { role: "VIEWER", manageTeam: false, teamPerformance: false, stock: false };

describe("le robot de l'officine", () => {
  it("ne propose au modèle que les outils permis par le rôle", () => {
    expect(pharmacyToolsFor(OWNER).map((t) => t.name)).toEqual(["ma_journee", "conseils_et_ventes", "challenges", "dates_courtes", "stock_produit", "equipe"]);
    expect(pharmacyToolsFor(TECH).map((t) => t.name)).not.toContain("equipe");
    expect(pharmacyToolsFor(VIEWER).map((t) => t.name)).toEqual(["ma_journee", "conseils_et_ventes", "challenges"]);
  });

  it("aucun outil ne prend d'officine ni de personne en paramètre", () => {
    for (const tool of pharmacyToolsFor(OWNER)) {
      const keys = Object.keys(tool.input_schema.properties);
      expect(keys.some((key) => /officine|pharmacy|user|personne|collaborateur/i.test(key))).toBe(false);
    }
  });

  it("interdit le conseil médical et les données patient dans sa consigne", () => {
    const prompt = pharmacySystemPrompt({ pharmacyName: "Pharmacie du Port", firstName: "Léa", roleLabel: "Préparateur" });
    expect(prompt).toMatch(/AUCUN conseil médical/);
    expect(prompt).toMatch(/Aucune donnée de patient/);
    expect(prompt).toMatch(/DONNÉE/);
  });

  it("ne laisse passer que les liens internes du logiciel", () => {
    expect(safeAppHref("/stock/dates-courtes")).toBe("/stock/dates-courtes");
    expect(safeAppHref("https://pharmaboost.app/equipe")).toBe("/equipe");
    expect(safeAppHref("/admin/pharmacies")).toBeNull();
    expect(safeAppHref("/api/robot/alertes")).toBeNull();
    expect(safeAppHref("https://evil.example/x")).toBeNull();
    expect(safeAppHref("//evil.example")).toBeNull();
    expect(safeAppHref("javascript:alert(1)")).toBeNull();
  });

  it("borne les périodes et adapte les suggestions", () => {
    expect(clampDays(0)).toBe(1);
    expect(clampDays(1000)).toBe(92);
    expect(clampDays("x")).toBe(7);
    expect(pharmacySuggestions(VIEWER)).not.toContain("Qu'est-ce qui périme bientôt ?");
    expect(pharmacySuggestions(OWNER)).toContain("Qui a le meilleur taux ce mois-ci ?");
  });
});
