import { describe, expect, it } from "vitest";
import { COUNTER_SHEET_LIMITS, readCounterSheet, withoutOriginLabel } from "../counter-sheet";
import { buildHostEntry, encodeCommand, type NoticeBody } from "../notice-center";

/** La carte déployée voyage du serveur à l'île du poste : bornée, relue, et en ASCII pour la fenêtre Windows. */

const SHEET = {
  name: "CRÈME HYDRATANTE ÉMOLLIENTE",
  reasons: ["Sécheresse cutanée fréquente sous isotrétinoïne."],
  script: "Appliquez-la matin et soir.",
  contraindications: [{ text: "Hypersensibilité", patient: "UNKNOWN" }],
  usage: [{ text: "Éviter le contour de l'œil." }],
  description: "",
  more: { contraindications: 0, usage: 0 },
  cut: false,
};

const body = (sheet: unknown): NoticeBody => ({
  ok: true,
  state: "READY",
  title: "PharmaBoost · ORD-0100",
  subject: "CURACNÉ 20 mg",
  alerts: [],
  advice: ["CRÈME"],
  signature: "s",
  detectedLabel: "Médicament détecté",
  items: [{ id: "rec_1", drug: "CURACNÉ", challenge: null, shortDateOn: null, outcome: "NONE", name: "CRÈME", priceCents: 990, reason: "Peau sèche", availability: "IN_STOCK", quantity: 3, imageUrl: null, sheet }],
});

describe("la fiche envoyée à l'île du poste", () => {
  it("les accents passent : la commande est en ASCII seul, et l'île relit exactement les mêmes mots", () => {
    const entry = buildHostEntry({ prescriptionId: "rx_1", serverUrl: "https://pharmaboost.app/", body: body(SHEET) });
    const line = encodeCommand({ op: "show", entry });
    expect(/^[\x00-\x7f]*$/.test(line)).toBe(true);
    expect(line).toContain("CR\\u00c8ME HYDRATANTE \\u00c9MOLLIENTE");
    const back = JSON.parse(line) as { entry: typeof entry };
    expect(back.entry.items[0].sheet?.name).toBe("CRÈME HYDRATANTE ÉMOLLIENTE");
    expect(back.entry.items[0].sheet?.usage[0].text).toBe("Éviter le contour de l'œil.");
    expect(readCounterSheet(back.entry.items[0].sheet)).toEqual(back.entry.items[0].sheet);
  });

  it("sans fiche (serveur ancien) ou fiche abîmée : pas de clé `sheet`, la commande reste comme avant", () => {
    expect("sheet" in buildHostEntry({ prescriptionId: "rx_1", serverUrl: "https://pharmaboost.app/", body: body(undefined) }).items[0]).toBe(false);
    expect("sheet" in buildHostEntry({ prescriptionId: "rx_1", serverUrl: "https://pharmaboost.app/", body: body("abîmé") }).items[0]).toBe(false);
  });

  it("charge bornée : textes abrégés (et dit), lignes comptées au-delà de la limite", () => {
    const big = readCounterSheet({ ...SHEET, script: "mot ".repeat(400), usage: Array.from({ length: 10 }, (_, i) => ({ text: `Ligne ${i}` })) })!;
    expect(big.script.length).toBeLessThanOrEqual(COUNTER_SHEET_LIMITS.script);
    expect(big.cut).toBe(true);
    expect(big.usage).toHaveLength(COUNTER_SHEET_LIMITS.lines);
    expect(big.more.usage).toBe(4);
  });
});

describe("l'origine du conseil ne se dit pas", () => {
  it("le libellé du robot et la phrase interne disparaissent ; un texte ordinaire reste intact", () => {
    expect(withoutOriginLabel("Suggestion du robot — à confirmer par la pharmacienne · Hydrater la peau")).toBe("Hydrater la peau");
    expect(withoutOriginLabel("Suggestion du robot — Hydratation")).toBe("Hydratation");
    expect(withoutOriginLabel("Aucune règle écrite pour ce médicament : produit choisi par le modèle dans une liste fermée.")).toBe("");
    expect(withoutOriginLabel("Avis à confirmer par le pharmacien si grossesse.")).toBe("Avis à confirmer par le pharmacien si grossesse.");
    expect(withoutOriginLabel(null)).toBeNull();
  });
});

describe("les effets indésirables et l'équipe, de la réponse du serveur à l'île", () => {
  it("garde les effets indésirables officiels, bornés en nombre et en longueur", () => {
    const sheet = readCounterSheet({ ...SHEET, sideEffects: ["Nausées", "", "x".repeat(200), "a", "b", "c", "d", "e"] });
    expect(sheet?.sideEffects?.length).toBe(COUNTER_SHEET_LIMITS.sideEffects);
    expect(sheet?.sideEffects?.[0]).toBe("Nausées");
    expect(sheet?.sideEffects?.[1].length).toBeLessThanOrEqual(COUNTER_SHEET_LIMITS.sideEffect);
    expect(readCounterSheet(SHEET)?.sideEffects).toBeUndefined();
  });

  it("passe l'équipe relue à l'île : identifiants sûrs, douze au plus, personne du comptoir seulement si elle en est", () => {
    const team = [{ id: "u1", name: "Donna B." }, { id: "../x", name: "Pirate" }, { id: "u2", name: "" }, ...Array.from({ length: 20 }, (_, i) => ({ id: `m${i}`, name: `Membre ${i}` }))];
    const entry = buildHostEntry({ prescriptionId: "rx_1", serverUrl: "https://pharmaboost.app", body: { ...body(SHEET), team, servedBy: "u1" } });
    expect(entry.team?.[0]).toEqual({ id: "u1", name: "Donna B." });
    expect(entry.team?.some((member) => member.id === "../x" || member.id === "u2")).toBe(false);
    expect(entry.team?.length).toBe(12);
    expect(entry.servedBy).toBe("u1");
    expect(buildHostEntry({ prescriptionId: "rx_1", serverUrl: "https://pharmaboost.app", body: { ...body(SHEET), team, servedBy: "inconnu" } }).servedBy).toBeUndefined();
    expect(buildHostEntry({ prescriptionId: "rx_1", serverUrl: "https://pharmaboost.app", body: body(SHEET) }).team).toBeUndefined();
  });
});


describe("les autres possibilités en stock (19 oct. 2026)", () => {
  it("deux au plus, nom borné, prix, marge et stock vérifiés ; une entrée sans nom est écartée", () => {
    const sheet = readCounterSheet({
      name: "LACTIBIANE IMEDIA",
      alternatives: [
        { name: "LACTIBIANE REFERENCE STICK 20", price: "18,90 €", margin: "7,90 €", stock: "IN_STOCK", quantity: 4 },
        { name: "", price: "1 €" },
        { name: "BION 3 AD DEFENSE", stock: "PAS UN STOCK", quantity: -1 },
        { name: "TROISIÈME" },
      ],
    });
    expect(sheet?.alternatives).toEqual([
      { name: "LACTIBIANE REFERENCE STICK 20", price: "18,90 €", margin: "7,90 €", stock: "IN_STOCK", quantity: 4 },
      { name: "BION 3 AD DEFENSE" },
    ]);
    expect(readCounterSheet({ name: "X" })).not.toHaveProperty("alternatives");
  });
});
