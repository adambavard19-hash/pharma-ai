import { describe, expect, it } from "vitest";
import { adminHome, directorHome, officineHome, salesHome } from "../home";

describe("l'accueil de l'île", () => {
  it("officine : chiffres du jour, challenge, poste ; un poste hors ligne met l'île en attention", () => {
    const home = officineHome({ scanned: 3, accepted: 2, salesCount: 1, attributedCents: 1490, counter: { label: "Comptoir 1", online: false }, challenge: { title: "Solaires", teamUnits: 34, target: 50, toNext: 2 }, shortDates: 4, lastSale: { title: "Ordonnance 0775", when: "14:32", stage: "Conseils", href: "/vente/x" } });
    expect(home.headline).toBe("3 ventes aujourd'hui");
    expect(home.attention).toBe(true);
    expect(home.pills.map((p) => p.value)).toEqual(["2 conseils · 1 vente", "34 / 50", "Hors ligne"]);
    expect(home.rows[0]).toMatchObject({ title: "Ordonnance 0775", href: "/vente/x" });
  });

  it("officine neuve : rien d'inventé", () => {
    const home = officineHome({ scanned: 0, accepted: 0, salesCount: 0, attributedCents: 0, counter: null, challenge: null, shortDates: null, lastSale: null });
    expect(home).toMatchObject({ headline: "En attente de scan…", attention: false, rows: [] });
    expect(home.pills).toHaveLength(1);
  });

  it("console : les impayés passent en premier et en ambre", () => {
    const home = adminHome({ activePharmacies: 5, mrrCents: 63000, paymentsLate: 1, supportToAnswer: 2, setupsToDo: 0, demosToday: 1, demosWeek: 2, newProspects7d: 0, postsOffline: 0, contractsToCountersign: 0, gapsOpen: 0, today: [] });
    expect(home.rows[0]).toMatchObject({ key: "impayes", tone: "warning", href: "/admin/paiements" });
    expect(home.attention).toBe(true);
    expect(home.headline).toBe("2 choses à voir");
    expect(home.pills[0].value).toBe("630 €");
  });

  it("direction et extranet : seulement ce qui est à faire", () => {
    const director = directorHome({ opened: 2, demos: 0, activated: 0, activeReps: 2, applicationsToReview: 0, unassignedProspects: 0, commissionsToValidate: { count: 0, amountCents: 0 }, invoicesToValidate: { count: 1, amountCents: 30000 }, periodLabel: "Ce mois" });
    expect(director.rows.map((r) => r.key)).toEqual(["factures"]);
    const sales = salesHome({ openProspects: 3, activated: 1, commissionEarnedCents: 30000, commissionPendingCents: 0, demosUpcoming: [], tasksDue: [] });
    expect(sales.headline).toBe("Belle journée de prospection");
  });
});
