import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Le menu « Créer » de la console. Le menu déroulant est ouvert d'office pour
 * lire ses entrées ; seul son contenu nous intéresse ici.
 */

vi.mock("@/components/ui/dropdown", () => ({
  Dropdown: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  DropdownLabel: ({ children }: { children: ReactNode }) => createElement("p", null, children),
}));

const { QuickActions } = await import("../quick-actions");

describe("actions rapides de la console", () => {
  const html = renderToStaticMarkup(createElement(QuickActions));

  it("propose « Campagne » : elle mène à l'assistant de création", () => {
    expect(html).toContain('href="/admin/campagnes/nouvelle"');
    expect(html).toMatch(/href="\/admin\/campagnes\/nouvelle"[^>]*>(?:<svg[^>]*>.*?<\/svg>)?Campagne</);
  });

  it("garde les gestes déjà là", () => {
    for (const href of ["/admin/pharmacies?nouveau=officine", "/admin/pipeline?nouveau=prospect", "/admin/demonstrations?nouveau=demo", "/admin/contrats?vue=a-envoyer", "/admin/commerciaux?nouveau=commercial"]) {
      expect(html).toContain(`href="${href.replace(/&/g, "&amp;")}"`);
    }
  });
});
