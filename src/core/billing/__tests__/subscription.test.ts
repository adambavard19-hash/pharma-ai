import { describe, expect, it } from "vitest";
import {
  contractStage,
  monthlyRecurringRevenueCents,
  normalizePlanCode,
  subscriptionGrantsAccess,
  subscriptionStage,
  subscriptionStatusFromStripe,
  trialEndDate,
  trialEndingSoon,
  trialSentence,
} from "../subscription";

describe("abonnement — statuts", () => {
  it("traduit les statuts Stripe sans en inventer", () => {
    expect(subscriptionStatusFromStripe("trialing")).toBe("TRIALING");
    expect(subscriptionStatusFromStripe("past_due")).toBe("PAST_DUE");
    expect(subscriptionStatusFromStripe("incomplete_expired")).toBe("INCOMPLETE_EXPIRED");
    expect(subscriptionStatusFromStripe("something_new", "ACTIVE")).toBe("ACTIVE");
  });

  it("ouvre l'accès en essai, actif, paiement en retard ; le ferme sinon", () => {
    expect(subscriptionGrantsAccess("TRIALING")).toBe(true);
    expect(subscriptionGrantsAccess("PAST_DUE")).toBe(true);
    expect(subscriptionGrantsAccess("CANCELED")).toBe(false);
    expect(subscriptionGrantsAccess("SUSPENDED")).toBe(false);
    expect(subscriptionGrantsAccess("PAUSED")).toBe(false);
  });

  it("résume l'étape pour l'administrateur", () => {
    expect(subscriptionStage({ status: null, inviteSentAt: null, suspendedAt: null }).label).toBe("À inviter");
    expect(subscriptionStage({ status: null, inviteSentAt: new Date(), suspendedAt: null }).label).toBe("Invitation envoyée");
    expect(subscriptionStage({ status: "TRIALING", inviteSentAt: new Date(), suspendedAt: null }).label).toBe("Essai gratuit");
    expect(subscriptionStage({ status: "ACTIVE", inviteSentAt: null, suspendedAt: new Date() }).label).toBe("Suspendu");
    expect(contractStage({ status: null }).label).toBe("À préparer");
    expect(contractStage({ status: "SENT" }).label).toBe("Envoyé");
    expect(contractStage({ status: "FINALIZED" }).label).toBe("Signé");
  });
});

describe("abonnement — essai et tarif", () => {
  it("écrit la phrase du premier mois offert avec la date de premier prélèvement", () => {
    const start = new Date("2026-09-18T10:00:00.000Z");
    const end = trialEndDate(start, 30);
    expect(end.toISOString()).toBe("2026-10-18T10:00:00.000Z");
    expect(trialSentence({ monthlyPriceCents: 12900, trialDays: 30, trialEndsAt: end })).toBe("Premier mois offert, puis 129 €/mois à partir du 18/10/2026. Aucun débit pendant la période gratuite.");
    expect(trialSentence({ monthlyPriceCents: 9950, trialDays: 14, trialEndsAt: trialEndDate(start, 14) })).toContain("14 jours offerts, puis 99,50 €/mois");
    expect(trialSentence({ monthlyPriceCents: 12900, trialDays: 0, trialEndsAt: start })).toContain("à compter d'aujourd'hui");
  });

  it("calcule le MRR sur les abonnements qui rapportent, pas sur les résiliés", () => {
    expect(
      monthlyRecurringRevenueCents([
        { status: "ACTIVE", monthlyPriceCents: 12900, cancelAtPeriodEnd: false },
        { status: "TRIALING", monthlyPriceCents: 12900, cancelAtPeriodEnd: false },
        { status: "ACTIVE", monthlyPriceCents: 12900, cancelAtPeriodEnd: true },
        { status: "CANCELED", monthlyPriceCents: 12900, cancelAtPeriodEnd: false },
        { status: "UNPAID", monthlyPriceCents: 12900, cancelAtPeriodEnd: false },
      ]),
    ).toBe(25800);
  });

  it("repère un essai qui se termine dans la semaine", () => {
    const now = new Date("2026-09-18T00:00:00.000Z");
    expect(trialEndingSoon(new Date("2026-09-22T00:00:00.000Z"), now)).toBe(true);
    expect(trialEndingSoon(new Date("2026-10-22T00:00:00.000Z"), now)).toBe(false);
    expect(trialEndingSoon(new Date("2026-09-10T00:00:00.000Z"), now)).toBe(false);
    expect(trialEndingSoon(null, now)).toBe(false);
  });

  it("normalise un code d'offre", () => {
    expect(normalizePlanCode("PharmaBoost")).toBe("PHARMABOOST");
    expect(normalizePlanCode("Offre été 2026 !")).toBe("OFFRE_ETE_2026");
  });
});
