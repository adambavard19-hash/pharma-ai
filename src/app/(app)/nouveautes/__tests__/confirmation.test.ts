import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * La confirmation avant l'envoi aux abonnés : ce que le titulaire relit. Le
 * nombre de destinataires, ce qui part, quand le prochain envoi sera possible —
 * et, sans messagerie, que l'envoi sera simulé.
 */

vi.mock("server-only", () => ({}));
vi.mock("@/server/actions/patient-news", () => ({ previewAnnouncementAction: vi.fn(), sendAnnouncementAction: vi.fn(), sendAnnouncementTestAction: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ push: vi.fn() }) }));

const { ConfirmationBody } = await import("../announcement-composer");

const VALUE = { title: "Une nouvelle gamme est arrivée", rangeLabel: "Gamme Solaire", message: "Découvrez notre gamme.\n\nElle est en rayon." };
const AT = new Date("2026-10-05T10:00:00Z");

const render = (overrides: Partial<Parameters<typeof ConfirmationBody>[0]> = {}) =>
  renderToStaticMarkup(createElement(ConfirmationBody, { value: VALUE, activeCount: 12, pharmacyName: "Pharmacie Saint-Michel", messagingLive: true, at: AT, ...overrides }));
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

describe("la confirmation de l'envoi", () => {
  it("dit le nombre d'abonnés, l'expéditeur, l'objet, la gamme et le message tels qu'ils partiront", () => {
    const shown = text(render());
    expect(shown).toContain("Destinataires 12 abonnés");
    expect(shown).toContain("Leurs adresses ne vous sont jamais montrées.");
    expect(shown).toContain("Expéditeur Pharmacie Saint-Michel");
    expect(shown).toContain("Objet Une nouvelle gamme est arrivée");
    expect(shown).toContain("Gamme Gamme Solaire");
    expect(shown).toContain("Découvrez notre gamme.");
    expect(shown).toContain("Elle est en rayon.");
  });

  it("dit ce que comporte chaque message, et quand le prochain envoi sera possible", () => {
    const shown = text(render());
    expect(shown).toContain("Chaque message comporte le lien pour se désinscrire");
    expect(shown).toContain("aucun médicament sur ordonnance");
    expect(shown).toContain("Après cet envoi, la prochaine annonce ne pourra pas partir avant le 12 octobre 2026 (une par semaine au plus).");
    expect(shown).not.toContain("Envoi simulé");
  });

  it("sans messagerie : l'envoi simulé est annoncé en tête, ne compte pas dans la limite, et n'est pas présenté comme un vrai", () => {
    const shown = text(render({ messagingLive: false }));
    expect(shown).toContain("Envoi simulé");
    expect(shown).toContain("aucun message ne partira");
    expect(shown).toContain("Cet envoi sera simulé : il ne compte pas dans la limite d'une annonce par semaine");
    expect(shown).not.toContain("12 octobre");
  });

  it("une annonce sans gamme n'affiche pas de ligne « Gamme »", () => {
    expect(text(render({ value: { ...VALUE, rangeLabel: null } }))).not.toContain("Gamme ");
  });

  it("un abonné : le singulier", () => {
    expect(text(render({ activeCount: 1 }))).toContain("Destinataires 1 abonné");
    expect(text(render({ activeCount: 1 }))).not.toContain("1 abonnés");
  });

  it("échappe le texte de l'annonce", () => {
    const html = render({ value: { ...VALUE, title: "<script>alert(1)</script>" } });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
