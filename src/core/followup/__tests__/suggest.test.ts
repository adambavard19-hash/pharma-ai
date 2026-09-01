import { describe, expect, it } from "vitest";
import { suggestFollowUp, type SuggestionInput } from "../suggest";

/**
 * Un rappel est un acte d'accompagnement adossé à un fait, jamais une relance
 * commerciale. Ces tests fixent ce que l'officine a le droit de proposer — et
 * surtout quand elle ne propose rien.
 */

const MAINTENANT = new Date("2026-09-01T10:00:00Z");

function entree(overrides: Partial<SuggestionInput> = {}): SuggestionInput {
  return {
    treatmentDurationDays: 6,
    hasConsent: true,
    optedOut: false,
    hasContact: true,
    alreadyScheduled: [],
    now: MAINTENANT,
    ...overrides,
  };
}

describe("proposition automatique de rappel", () => {
  it("propose une fin de cure sur un traitement court, à la bonne date", () => {
    const result = suggestFollowUp(entree({ treatmentDurationDays: 6 }));
    expect(result.suggested).toBe(true);
    if (!result.suggested) return;

    expect(result.suggestion.template.key).toBe("course-end");
    // L'échéance suit la durée réelle du traitement, pas un délai forfaitaire.
    expect(result.suggestion.dueAt.getDate()).toBe(7);
    expect(result.suggestion.reason).toContain("Cure de 6 jours");
  });

  it("propose un renouvellement sur un traitement long", () => {
    // Le signal est la durée PRESCRITE, un fait lu sur l'ordonnance — pas une
    // étiquette « patient chronique », qui serait un profil.
    const result = suggestFollowUp(entree({ treatmentDurationDays: 90 }));
    expect(result.suggested).toBe(true);
    if (!result.suggested) return;
    expect(result.suggestion.template.key).toBe("renewal");
    expect(result.suggestion.reason).toContain("rupture entre deux ordonnances");
  });

  it("ne propose RIEN sans consentement — et dit quoi faire", () => {
    const result = suggestFollowUp(entree({ hasConsent: false }));
    expect(result.suggested).toBe(false);
    if (result.suggested) return;
    expect(result.reason).toContain("Aucun consentement");
    expect(result.reason).toContain("avant de programmer");
  });

  it("une désinscription prime sur un consentement recueilli plus tôt", () => {
    const result = suggestFollowUp(entree({ hasConsent: true, optedOut: true }));
    expect(result.suggested).toBe(false);
    if (result.suggested) return;
    expect(result.reason).toContain("désinscrit");
  });

  it("ne propose rien sans adresse de contact", () => {
    const result = suggestFollowUp(entree({ hasContact: false }));
    expect(result.suggested).toBe(false);
  });

  it("ne propose pas deux fois le même rappel", () => {
    const result = suggestFollowUp(entree({ alreadyScheduled: ["course-end"] }));
    // Il retombe sur le contrôle de tolérance plutôt que de doubler la mise.
    expect(result.suggested).toBe(true);
    if (!result.suggested) return;
    expect(result.suggestion.template.key).toBe("tolerance-check");
  });

  it("ne propose plus rien quand tout est déjà programmé", () => {
    const result = suggestFollowUp(
      entree({ alreadyScheduled: ["course-end", "tolerance-check", "renewal"] }),
    );
    expect(result.suggested).toBe(false);
    if (result.suggested) return;
    expect(result.reason).toContain("déjà programmé");
  });

  it("ne propose rien quand la durée du traitement est inconnue", () => {
    // Sans fait générateur, un rappel serait une relance, pas un suivi.
    const result = suggestFollowUp(entree({ treatmentDurationDays: null }));
    expect(result.suggested).toBe(false);
    if (result.suggested) return;
    expect(result.reason).toContain("n'appelle pas de rappel");
  });

  it("ne traite pas une cure de trois mois comme une cure courte", () => {
    const result = suggestFollowUp(entree({ treatmentDurationDays: 90 }));
    expect(result.suggested).toBe(true);
    if (!result.suggested) return;
    expect(result.suggestion.template.key).not.toBe("course-end");
  });

  it("une durée intermédiaire retombe sur le contrôle de tolérance", () => {
    const result = suggestFollowUp(entree({ treatmentDurationDays: 45 }));
    expect(result.suggested).toBe(true);
    if (!result.suggested) return;
    expect(result.suggestion.template.key).toBe("tolerance-check");
  });

  it("ne propose qu'un seul rappel à la fois", () => {
    const result = suggestFollowUp(entree());
    expect(result.suggested).toBe(true);
    if (!result.suggested) return;
    expect(result.suggestion.template).toBeDefined();
    // Le type ne permet pas d'en renvoyer plusieurs : c'est volontaire.
    expect(Array.isArray(result.suggestion.template)).toBe(false);
  });
});
