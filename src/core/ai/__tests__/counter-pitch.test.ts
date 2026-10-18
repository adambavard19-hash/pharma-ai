import { describe, expect, it } from "vitest";
import { validatePitch } from "../counter-pitch";
import { readCounterSheet } from "../../../../agent/src/counter-sheet";

const BASE = {
  ask: ["Votre peau tire-t-elle", "Utilisez-vous déjà une crème ?"],
  pitch: "Ce traitement assèche la peau. Appliquez ce baume matin et soir.",
};
const CANDIDATES = [{ ean: "3337875930239", name: "LIPIKAR BAUME AP+M 400ML" }];

describe("le conseil prêt à dire au comptoir", () => {
  it("garde deux questions, ajoute le point d'interrogation, et des réponses complètes", () => {
    const { pitch } = validatePitch({
      ...BASE,
      answers: [
        { question: 1, label: "Oui, ça tire", say: "On garde ce baume, matin et soir.", ean: null },
        { question: 1, label: "Très sèche", say: "Je vous propose plutôt le baume plus riche.", ean: "3337875930239" },
        { question: 2, label: "Non", say: "Ce baume suffira.", ean: null },
        { question: 2, label: "Oui", say: "Gardez-la, ajoutez ce baume le soir.", ean: null },
      ],
    }, CANDIDATES);
    expect(pitch?.ask[0]).toBe("Votre peau tire-t-elle ?");
    expect(pitch?.answers).toHaveLength(4);
    expect(pitch?.answers[1]).toMatchObject({ ask: 0, ean: "3337875930239" });
  });

  it("n'accepte jamais un produit hors de la liste du stock : la réponse reste, sans produit", () => {
    const { pitch } = validatePitch({
      ...BASE,
      answers: [
        { question: 1, label: "Oui", say: "Prenez plutôt celui-ci.", ean: "9999999999999" },
        { question: 1, label: "Non", say: "On garde.", ean: null },
        { question: 2, label: "Oui", say: "Bien.", ean: null },
        { question: 2, label: "Non", say: "Bien.", ean: null },
      ],
    }, CANDIDATES);
    expect(pitch?.answers[0].ean).toBeNull();
  });

  it("écarte des réponses incomplètes (une question sans deux réponses) mais garde les questions", () => {
    const { pitch, problems } = validatePitch({ ...BASE, answers: [{ question: 1, label: "Oui", say: "Bien.", ean: null }] }, CANDIDATES);
    expect(pitch?.ask).toHaveLength(2);
    expect(pitch?.answers).toEqual([]);
    expect(problems).toContain("réponses incomplètes");
  });

  it("refuse une promesse de guérison", () => {
    expect(validatePitch({ ...BASE, pitch: "Ce baume guérit tout." }).pitch).toBeNull();
  });

  it("la fiche de la bannière relit et borne les réponses (question inconnue écartée, stock vérifié)", () => {
    const sheet = readCounterSheet({
      name: "X", reasons: [], script: "", contraindications: [], usage: [], description: "", more: { contraindications: 0, usage: 0 }, cut: false,
      ask: ["Q1 ?", "Q2 ?"],
      answers: [
        { ask: 0, label: "Oui", say: "Proposez le baume.", product: { name: "BAUME", price: "9,95 €", stock: "IN_STOCK", quantity: 4 } },
        { ask: 5, label: "?", say: "hors question" },
        { ask: 1, label: "Non", say: "Bien.", product: { name: "Y", stock: "PEUT-ÊTRE" } },
      ],
    });
    expect(sheet?.answers).toHaveLength(2);
    expect(sheet?.answers?.[0].product).toEqual({ name: "BAUME", price: "9,95 €", stock: "IN_STOCK", quantity: 4 });
    expect(sheet?.answers?.[1].product).toEqual({ name: "Y" });
  });
});
