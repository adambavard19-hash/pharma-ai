import { describe, expect, it } from "vitest";
import { confirmationMatches, isTombstoneEmail, normalizeConfirmation, pharmacyDeletionBlockers, tombstoneEmail, userDeletionBlockers } from "../deletion";

describe("le nom retapé pour confirmer", () => {
  it("ne tient compte ni de la casse, ni des accents, ni des espaces en trop", () => {
    expect(normalizeConfirmation("  Pharmacie   de l'Étoile ")).toBe("pharmacie de l'etoile");
    expect(confirmationMatches("Pharmacie de l'Étoile", "pharmacie de l'etoile")).toBe(true);
    expect(confirmationMatches("SUPPRIMER", "supprimer")).toBe(true);
  });

  it("refuse un autre nom, un nom incomplet et le vide", () => {
    expect(confirmationMatches("Pharmacie de la Gare", "Pharmacie de la")).toBe(false);
    expect(confirmationMatches("Pharmacie de la Gare", "Pharmacie du Port")).toBe(false);
    expect(confirmationMatches("Pharmacie de la Gare", "")).toBe(false);
    expect(confirmationMatches("", "")).toBe(false);
    expect(confirmationMatches("   ", "   ")).toBe(false);
  });
});

describe("l'adresse d'un compte supprimé", () => {
  it("libère l'adresse d'origine, reste unique et ne permet aucune connexion", () => {
    const email = tombstoneEmail("cmABC123");
    expect(email).toBe("supprime-cmabc123@suppression.pharmaboost.invalid");
    expect(isTombstoneEmail(email)).toBe(true);
    expect(tombstoneEmail("a")).not.toBe(tombstoneEmail("b"));
    expect(isTombstoneEmail("camille@pharmacie.fr")).toBe(false);
  });
});

describe("ce qui interdit de supprimer une officine", () => {
  const none = { isCommercialDemo: false, subscription: null, paymentCount: 0 };

  it("une officine d'essai, sans abonnement ni paiement, se supprime", () => {
    expect(pharmacyDeletionBlockers(none)).toEqual([]);
    expect(pharmacyDeletionBlockers({ ...none, subscription: { status: "TRIALING", stripeSubscriptionId: null } })).toEqual([]);
  });

  it("l'officine de démonstration commerciale ne se supprime pas à la main", () => {
    expect(pharmacyDeletionBlockers({ ...none, isCommercialDemo: true }).map((b) => b.code)).toEqual(["COMMERCIAL_DEMO"]);
  });

  it("un abonnement encore en cours chez Stripe interdit : le client continuerait d'être prélevé", () => {
    for (const status of ["ACTIVE", "TRIALING", "PAST_DUE", "UNPAID", "PAUSED", "SUSPENDED", "INCOMPLETE"]) {
      const blockers = pharmacyDeletionBlockers({ ...none, subscription: { status, stripeSubscriptionId: "sub_123" } });
      expect(blockers.map((b) => b.code), status).toEqual(["LIVE_SUBSCRIPTION"]);
      expect(blockers[0].message).toMatch(/Résiliez/);
    }
  });

  it("un abonnement terminé n'interdit plus rien", () => {
    expect(pharmacyDeletionBlockers({ ...none, subscription: { status: "CANCELED", stripeSubscriptionId: "sub_123" } })).toEqual([]);
    expect(pharmacyDeletionBlockers({ ...none, subscription: { status: "INCOMPLETE_EXPIRED", stripeSubscriptionId: "sub_123" } })).toEqual([]);
  });

  it("des paiements enregistrés interdisent : la facturation se conserve", () => {
    const [one] = pharmacyDeletionBlockers({ ...none, paymentCount: 1 });
    expect(one.code).toBe("PAYMENTS");
    expect(one.message).toMatch(/1 paiement est enregistré/);
    expect(pharmacyDeletionBlockers({ ...none, paymentCount: 7 })[0].message).toMatch(/7 paiements sont enregistrés/);
  });

  it("plusieurs obstacles se disent tous", () => {
    const codes = pharmacyDeletionBlockers({ isCommercialDemo: false, subscription: { status: "ACTIVE", stripeSubscriptionId: "sub_1" }, paymentCount: 3 }).map((b) => b.code);
    expect(codes).toEqual(["LIVE_SUBSCRIPTION", "PAYMENTS"]);
  });
});

describe("ce qui interdit de supprimer un compte", () => {
  it("le seul titulaire d'une officine ne se supprime pas, et la raison cite l'officine", () => {
    const blockers = userDeletionBlockers({ userName: "Adam Bavard", ownerships: [{ pharmacyName: "Pharmacie du Port", otherActiveOwners: 0 }] });
    expect(blockers).toHaveLength(1);
    expect(blockers[0].message).toMatch(/Adam Bavard est le seul titulaire de « Pharmacie du Port »/);
  });

  it("un titulaire qui n'est pas seul se supprime", () => {
    expect(userDeletionBlockers({ userName: "A B", ownerships: [{ pharmacyName: "P", otherActiveOwners: 1 }] })).toEqual([]);
    expect(userDeletionBlockers({ userName: "A B", ownerships: [] })).toEqual([]);
  });

  it("chaque officine dont il est le seul titulaire est citée", () => {
    const blockers = userDeletionBlockers({ userName: "A B", ownerships: [{ pharmacyName: "P1", otherActiveOwners: 0 }, { pharmacyName: "P2", otherActiveOwners: 2 }, { pharmacyName: "P3", otherActiveOwners: 0 }] });
    expect(blockers.map((b) => b.message.match(/« (.+?) »/)?.[1])).toEqual(["P1", "P3"]);
  });
});
