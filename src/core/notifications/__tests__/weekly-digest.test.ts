import { describe, expect, it } from "vitest";
import { buildDailyDigest, digestHasContent, type DailyDigestInput } from "../weekly-digest";

const ctx = { baseUrl: "https://pharmaboost.app", company: { legalName: "PharmaBoost", contactEmail: "contact@pharmaboost.app" } };
const base = (over: Partial<DailyDigestInput> = {}): DailyDigestInput => ({
  audience: "owner",
  pharmacyName: "Pharmacie du Port",
  firstName: "Anne",
  dayLabel: "du lundi 12 au dimanche 18 octobre",
  advice: { sales: 30, proposed: 42, sold: 11, revenueTtcCents: 18950 },
  pdfAttached: true,
  challenges: [{ title: "Challenge NATURÉO", endsLabel: "jusqu'au 31 oct." }],
  stock: { out: 2, low: 5, outNames: ["Échinacée", "Pastilles gorge"] },
  links: { results: "https://pharmaboost.app/resultats", stock: "https://pharmaboost.app/stock", unsubscribe: "https://pharmaboost.app/resume-hebdo/abc" },
  ...over,
});
const n = (text: string) => text.replace(/[  ]/g, " ");

describe("le bilan de la semaine du titulaire", () => {
  it("toute l'officine : les chiffres de la semaine, le taux, le PDF, les challenges et le stock à surveiller", () => {
    const mail = buildDailyDigest(base(), ctx)!;
    expect(mail.subject).toBe("Votre bilan de la semaine — Pharmacie du Port");
    expect(mail.text).toContain("conseils proposés : 42 (dans 30 ventes)");
    expect(mail.text).toContain("conseils vendus : 11");
    expect(n(mail.text)).toContain("de chiffre d'affaires ajouté (TTC) : 189,50 €");
    expect(mail.text).toContain("Taux de vente : 26,2 %");
    expect(mail.text).toContain("joint en PDF");
    expect(mail.html).toContain("du lundi 12 au dimanche 18 octobre");
    expect(mail.text).toContain("Challenge NATURÉO — jusqu'au 31 oct.");
    expect(mail.text).toContain("En rupture : Échinacée, Pastilles gorge");
    expect(mail.text).toContain("Ne plus recevoir ce bilan : https://pharmaboost.app/resume-hebdo/abc");
    expect(mail.html).toContain("Bonjour Anne,");
  });

  it("une semaine sans conseil proposé n'envoie rien", () => {
    expect(digestHasContent({ advice: null })).toBe(false);
    expect(digestHasContent({ advice: { sales: 4, proposed: 0, sold: 0, revenueTtcCents: 0 } })).toBe(false);
    expect(buildDailyDigest(base({ advice: null }), ctx)).toBeNull();
  });

  it("protège le HTML", () => {
    const mail = buildDailyDigest(base({ pharmacyName: "Pharmacie <script>", challenges: [{ title: "<img onerror=x>", endsLabel: "demain" }] }), ctx)!;
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).not.toContain("<img onerror");
  });
});

describe("le bilan de la semaine d'un membre de l'équipe", () => {
  it("seulement ses ventes : ni le stock, ni les challenges de l'officine, et il le dit", () => {
    const mail = buildDailyDigest(base({ audience: "member", firstName: "Léa", advice: { sales: 6, proposed: 9, sold: 2, revenueTtcCents: 2380 }, links: { results: "https://pharmaboost.app/historique", stock: "x", unsubscribe: "u" } }), ctx)!;
    expect(mail.subject).toBe("Votre performance de la semaine — Pharmacie du Port");
    expect(mail.text).toContain("seulement les vôtres");
    expect(mail.text).toContain("Il ne contient que vos propres ventes");
    expect(mail.text).toContain("conseils proposés : 9 (dans 6 ventes)");
    expect(mail.text).not.toContain("Stock à surveiller");
    expect(mail.text).not.toContain("NATURÉO");
    expect(mail.text).toContain("https://pharmaboost.app/historique");
  });
});
