import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { PerformancePeriod, PerformanceReport, SubscriptionReturn } from "@/core/performance/types";

/**
 * L'onglet « Performance » de la fiche officine (console), rendu côté serveur sans base ni navigateur.
 * Le service de calcul et le tableau de bord sont remplacés : on vérifie ce que l'onglet décide lui-même
 * — quelle officine est lue, quelle période, ce qui part vers l'écran, ce qu'il fait d'une officine
 * inconnue ou de démonstration. Les chiffres, eux, sont éprouvés dans le cœur et dans le service.
 */

const mocks = vi.hoisted(() => ({
  loadPerformanceForPlatform: vi.fn(),
  notFound: vi.fn(),
  isDemoMode: vi.fn(),
  dashboard: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/config/env", () => ({ isDemoMode: mocks.isDemoMode }));
vi.mock("@/server/services/performance", () => ({ loadPerformanceForPlatform: mocks.loadPerformanceForPlatform }));
vi.mock("@/components/performance/performance-dashboard", () => ({
  PerformanceDashboard: (props: Record<string, unknown>) => {
    mocks.dashboard(props);
    return createElement("div", { "data-testid": "dashboard" }, "tableau de bord");
  },
}));

const { PerformanceTab } = await import("../tab-performance");
const { parseTab, tabHref, TAB_KEYS } = await import("../shared");

type Query = Record<string, string | string[] | undefined>;

const NOW = new Date("2026-10-06T10:00:00Z");
const REPORT = { marker: "rapport de l'officine" } as unknown as PerformanceReport;
const ROI: SubscriptionReturn = { status: "hidden", reason: "not_enough_sales", detail: "s'affichera dès 5 lignes de vente confirmées au prix connu dans le mois" };

const pharmacy = (overrides: Record<string, unknown> = {}) => ({ id: "ph_1", name: "Pharmacie du Port", city: "Brest", createdAt: new Date("2026-01-10T09:00:00Z"), isDemo: false, ...overrides });

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[\s  ]+/g, " ");

const render = async (query: Query = {}, pharmacyId = "ph_1") => renderToStaticMarkup((await PerformanceTab({ pharmacyId, query, now: NOW })) as React.ReactElement);

const dashboardProps = () => mocks.dashboard.mock.calls.at(-1)?.[0] as Record<string, unknown>;
/** La période passée au service au dernier appel. */
const servicePeriod = () => mocks.loadPerformanceForPlatform.mock.calls.at(-1)?.[0].period as PerformancePeriod;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isDemoMode.mockReturnValue(false);
  // Comme `notFound()` de Next : il ne rend jamais la main.
  mocks.notFound.mockImplementation(() => {
    throw new Error("NEXT_NOT_FOUND");
  });
  mocks.loadPerformanceForPlatform.mockResolvedValue({ pharmacy: pharmacy(), report: REPORT, roi: ROI });
});

describe("une officine inconnue", () => {
  it("le service ne la trouve pas : 404, et aucun tableau de bord vide présenté comme une mesure", async () => {
    mocks.loadPerformanceForPlatform.mockResolvedValue(null);
    await expect(render({}, "ph_inconnue")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.notFound).toHaveBeenCalledTimes(1);
    expect(mocks.dashboard).not.toHaveBeenCalled();
  });

  it("une officine connue : notFound n'est jamais appelé", async () => {
    await render();
    expect(mocks.notFound).not.toHaveBeenCalled();
  });
});

describe("ce qui part vers le tableau de bord", () => {
  it("le public « console », l'adresse de la fiche, l'onglet à conserver, le rapport et le retour du service", async () => {
    const html = await render({ onglet: "performance" });
    const props = dashboardProps();
    expect(props.audience).toBe("platform");
    expect(props.basePath).toBe("/admin/pharmacies/ph_1");
    // Sans cela, changer de période mènerait à /admin/pharmacies/ph_1?periode=7j, c'est-à-dire à l'onglet Aperçu.
    expect(props.preserveParams).toEqual({ onglet: "performance" });
    expect(props.report).toBe(REPORT);
    expect(props.roi).toBe(ROI);
    expect(props.now).toBe(NOW);
    expect(html).toContain('data-testid="dashboard"');
  });

  it("l'adresse de base est celle de l'officine que la base vient de confirmer", async () => {
    mocks.loadPerformanceForPlatform.mockResolvedValue({ pharmacy: pharmacy({ id: "ph_confirmee" }), report: REPORT, roi: ROI });
    await render({}, "ph_1");
    expect(dashboardProps().basePath).toBe("/admin/pharmacies/ph_confirmee");
  });

  it("dit que ce sont les mêmes chiffres que ceux du titulaire, et ramène à la liste des officines", async () => {
    const html = await render();
    expect(text(html)).toContain("Les mêmes chiffres que dans l'espace du titulaire.");
    expect(html).toMatch(/<a[^>]*href="\/admin\/performance"[^>]*>(?:(?!<\/a>).)*Toutes les officines/s);
  });
});

