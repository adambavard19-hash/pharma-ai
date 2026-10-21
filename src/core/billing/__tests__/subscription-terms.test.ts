import { describe, expect, it } from "vitest";
import { buildSubscriptionTerms, SUBSCRIPTION_TERMS_VERSION } from "../subscription-terms";

describe("les conditions d'abonnement acceptées en ligne", () => {
  const terms = buildSubscriptionTerms({ companyName: "PharmaBoost SAS", monthlyPriceCents: 12_600, setupFeeCents: 15_000, commitmentMonths: 12, referralDiscountPercent: 20, contactEmail: "contact@pharmaboost.app" });
  const text = terms.sections.flatMap((s) => s.paragraphs).join("\n");

  it("portent leur version, gardée sur le dossier avec l'heure d'acceptation", () => {
    expect(terms.version).toBe(SUBSCRIPTION_TERMS_VERSION);
  });

  it("disent les montants de l'offre affichée : 126 € HT, 150 € HT, première facture 276 € HT, TVA en sus", () => {
    expect(text).toContain("126 € HT par mois");
    expect(text).toContain("150 € HT");
    expect(text).toContain("la première facture est de 276 € HT");
    expect(text).toContain("TVA");
  });

  it("disent l'engagement, le paiement SEPA ou carte, et le parrainage : un filleul, puis deux (plafond)", () => {
    expect(text).toContain("durée minimale de 12 mois");
    expect(text).toContain("prélèvement SEPA ou par carte bancaire");
    expect(text).toContain("100,80 € HT par mois (20 % de moins)");
    expect(text).toContain("(40 % de moins), jamais davantage");
  });
});
