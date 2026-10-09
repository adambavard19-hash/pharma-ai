import { describe, expect, it } from "vitest";
import { buildMonthlyReport, describeResults, summariseCounterResults, type ClosedCounterSale, type SoldAdvice } from "../results";

const sale = (over: Partial<ClosedCounterSale> = {}): ClosedCounterSale => ({ post: "Comptoir 1", proposed: 3, sold: 1, notSold: 1, unanswered: 1, emailSaved: false, report: null, ...over });
const sold = (over: Partial<SoldAdvice> = {}): SoldAdvice => ({ post: "Comptoir 1", product: "ELUDAY GENCIVE", challenge: null, shortDateOn: null, ...over });

describe("les résultats du comptoir", () => {
  it("additionne les ventes terminées : proposés, vendus, non vendus, sans réponse", () => {
    const results = summariseCounterResults({ sales: [sale(), sale({ proposed: 2, sold: 2, notSold: 0, unanswered: 0 })], soldAdvice: [] });
    expect(results).toMatchObject({ salesClosed: 2, proposed: 5, sold: 3, notSold: 1, unanswered: 1 });
  });

  it("le taux ne compte que les conseils auxquels l'équipe a répondu, et n'existe pas sans réponse", () => {
    expect(summariseCounterResults({ sales: [sale({ sold: 3, notSold: 1, unanswered: 0, proposed: 4 })], soldAdvice: [] }).conversionRate).toBe(0.75);
    expect(summariseCounterResults({ sales: [sale({ sold: 0, notSold: 0, unanswered: 3 })], soldAdvice: [] }).conversionRate).toBeNull();
    expect(summariseCounterResults({ sales: [], soldAdvice: [] })).toMatchObject({ salesClosed: 0, conversionRate: null, byPost: [], products: [] });
  });

  it("détaille par poste de caisse, le plus actif en premier, sans deviner de collaborateur", () => {
    const results = summariseCounterResults({ sales: [sale({ post: "Comptoir 2", sold: 1 }), sale({ post: "Comptoir 1", sold: 3, proposed: 5 }), sale({ post: "Comptoir 2", sold: 1 })], soldAdvice: [] });
    expect(results.byPost.map((post) => [post.post, post.sales, post.sold])).toEqual([["Comptoir 1", 1, 3], ["Comptoir 2", 2, 2]]);
  });

  it("classe les produits vendus, compte les challenges et les dates courtes réels", () => {
    const results = summariseCounterResults({
      sales: [sale()],
      soldAdvice: [sold(), sold(), sold({ product: "PROBIOTIQUE", challenge: "Challenge probiotiques" }), sold({ product: "SÉRUM", shortDateOn: "2026-11-30" }), sold({ product: "PROBIOTIQUE", challenge: "Challenge probiotiques", shortDateOn: "2026-12-05" })],
    });
    expect(results.products).toEqual([{ name: "ELUDAY GENCIVE", sold: 2 }, { name: "PROBIOTIQUE", sold: 2 }, { name: "SÉRUM", sold: 1 }]);
    expect(results.challengeSold).toBe(2);
    expect(results.challenges).toEqual([{ title: "Challenge probiotiques", sold: 2 }]);
    expect(results.shortDateSold).toBe(2);
  });

  it("compte les adresses recueillies et les bilans réellement envoyés (pas les essais ni les échecs)", () => {
    const results = summariseCounterResults({ sales: [sale({ emailSaved: true, report: "SENT" }), sale({ emailSaved: true, report: "FAILED" }), sale({ emailSaved: true, report: "SIMULATED" }), sale()], soldAdvice: [] });
    expect(results).toMatchObject({ emailsSaved: 3, reportsSent: 1 });
  });

  it("ne garde que les huit produits en tête", () => {
    const many = Array.from({ length: 12 }, (_, index) => sold({ product: `Produit ${String(index).padStart(2, "0")}` }));
    expect(summariseCounterResults({ sales: [sale()], soldAdvice: many }).products).toHaveLength(8);
  });
});

describe("le rapport mensuel du titulaire", () => {
  const results = summariseCounterResults({ sales: [sale({ post: "Comptoir 1", sold: 2, notSold: 1, unanswered: 0, proposed: 3 })], soldAdvice: [sold({ challenge: "Challenge Avène" }), sold({ product: "SÉRUM", shortDateOn: "2026-11-30" })] });
  const mail = (over = {}) => buildMonthlyReport({ pharmacyName: "Pharmacie du Port", monthLabel: "septembre 2026", results, resultsUrl: "https://pharmaboost.app/resultats?periode=month", ...over });

  it("résume le mois avec des phrases vraies, sans aucune donnée de patient", () => {
    const report = mail();
    expect(report?.subject).toBe("Votre bilan du comptoir — septembre 2026");
    expect(report?.text).toContain("1 vente terminée");
    expect(report?.text).toContain("3 conseils proposés · 2 déclarés vendus · 1 non vendu · 0 sans réponse.");
    expect(report?.text).toContain("67 % des conseils auxquels l'équipe a répondu ont été vendus.");
    expect(report?.text).toContain("1 vente dans un challenge laboratoire en cours.");
    expect(report?.text).toContain("ce ne sont pas des ventes lues dans votre logiciel de gestion");
    expect(report?.text).toContain("https://pharmaboost.app/resultats?periode=month");
  });

  it("n'envoie rien quand le mois n'a aucune vente terminée", () => {
    expect(mail({ results: summariseCounterResults({ sales: [], soldAdvice: [] }) })).toBeNull();
  });

  it("protège le HTML", () => {
    const report = mail({ pharmacyName: "Pharmacie <script>x</script>" });
    expect(report?.html).not.toContain("<script>");
  });

  it("décrit sans pourcentage ni challenge quand il n'y a rien à dire", () => {
    const lines = describeResults(summariseCounterResults({ sales: [sale({ sold: 0, notSold: 0, unanswered: 3 })], soldAdvice: [] }));
    expect(lines.join(" ")).not.toContain("%");
    expect(lines.join(" ")).not.toContain("challenge");
  });
});
