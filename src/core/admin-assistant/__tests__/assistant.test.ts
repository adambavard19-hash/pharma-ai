import { describe, expect, it } from "vitest";
import { ASSISTANT_MAX_TURNS, ASSISTANT_TOOLS, assistantDateContext, boundedHistory, looksLikeLookup, safeConsoleHref } from "../assistant";

describe("robot de la console : recherche ou question", () => {
  it("un nom, une ville, un SIRET, un e-mail : recherche instantanée", () => {
    for (const text of ["Port", "Pharmacie du Port", "Marseille", "732 829 320 00074", "marc@port.fr", "PB-7K2QX9"]) expect(looksLikeLookup(text)).toBe(true);
  });
  it("une vraie question part au robot", () => {
    for (const text of ["Qui est en retard de paiement ?", "quelles démos cette semaine", "combien d'officines", "Donne les commissions à payer", "liste des officines inactives depuis deux semaines"]) expect(looksLikeLookup(text)).toBe(false);
  });
});

describe("historique envoyé au modèle", () => {
  it("borné, nettoyé, et commence toujours par une question", () => {
    const turns = Array.from({ length: 30 }, (_, i) => ({ role: (i % 2 ? "assistant" : "user") as "user" | "assistant", text: `t${i}` }));
    const bounded = boundedHistory(turns);
    expect(bounded.length).toBeLessThanOrEqual(ASSISTANT_MAX_TURNS);
    expect(bounded[0].role).toBe("user");
    expect(bounded.at(-1)?.text).toBe("t29");
    expect(boundedHistory([{ role: "assistant", text: "a" }, { role: "user", text: " " }, { role: "user", text: "q" }])).toEqual([{ role: "user", text: "q" }]);
  });
  it("une question trop longue est coupée", () => {
    expect(boundedHistory([{ role: "user", text: "x".repeat(5000) }])[0].text).toHaveLength(1000);
  });
});

describe("liens et outils", () => {
  it("seuls les liens internes de la console sont cliquables", () => {
    expect(safeConsoleHref("/admin/pharmacies/abc?onglet=technique")).toBe("/admin/pharmacies/abc?onglet=technique");
    expect(safeConsoleHref("https://pharmaboost.app/admin/paiements")).toBe("/admin/paiements");
    for (const bad of ["https://evil.example/admin", "javascript:alert(1)", "/stock", "//evil.example/admin", "/admin/../m"]) expect(safeConsoleHref(bad)).toBeNull();
  });
  it("chaque outil est décrit, sans doublon, en lecture seule par son nom", () => {
    const names = ASSISTANT_TOOLS.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
    for (const tool of ASSISTANT_TOOLS) {
      expect(tool.description.length).toBeGreaterThan(40);
      expect(tool.input_schema.additionalProperties).toBe(false);
      expect(tool.name).not.toMatch(/^(envoyer|valider|supprimer|modifier|creer|payer|relancer)/);
    }
  });
  it("la date du jour est donnée à l'heure de Paris", () => {
    expect(assistantDateContext(new Date("2026-10-12T22:30:00Z"))).toContain("mardi 13 octobre 2026");
  });
});
