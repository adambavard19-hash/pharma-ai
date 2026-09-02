import { describe, expect, it } from "vitest";
import { COUNTER_SENTENCE_MAX, counterSentence } from "../sentence";

/**
 * La carte de conseil a droit à une phrase. Ces tests fixent laquelle — et
 * garantissent qu'un texte raccourci le dit toujours.
 */

describe("la phrase du comptoir", () => {
  it("préfère la phrase écrite pour le comptoir", () => {
    const result = counterSentence({
      shortReason: "Antibiothérapie : la flore intestinale peut être perturbée pendant la cure.",
      rationale: "Une antibiothérapie peut perturber la flore. Un accompagnement peut être utile.",
    });
    expect(result?.sentence).toBe(
      "Antibiothérapie : la flore intestinale peut être perturbée pendant la cure.",
    );
    expect(result?.shortened).toBe(false);
  });

  it("ne garde que la première phrase du texte long, et le signale", () => {
    // Le cas réel : deux tiers des recommandations n'ont pas de phrase courte
    // et affichaient donc un paragraphe entier sur la carte.
    const result = counterSentence({
      shortReason: null,
      rationale:
        "Une antibiothérapie (KARDEGIC 300 mg, poudre pour solution buvable) peut perturber la flore intestinale. Un accompagnement de la tolérance digestive peut être pertinent selon le patient.",
    });
    expect(result?.sentence).toBe(
      "Une antibiothérapie (KARDEGIC 300 mg, poudre pour solution buvable) peut perturber la flore intestinale.",
    );
    expect(result?.shortened).toBe(true);
    expect(result?.sentence).not.toMatch(/accompagnement/);
  });

  it("ne coupe pas sur une abréviation ou une unité", () => {
    const result = counterSentence({
      shortReason: null,
      rationale:
        "Le traitement prescrit par le Dr. Mercier comporte 300 mg. par prise, ce qui appelle une vigilance particulière sur la tolérance.",
    });
    // Aucun de ces points ne termine une phrase : le texte reste entier.
    expect(result?.sentence).toContain("Dr. Mercier");
    expect(result?.sentence).toContain("300 mg.");
  });

  it("coupe au mot près quand la phrase dépasse encore, et le dit", () => {
    const longue = `${"Accompagnement de la tolérance digestive pendant une antibiothérapie prolongée ".repeat(3)}fin.`;
    const result = counterSentence({ shortReason: longue, rationale: null });
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.sentence.length).toBeLessThanOrEqual(COUNTER_SENTENCE_MAX + 1);
    expect(result.sentence.endsWith("…")).toBe(true);
    expect(result.shortened).toBe(true);
    // Jamais au milieu d'un mot : ce qui est gardé est un préfixe du texte
    // d'origine, et le caractère suivant dans l'original est une espace.
    const garde = result.sentence.slice(0, -1);
    expect(longue.startsWith(garde)).toBe(true);
    expect(longue[garde.length]).toBe(" ");
  });

  it("ne signale pas un raccourci quand il n'y en a pas", () => {
    const result = counterSentence({
      shortReason: null,
      rationale: "Une seule phrase, complète et suffisamment courte pour le comptoir.",
    });
    expect(result?.shortened).toBe(false);
  });

  it("ne renvoie rien plutôt qu'une phrase vide", () => {
    expect(counterSentence({ shortReason: null, rationale: null })).toBeNull();
    expect(counterSentence({ shortReason: "   ", rationale: "" })).toBeNull();
    expect(counterSentence({ shortReason: undefined, rationale: undefined })).toBeNull();
  });

  it("ne réécrit jamais le texte qu'elle garde", () => {
    // Aucune reformulation : ce qui est affiché a été produit par le moteur.
    const texte = "Supplémentation martiale : absorption et tolérance digestive à surveiller.";
    expect(counterSentence({ shortReason: texte, rationale: null })?.sentence).toBe(texte);
  });
});
