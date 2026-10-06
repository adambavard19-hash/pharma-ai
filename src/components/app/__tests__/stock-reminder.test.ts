import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StockReminderBanner, describeStockReminder } from "../stock-reminder";

/**
 * Le rappel au titulaire quand son stock est vieux : sobre à 3 jours, appuyé à
 * 7 jours ou quand rien n'a jamais été envoyé, un seul bouton, jamais pour
 * l'équipe ni en démonstration.
 */

const NOW = new Date("2026-10-05T10:00:00Z");
const DAY = 24 * 3_600_000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

type Props = Parameters<typeof StockReminderBanner>[0];
const html = (props: Partial<Props> = {}) => renderToStaticMarkup(createElement(StockReminderBanner, { stockSyncedAt: ago(5), canImport: true, now: NOW, ...props }));
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, " ").trim();

describe("quand le rappel apparaît", () => {
  it("rien tant que le stock est récent : 0, 1 ou 2 jours", () => {
    for (const days of [0, 1, 2]) expect(html({ stockSyncedAt: ago(days) }), `${days} j`).toBe("");
  });

  it("à partir de 3 jours : le rappel doux", () => {
    const markup = html({ stockSyncedAt: ago(3) });
    expect(text(markup)).toContain("Votre stock date de 3 jours. Mettez-le à jour en 1 minute.");
  });

  it("à partir de 7 jours : le rappel appuyé", () => {
    expect(text(html({ stockSyncedAt: ago(7) }))).toContain("Votre stock date de 7 jours. Mettez-le à jour pour que PharmaBoost conseille selon ce que vous avez vraiment.");
    expect(text(html({ stockSyncedAt: ago(40) }))).toContain("Votre stock date de 40 jours.");
  });

  it("jamais envoyé : on demande le stock, sans chiffre inventé", () => {
    const t = text(html({ stockSyncedAt: null }));
    expect(t).toContain("Envoyez votre stock pour que PharmaBoost conseille selon ce que vous avez vraiment.");
    expect(t).not.toMatch(/\d+ jours?/);
  });
});

describe("à qui il s'adresse", () => {
  it("jamais pour l'équipe au comptoir, quel que soit l'âge du stock", () => {
    expect(html({ canImport: false, stockSyncedAt: ago(30) })).toBe("");
    expect(html({ canImport: false, stockSyncedAt: null })).toBe("");
  });

  it("jamais pour une officine de démonstration", () => {
    expect(html({ isDemo: true, stockSyncedAt: null })).toBe("");
    expect(html({ isDemo: true, stockSyncedAt: ago(30) })).toBe("");
  });

  it("la démonstration est fausse par défaut : le titulaire d'une vraie officine voit le rappel", () => {
    expect(html({ isDemo: false })).not.toBe("");
    expect(html({ isDemo: undefined })).not.toBe("");
  });
});

describe("ce qu'il montre", () => {
  it("un seul bouton « Mettre à jour mon stock » qui mène à la page de mise à jour", () => {
    for (const stockSyncedAt of [ago(4), ago(9), null]) {
      const markup = html({ stockSyncedAt });
      expect(markup.match(/<a /g)).toHaveLength(1);
      expect(markup).toContain('href="/stock/mise-a-jour"');
      expect(text(markup)).toContain("Mettre à jour mon stock");
      expect(markup).not.toContain("<button");
    }
  });

  it("le rappel appuyé est orange et plus visible que le rappel doux", () => {
    const soft = html({ stockSyncedAt: ago(4) });
    const strong = html({ stockSyncedAt: ago(9) });
    expect(strong).toContain("bg-warning-50");
    expect(soft).not.toContain("bg-warning-50");
    expect(html({ stockSyncedAt: null })).toContain("bg-warning-50");
  });

  it("sans l'heure passée en paramètre, il juge à l'instant présent", () => {
    const markup = renderToStaticMarkup(createElement(StockReminderBanner, { stockSyncedAt: null, canImport: true }));
    expect(text(markup)).toContain("Envoyez votre stock");
  });
});

describe("les niveaux du rappel", () => {
  it("rien sous 3 jours, doux de 3 à 6 jours, appuyé à partir de 7 jours et quand rien n'a jamais été envoyé", () => {
    expect(describeStockReminder(ago(3), NOW)?.level).toBe("soft");
    expect(describeStockReminder(ago(6), NOW)?.level).toBe("soft");
    expect(describeStockReminder(ago(7), NOW)?.level).toBe("strong");
    expect(describeStockReminder(ago(1), NOW)).toBeNull();
    expect(describeStockReminder(null, NOW)?.level).toBe("strong");
  });
});
