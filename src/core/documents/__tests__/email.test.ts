import { describe, expect, it } from "vitest";
import { buildDocumentEmail } from "../email";
import type { DayPlanSummary } from "../compose";

/**
 * Le courriel qui accompagne le plan est la seule chose que Pharma.ai envoie
 * hors de l'officine. Ces tests fixent ce qu'il a le droit de contenir.
 */

const DAY_PLAN: DayPlanSummary[] = [
  { moment: "morning", label: "Matin", icon: "☀️", count: 2 },
  { moment: "noon", label: "Midi", icon: "🍽", count: 1 },
  { moment: "evening", label: "Soir", icon: "🌙", count: 2 },
];

const BASE = {
  patientFirstName: "Adam",
  pharmacyName: "Pharmacie Saint-Michel",
  pharmacyPhone: "01 23 45 67 89",
  brandColor: "#0F766E",
  passageAt: new Date("2026-09-07T10:00:00Z"),
  dayPlan: DAY_PLAN,
  url: "https://pharma.example/fiche/abc123",
  printUrl: "https://pharma.example/fiche/abc123?imprimer=1",
  expiresAt: new Date("2026-09-30T12:00:00Z"),
  isDemo: false,
};

describe("courriel du plan personnalisé", () => {
  it("porte l'objet attendu, sans donnée de santé ni nom de famille", () => {
    const message = buildDocumentEmail(BASE);
    expect(message.subject).toBe("Votre plan personnalisé — Pharmacie Saint-Michel");
    expect(message.subject).not.toMatch(/bavard/i);
  });

  it("ne transporte aucune donnée de santé : l'aperçu compte les prises, il ne nomme rien", () => {
    const message = buildDocumentEmail(BASE);
    const tout = `${message.subject}\n${message.text}\n${message.html}`.toLowerCase();
    for (const interdit of ["efferalgan", "rulid", "amoxicilline", "probiotique", "traitement contre", "atc", "score"]) {
      expect(tout).not.toContain(interdit);
    }
    expect(message.text).toContain("Matin : 2 prises");
    expect(message.text).toContain("Midi : 1 prise");
    expect(message.text).toContain("Soir : 2 prises");
    expect(message.text).toContain("ne contient aucune information sur votre santé");
  });

  it("dit la pharmacie et le passage, jamais le logiciel", () => {
    const message = buildDocumentEmail(BASE);
    expect(message.text).toContain("Bonjour Adam,");
    expect(message.text).toContain(
      "À la suite de votre passage à la Pharmacie Saint-Michel le 7 septembre 2026, vous trouverez votre plan personnalisé préparé avec votre pharmacien.",
    );
    expect(`${message.text}${message.html}`).not.toMatch(/pharma\.ai/i);
  });

  it("offre le bouton « Consulter mon plan », le lien d'impression et l'expiration", () => {
    const message = buildDocumentEmail(BASE);
    expect(message.html).toContain(">Consulter mon plan</a>");
    expect(message.html).toContain(`href="${BASE.url}"`);
    expect(message.html).toContain(">Télécharger / imprimer</a>");
    expect(message.text).toContain(BASE.url);
    expect(message.text).toContain("30 septembre 2026");
    expect(message.html).toContain('name="viewport"');
    expect(message.html).toContain("max-width:560px");
  });

  it("reprend la couleur de l'officine et se replie sur une couleur sûre sinon", () => {
    expect(buildDocumentEmail(BASE).html).toContain("background:#0F766E");
    expect(buildDocumentEmail({ ...BASE, brandColor: "url(javascript:x)" }).html).not.toContain("javascript");
  });

  it("omet l'aperçu quand aucune répartition n'est validée plutôt que d'en inventer une", () => {
    const message = buildDocumentEmail({
      ...BASE,
      dayPlan: DAY_PLAN.map((moment) => ({ ...moment, count: 0 })),
    });
    expect(message.text).not.toContain("Votre traitement");
    expect(message.html).not.toContain("Votre traitement");
  });

  it("échappe le HTML venant de l'officine", () => {
    const message = buildDocumentEmail({ ...BASE, pharmacyName: "Pharmacie <Test> & Co" });
    expect(message.html).toContain("Pharmacie &lt;Test&gt; &amp; Co");
    expect(message.html).not.toContain("<Test>");
  });

  it("annonce d'abord la démonstration quand le plan est fictif", () => {
    const message = buildDocumentEmail({ ...BASE, isDemo: true });
    expect(message.text.startsWith("MESSAGE DE DÉMONSTRATION")).toBe(true);
    expect(message.html).toContain("MESSAGE DE DÉMONSTRATION");
  });
});
