import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("../_cockpit/dismiss-form", () => ({ DismissFormButton: ({ id }: { id: string }) => createElement("button", { "data-croix": id }, "×") }));
const { FormsBlock } = await import("../_cockpit/forms");
import { formKind } from "@/core/admin/form-submissions";

const now = new Date("2026-10-21T10:00:00");
const item = (over: Partial<Parameters<typeof FormsBlock>[0]["items"][number]>) => ({ id: "n1", type: "SITE_LEAD", title: "Pharmacie recommandée — Pharmacie du Port", body: "Toulon · apportée par Julie", linkUrl: "/admin/dossiers/p1", readAt: null, createdAt: new Date("2026-10-21T09:12:00"), ...over });

describe("accueil de la console : chaque formulaire rempli est visible et cliquable (fondateur, 21 oct. 2026)", () => {
  it("chaque formulaire porte son nom, démonstration et recommandation départagées par le titre", () => {
    expect(formKind("SITE_LEAD", "Pharmacie recommandée — X").label).toBe("Pharmacie recommandée");
    expect(formKind("SITE_LEAD", "Démo réservée Lundi — X").label).toBe("Démonstration");
    expect(formKind("PARTNER_APPLICATION", "Candidature partenaire — X").label).toBe("Partenariat");
    expect(formKind("SALES_APPLICATION", "x").label).toBe("Candidature commerciale");
    expect(formKind("SITE_SUBSCRIPTION", "x").label).toBe("Abonnement");
  });

  it("une ligne ouvre le dossier ; « Nouveau » tant que la notification n'est pas lue", () => {
    const html = renderToStaticMarkup(createElement(FormsBlock, { now, items: [item({}), item({ id: "n2", type: "PARTNER_APPLICATION", title: "Candidature partenaire — Avène", linkUrl: "/admin/partenaires/candidatures/c1", readAt: now })] }));
    expect(html).toContain('href="/admin/dossiers/p1"');
    expect(html).toContain('href="/admin/partenaires/candidatures/c1"');
    expect(html).toContain("Pharmacie du Port");
    expect(html.match(/Nouveau</g)).toHaveLength(1);
    expect(html).toContain("1 nouveau");
    // Chaque ligne a sa croix, hors du lien : la retirer n'ouvre pas le dossier.
    expect(html).toContain('data-croix="n1"');
    expect(html).toContain('data-croix="n2"');
  });

  it("aucun formulaire : une phrase, pas un bloc vide", () => {
    expect(renderToStaticMarkup(createElement(FormsBlock, { now, items: [] }))).toContain("Aucun formulaire rempli sur le site");
  });
});