describe("l'officine lue : toujours celle de la fiche, jamais celle de l'adresse", () => {
  it("passe au service l'identifiant reçu en propriété, avec le même instant", async () => {
    await render({}, "ph_1");
    expect(mocks.loadPerformanceForPlatform).toHaveBeenCalledTimes(1);
    const call = mocks.loadPerformanceForPlatform.mock.calls[0][0];
    expect(call.pharmacyId).toBe("ph_1");
    expect(call.now).toBe(NOW);
  });

  it("une adresse hostile glissée dans la requête ne change ni l'officine, ni l'onglet, ni la période", async () => {
    await render({ pharmacyId: "autre", pharmacy: "autre", id: "autre", onglet: "x", periode: "zzz", du: "2026-02-31" });
    expect(mocks.loadPerformanceForPlatform.mock.calls.map(([arg]) => arg.pharmacyId)).toEqual(["ph_1"]);
    expect(servicePeriod().key).toBe("7d");
    expect(servicePeriod().from).toBeUndefined();
    expect(servicePeriod().to).toBeUndefined();
    expect(dashboardProps().basePath).toBe("/admin/pharmacies/ph_1");
    expect(dashboardProps().preserveParams).toEqual({ onglet: "performance" });
    expect(JSON.stringify(mocks.dashboard.mock.calls)).not.toContain("autre");
  });

  it("un service qui échoue fait échouer l'onglet : jamais un écran vide présenté comme un résultat", async () => {
    mocks.loadPerformanceForPlatform.mockRejectedValue(new Error("base indisponible"));
    await expect(render()).rejects.toThrow("base indisponible");
    expect(mocks.dashboard).not.toHaveBeenCalled();
  });
});

describe("la période : lue dans l'adresse par l'unique parseur du cœur", () => {
  it("par défaut : les 7 derniers jours civils, jusqu'à maintenant (minuit à Paris)", async () => {
    await render();
    expect(servicePeriod().key).toBe("7d");
    expect(servicePeriod().end).toEqual(NOW);
    expect(servicePeriod().start).toEqual(new Date("2026-09-29T22:00:00Z"));
  });

  it("« ce mois » commence le 1er à minuit à Paris", async () => {
    await render({ periode: "mois" });
    expect(servicePeriod().key).toBe("month");
    expect(servicePeriod().start).toEqual(new Date("2026-09-30T22:00:00Z"));
  });

  it("une période personnalisée garde ses dates, jour de fin compris", async () => {
    await render({ periode: "perso", du: "2026-09-01", au: "2026-09-15" });
    const period = servicePeriod();
    expect(period.key).toBe("custom");
    expect(period.from).toBe("2026-09-01");
    expect(period.to).toBe("2026-09-15");
    expect(period.start).toEqual(new Date("2026-08-31T22:00:00Z"));
    expect(period.end).toEqual(new Date("2026-09-15T22:00:00Z"));
  });

  it.each([
    ["une valeur inconnue", { periode: "n'importe quoi" }],
    ["du balisage", { periode: "<script>alert(1)</script>" }],
    ["une période personnalisée sans dates", { periode: "perso" }],
    ["une date qui n'existe pas", { periode: "perso", du: "2026-02-31", au: "2026-03-05" }],
    ["une période entièrement dans le futur", { periode: "perso", du: "2026-11-01", au: "2026-11-10" }],
    ["une période de plus de 366 jours", { periode: "perso", du: "2024-01-01", au: "2026-10-01" }],
    ["un paramètre répété, première valeur inconnue", { periode: ["zzz", "mois"] }],
  ] as [string, Query][])("%s : retombe sur les 7 derniers jours, sans erreur", async (_, query) => {
    await expect(render(query)).resolves.toContain("tableau de bord");
    expect(servicePeriod().key).toBe("7d");
  });
});

describe("l'officine de démonstration", () => {
  it("hors environnement démo : un bandeau clair à la place du tableau de bord, jamais « rien mesuré »", async () => {
    mocks.loadPerformanceForPlatform.mockResolvedValue({ pharmacy: pharmacy({ isDemo: true }), report: REPORT, roi: ROI });
    mocks.isDemoMode.mockReturnValue(false);
    const html = await render();
    expect(text(html)).toContain("Officine de démonstration : ses données ne sont pas comptées ici.");
    expect(mocks.dashboard).not.toHaveBeenCalled();
    expect(html).not.toContain('data-testid="dashboard"');
    expect(text(html)).not.toContain("rien mesuré");
    // Pas de promesse « mêmes chiffres » quand il n'y a pas de chiffres ; le retour à la liste reste.
    expect(text(html)).not.toContain("Les mêmes chiffres");
    expect(html).toContain('href="/admin/performance"');
  });

  it("dans l'environnement démo : l'activité de démonstration est comptée, le tableau de bord s'affiche", async () => {
    mocks.loadPerformanceForPlatform.mockResolvedValue({ pharmacy: pharmacy({ isDemo: true }), report: REPORT, roi: ROI });
    mocks.isDemoMode.mockReturnValue(true);
    const html = await render();
    expect(html).toContain('data-testid="dashboard"');
    expect(text(html)).not.toContain("ses données ne sont pas comptées");
    expect(dashboardProps().report).toBe(REPORT);
  });

  it("une vraie officine n'a jamais le bandeau, quel que soit l'environnement", async () => {
    for (const demo of [false, true]) {
      mocks.dashboard.mockClear();
      mocks.isDemoMode.mockReturnValue(demo);
      const html = await render();
      expect(html).toContain('data-testid="dashboard"');
      expect(text(html)).not.toContain("Officine de démonstration");
    }
  });
});

describe("l'onglet dans la fiche (adresse et lecture de l'onglet)", () => {
  it("« performance » est un onglet connu ; une valeur inconnue ou vide retombe sur l'aperçu", () => {
    expect(TAB_KEYS).toContain("performance");
    expect(parseTab("performance")).toBe("performance");
    expect(parseTab("x")).toBe("apercu");
    expect(parseTab(null)).toBe("apercu");
  });

  it("le lien de la fiche vers l'onglet porte ?onglet=performance, et la période s'y ajoute sans le perdre", () => {
    expect(tabHref("ph_1", "performance")).toBe("/admin/pharmacies/ph_1?onglet=performance");
    expect(tabHref("ph_1", "performance", { periode: "7j" })).toBe("/admin/pharmacies/ph_1?onglet=performance&periode=7j");
  });
});
