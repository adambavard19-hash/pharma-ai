import { describe, expect, it } from "vitest";
import { FOLLOW_UP_ANSWERS, findAnswer, findAnswerBySlug } from "../answers";
import { FOLLOW_UP_TEMPLATES, findTemplate } from "../templates";
import { buildFollowUpEmailHtml } from "../email";

const V = {
  patientFirstName: "Adam",
  pharmacyName: "Pharmacie Saint-Michel",
  link: "https://pharma.example/fiche/tok",
  unsubscribeLink: "https://pharma.example/desinscription/opt",
  responseLink: "https://pharma.example/suivi/rep",
};

describe("retour patient", () => {
  it("offre exactement trois réponses fermées", () => {
    expect(FOLLOW_UP_ANSWERS.map((a) => a.label)).toEqual([
      "Ça va mieux",
      "Pas vraiment de changement",
      "J'ai encore besoin d'un conseil",
    ]);
    expect(findAnswerBySlug("conseil")?.code).toBe("NEED_ADVICE");
    expect(findAnswerBySlug("autre")).toBeNull();
    expect(findAnswer("BETTER")?.emoji).toBe("🙂");
  });

  it("ouvre chaque message par la même phrase humaine", () => {
    for (const template of FOLLOW_UP_TEMPLATES) {
      const body = template.body(V);
      expect(body.startsWith("Bonjour Adam,\n\nLa Pharmacie Saint-Michel prend de vos nouvelles à la suite de votre dernier passage.")).toBe(true);
      expect(body).not.toMatch(/pharma\.ai/i);
    }
  });

  it("pose la question avec ses trois liens quand le gabarit s'y prête, et jamais sinon", () => {
    const tolerance = findTemplate("tolerance-check")!.body(V);
    expect(tolerance).toContain("Comment allez-vous depuis votre passage ?");
    expect(tolerance).toContain("https://pharma.example/suivi/rep?r=mieux");
    expect(tolerance).toContain("?r=pareil");
    expect(tolerance).toContain("?r=conseil");

    const renewal = findTemplate("renewal")!.body(V);
    expect(renewal).not.toContain("Comment allez-vous");
    expect(renewal).not.toContain("/suivi/");
  });

  it("omet la question quand aucun lien de réponse n'existe", () => {
    expect(findTemplate("tolerance-check")!.body({ ...V, responseLink: null })).not.toContain("Comment allez-vous");
  });

  it("ne transporte aucune donnée de santé", () => {
    for (const template of FOLLOW_UP_TEMPLATES) {
      const all = `${template.subject(V)} ${template.body(V)}`.toLowerCase();
      for (const interdit of ["mg", "comprimé", "antibiotique", "efferalgan", "rulid"]) expect(all).not.toContain(interdit);
      expect(template.body(V)).toContain("Ce message ne contient aucune information sur votre santé.");
    }
  });

  it("rend les trois réponses en boutons dans le HTML, avec la couleur de l'officine", () => {
    const html = buildFollowUpEmailHtml(findTemplate("course-end")!, V, { brandColor: "#0F766E" });
    expect(html).toContain("Comment allez-vous depuis votre passage ?");
    expect(html.match(/href="https:\/\/pharma\.example\/suivi\/rep\?r=/g)).toHaveLength(3);
    expect(html).toContain("background:#0F766E");
    expect(html).toContain('href="https://pharma.example/desinscription/opt"');
    expect(html).toContain('name="viewport"');
    expect(html).not.toMatch(/pharma\.ai/i);
  });
});
