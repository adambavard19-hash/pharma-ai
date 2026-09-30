import { describe, expect, it } from "vitest";
import { serializeToast } from "../toast";

describe("le fichier lu par la fenêtre d'avis", () => {
  it("met un préfixe par ligne et aplatit les retours à la ligne", () => {
    const text = serializeToast({ title: "PharmaBoost · ORD-0021", subject: "DOLIPRANE 1000 mg", alerts: ["Ligne\nillisible"], advice: ["VITAMINE C · 8,90 €"], url: "https://pharmaboost.app/vente/x", seconds: 15 });
    expect(text.split("\r\n")).toEqual(["TPharmaBoost · ORD-0021", "SDOLIPRANE 1000 mg", "Uhttps://pharmaboost.app/vente/x", "D15", "!Ligne illisible", "+VITAMINE C · 8,90 €", ""]);
  });
  it("borne la durée entre 4 et 60 secondes", () => {
    expect(serializeToast({ title: "t", subject: "", alerts: [], advice: [], url: "", seconds: 1 })).toContain("D4\r\n");
    expect(serializeToast({ title: "t", subject: "", alerts: [], advice: [], url: "", seconds: 999 })).toContain("D60\r\n");
  });
});
