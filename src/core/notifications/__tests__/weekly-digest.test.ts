import { describe, expect, it } from "vitest";
import { buildWeeklyDigest, digestHasContent, trendLabel, type WeekMetric, type WeeklyDigestInput } from "../weekly-digest";

const ctx = { baseUrl: "https://pharmaboost.app", company: { legalName: "PharmaBoost", contactEmail: "contact@pharmaboost.app" } };
const metric = (value: number, previous: number, deltaPct: number | null, trend: WeekMetric["trend"]): WeekMetric => ({ value, previous, deltaPct, trend });
const base = (over: Partial<WeeklyDigestInput> = {}): WeeklyDigestInput => ({
  pharmacyName: "Pharmacie du Port",
  firstName: "Anne",
  weekLabel: "du 5 au 11 octobre",
  advice: { proposed: metric(42, 30, 40, "up"), purchased: metric(11, 12, -8.3, "down"), revenueTtcCents: metric(18950, 0, null, "up") },
  challenges: [{ title: "Challenge NATURÉO", endsLabel: "jusqu'au 31 oct." }],
  stock: { out: 2, low: 5, outNames: ["Échinacée", "Pastilles gorge"] },
  links: { results: "https://pharmaboost.app/resultats", stock: "https://pharmaboost.app/stock", challenges: "https://pharmaboost.app/challenges", unsubscribe: "https://pharmaboost.app/resume-hebdo?t=abc" },
  ...over,
});

describe("le résumé de la semaine du titulaire", () => {
  it("les chiffres de la semaine, leur évolution, les challenges et le stock à surveiller", () => {
    const mail = buildWeeklyDigest(base(), ctx)!;
    expect(mail.subject).toBe("Votre bilan de la semaine — Pharmacie du Port");
    expect(mail.text).toContain("conseils proposés : 42 (+40 % vs semaine d'avant)");
    expect(mail.text).toContain("conseils vendus : 11 (−8 % vs semaine d'avant)");
    expect(mail.text).toContain("de chiffre d'affaires ajouté (TTC) : 190 € (nouveau cette semaine)");
    expect(mail.text).toContain("Challenge NATURÉO — jusqu'au 31 oct.");
    expect(mail.text).toContain("2 produits en rupture");
    expect(mail.text).toContain("En rupture : Échinacée, Pastilles gorge");
    expect(mail.text).toContain("Ne plus recevoir ce résumé : https://pharmaboost.app/resume-hebdo?t=abc");
    expect(mail.html).toContain("Bonjour Anne,");
  });

  it("une semaine sans rien à dire n'envoie rien", () => {
    const empty = { advice: { proposed: metric(0, 0, null, "none"), purchased: metric(0, 0, null, "none"), revenueTtcCents: metric(0, 0, null, "none") }, challenges: [], stock: { out: 0, low: 0, outNames: [] } };
    expect(digestHasContent(empty)).toBe(false);
    expect(buildWeeklyDigest(base(empty), ctx)).toBeNull();
  });

  it("sans conseil mais avec du stock à surveiller : le dit, sans inventer de chiffre", () => {
    const mail = buildWeeklyDigest(base({ advice: null, challenges: [] }), ctx)!;
    expect(mail.text).toContain("Aucun conseil n'a été proposé cette semaine");
    expect(mail.text).not.toContain("€");
  });

  it("protège le HTML", () => {
    const mail = buildWeeklyDigest(base({ pharmacyName: "Pharmacie <script>", challenges: [{ title: "<img onerror=x>", endsLabel: "demain" }] }), ctx)!;
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).not.toContain("<img onerror");
  });

  it("l'évolution dite simplement", () => {
    expect(trendLabel(metric(0, 0, null, "none"))).toBeNull();
    expect(trendLabel(metric(5, 5, 0, "flat"))?.text).toBe("stable");
  });
});
