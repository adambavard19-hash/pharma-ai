import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { INITIAL_ISLAND } from "@/core/island/banner-flow";
import { CounterIsland, type IslandAdvice } from "../counter-island";
import { bilanQrWord, parseCommand } from "@/core/poste/island-bridge";

/** Le bilan par QR code au comptoir (fondateur, 5 nov. 2026) : le patient scanne, son bilan s'ouvre sur son téléphone. */
const ITEMS: IslandAdvice[] = [{ name: "FLORE ÉQUILIBRE", price: "14,90 €", stock: "IN_STOCK" }];
const render = (extra: Record<string, unknown>) =>
  renderToStaticMarkup(
    createElement(CounterIsland, {
      state: { ...INITIAL_ISLAND, stage: "email", outcomes: ["SOLD"] },
      items: ITEMS,
      drug: "AMOXICILLINE",
      alert: null,
      pills: [],
      onAnswer: vi.fn(), onEmail: vi.fn(), onSendEmail: vi.fn(), onAddEmail: vi.fn(), onFinish: vi.fn(), onDismissAlert: vi.fn(),
      ...extra,
    }),
  ).replaceAll("&#x27;", "'");

describe("le bilan par QR code dans l'île", () => {
  it("l'écran de l'e-mail propose le QR code quand le poste sait le faire", () => {
    expect(render({ onShowBilanQr: vi.fn() })).toContain("data-ile-qr");
    expect(render({})).not.toContain("data-ile-qr");
  });

  it("le lien prêt : le QR code est dessiné, avec le geste du patient et « Terminer »", () => {
    const html = render({ bilanQr: { loading: false, url: "https://pharmaboost.app/bilan/abc#cle" } });
    expect(html).toContain("data-ile-bilan-qr");
    expect(html).toContain("<svg");
    expect(html).toContain("appli PharmaBoost");
    expect(html).toContain("Terminer");
  });

  it("le mot vers l'agent et la réponse de l'agent sont vérifiés", () => {
    expect(bilanQrWord("vente-1")).toBe("BILANQR vente-1");
    expect(bilanQrWord("vente 1")).toBeNull();
    expect(parseCommand({ op: "bilan", id: "vente-1", url: "https://pharmaboost.app/bilan/abc#cle" })).toEqual({ op: "bilan", id: "vente-1", url: "https://pharmaboost.app/bilan/abc#cle" });
    expect(parseCommand({ op: "bilan", id: "vente-1", url: "https://ailleurs.example/hack" })).toBeNull();
  });
});
