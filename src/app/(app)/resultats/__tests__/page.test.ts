import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import type { PerformanceReport, SubscriptionReturn } from "@/core/performance/types";

/**
 * La page « Ce que PharmaBoost vous rapporte », rendue côté serveur sans navigateur ni base.
 * Le service de calcul et le tableau de bord sont remplacés : on vérifie ce que la page
 * décide elle-même — qui entre, quelle officine est lue, quelle période, et ce qui part
 * vers l'écran. Les chiffres, eux, sont éprouvés dans le cœur et dans le service.
 */

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  loadPerformanceReport: vi.fn(),
  loadSubscriptionReturn: vi.fn(),
  loadCounterResults: vi.fn(),
  dashboard: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/session", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/server/services/performance", () => ({
  loadPerformanceReport: mocks.loadPerformanceReport,
  loadSubscriptionReturn: mocks.loadSubscriptionReturn,
}));
vi.mock("@/server/services/counter-results", () => ({ loadCounterResults: mocks.loadCounterResults }));
vi.mock("@/components/performance/counter-results-card", () => ({ CounterResultsCard: () => createElement("div", { "data-testid": "comptoir" }, "au comptoir") }));
vi.mock("@/components/performance/performance-dashboard", () => ({
  PerformanceDashboard: (props: Record<string, unknown>) => {
    mocks.dashboard(props);
    return createElement("div", { "data-testid": "dashboard" }, "tableau de bord");
  },
}));

const page = await import("../page");
const { PERMISSIONS, ROLE_PERMISSIONS } = await import("@/server/rbac/permissions");

type Role = keyof typeof ROLE_PERMISSIONS;

const NOW = new Date("2026-10-06T10:00:00Z");
const REPORT = { marker: "rapport de l'officine" } as unknown as PerformanceReport;

const ROI_SHOWN: SubscriptionReturn = {
  status: "shown",
  monthLabel: "octobre 2026",
  monthlyPriceHtCents: 12_600,
  trialing: false,
  confirmedTtcCents: 60_000,
  confirmedHtCents: 52_920,
  confirmedLines: 24,
  pricedShare: 1,
  ratio: 4.2,
  ratioLabel: "4,2 fois",
  sentence: "PharmaBoost a généré 4,2 fois le montant de votre abonnement en ventes confirmées ce mois-ci.",
};
const ROI_HIDDEN: SubscriptionReturn = {
  status: "hidden",
  reason: "not_enough_sales",
  detail: "s'affichera dès 5 ventes confirmées dans le mois",
};

type Params = Record<string, string | string[] | undefined>;
const render = async (params: Params = {}) =>
  renderToStaticMarkup(await page.default({ searchParams: Promise.resolve(params) }));

/** Un rôle qui n'a pas la permission demandée est refusé, comme le fait `requirePermission` (403). */
function connectedAs(role: Role) {
  mocks.requirePermission.mockImplementation(async (permission: string) => {
    if (!(ROLE_PERMISSIONS[role] as string[]).includes(permission)) throw new Error("NEXT_HTTP_ERROR_FALLBACK;403");
    return { role, scope: { pharmacyId: "ph_a", organizationId: "org_1", userId: "user_a" } };
  });
}

/** Les propriétés reçues par le tableau de bord au dernier rendu. */
const dashboardProps = () => mocks.dashboard.mock.calls.at(-1)?.[0] as Record<string, unknown> & {
  report: PerformanceReport;
  roi: SubscriptionReturn | null;
  now: Date;
};
/** La période passée au service au dernier appel. */
const lastPeriod = () => mocks.loadPerformanceReport.mock.calls.at(-1)?.[0].period as {
  key: string;
  start: Date;
  end: Date;
  from?: string;
  to?: string;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  connectedAs("OWNER");
  mocks.loadPerformanceReport.mockResolvedValue(REPORT);
  mocks.loadSubscriptionReturn.mockResolvedValue(ROI_SHOWN);
  mocks.loadCounterResults.mockResolvedValue({ marker: "comptoir" });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("l'accès : une vue de titulaire", () => {
  it("exige la permission de Pilotage, avant toute lecture", async () => {
    await render();
    expect(mocks.requirePermission).toHaveBeenCalledWith(PERMISSIONS.ANALYTICS_VIEW_TEAM_PERFORMANCE);
  });

  it("le titulaire entre", async () => {
    await expect(render()).resolves.toContain("Ce que PharmaBoost vous rapporte");
  });

  it.each(["PHARMACIST", "TECHNICIAN", "STUDENT", "VIEWER"] as const)("%s est refusé : rien n'est lu, rien n'est affiché", async (role) => {
    connectedAs(role);
    await expect(render()).rejects.toThrow("403");
    expect(mocks.loadPerformanceReport).not.toHaveBeenCalled();
    expect(mocks.loadSubscriptionReturn).not.toHaveBeenCalled();
    expect(mocks.dashboard).not.toHaveBeenCalled();
  });
});

describe("l'officine lue : toujours celle de la session", () => {
  it("passe le pharmacyId de la session aux deux lectures, avec le même instant", async () => {
    await render({ periode: "mois" });
    expect(mocks.loadPerformanceReport).toHaveBeenCalledTimes(1);
    expect(mocks.loadSubscriptionReturn).toHaveBeenCalledTimes(1);
    const reportCall = mocks.loadPerformanceReport.mock.calls[0][0];
    const roiCall = mocks.loadSubscriptionReturn.mock.calls[0][0];
    expect(reportCall.pharmacyId).toBe("ph_a");
    expect(roiCall.pharmacyId).toBe("ph_a");
    expect(reportCall.now).toEqual(NOW);
    expect(roiCall.now).toBe(reportCall.now);
    expect(dashboardProps().now).toBe(reportCall.now);
    // Le retour sur abonnement est le mois civil en cours : il ne reçoit pas la période choisie.
    expect(roiCall).not.toHaveProperty("period");
  });

  it("ignore toute officine glissée dans l'adresse", async () => {
    await render({ periode: "7j", pharmacyId: "ph_b", pharmacy: "ph_b", officine: "ph_b", id: "ph_b" });
    expect(mocks.loadPerformanceReport.mock.calls.map(([arg]) => arg.pharmacyId)).toEqual(["ph_a"]);
    expect(mocks.loadSubscriptionReturn.mock.calls.map(([arg]) => arg.pharmacyId)).toEqual(["ph_a"]);
    expect(JSON.stringify(mocks.dashboard.mock.calls)).not.toContain("ph_b");
  });

  it("un service qui échoue fait échouer la page : jamais un écran vide présenté comme un résultat", async () => {
    mocks.loadPerformanceReport.mockRejectedValue(new Error("base indisponible"));
    await expect(render()).rejects.toThrow("base indisponible");
    expect(mocks.dashboard).not.toHaveBeenCalled();
  });
});

describe("la période : lue dans l'adresse par l'unique parseur du cœur", () => {
  it("par défaut : les 7 derniers jours civils (minuit à Paris il y a 6 jours), jusqu'à maintenant", async () => {
    await render();
    expect(lastPeriod().key).toBe("7d");
    expect(lastPeriod().end).toEqual(NOW);
    expect(lastPeriod().start).toEqual(new Date("2026-09-29T22:00:00Z"));
  });

  it("« aujourd'hui » commence à minuit à Paris (22 h la veille en UTC l'été), pas à minuit UTC", async () => {
    await render({ periode: "aujourdhui" });
    expect(lastPeriod().key).toBe("today");
    expect(lastPeriod().start).toEqual(new Date("2026-10-05T22:00:00Z"));
    expect(lastPeriod().end).toEqual(NOW);
  });

  it("« ce mois » commence le 1er à minuit à Paris", async () => {
    await render({ periode: "mois" });
    expect(lastPeriod().key).toBe("month");
    expect(lastPeriod().start).toEqual(new Date("2026-09-30T22:00:00Z"));
  });

  it("une période personnalisée garde ses dates, jour de fin compris", async () => {
    await render({ periode: "perso", du: "2026-09-01", au: "2026-09-15" });
    const period = lastPeriod();
    expect(period.key).toBe("custom");
    expect(period.from).toBe("2026-09-01");
    expect(period.to).toBe("2026-09-15");
    expect(period.start).toEqual(new Date("2026-08-31T22:00:00Z"));
    expect(period.end).toEqual(new Date("2026-09-15T22:00:00Z"));
  });

  it("des dates inversées sont remises dans l'ordre, sans erreur", async () => {
    await render({ periode: "perso", du: "2026-09-15", au: "2026-09-01" });
    expect(lastPeriod().key).toBe("custom");
    expect(lastPeriod().from).toBe("2026-09-01");
    expect(lastPeriod().to).toBe("2026-09-15");
  });

  it.each([
    ["une valeur inconnue", { periode: "n'importe quoi" }],
    ["du balisage", { periode: "<script>alert(1)</script>" }],
    ["un nom réservé", { periode: "__proto__" }],
    ["une période personnalisée sans dates", { periode: "perso" }],
    ["une date qui n'existe pas", { periode: "perso", du: "2026-02-31", au: "2026-03-05" }],
    ["des dates illisibles", { periode: "perso", du: "hier", au: "demain" }],
    ["une période de plus de 366 jours", { periode: "perso", du: "2024-01-01", au: "2026-10-01" }],
    ["une période entièrement dans le futur", { periode: "perso", du: "2026-11-01", au: "2026-11-10" }],
  ] as [string, Params][])("%s : retombe sur les 7 derniers jours, sans erreur", async (_, params) => {
    await expect(render(params)).resolves.toContain("tableau de bord");
    expect(lastPeriod().key).toBe("7d");
    expect(lastPeriod().from).toBeUndefined();
  });
});

describe("ce qui part vers l'écran", () => {
  it("le tableau de bord reçoit le rapport, l'adresse de la page et le public « titulaire »", async () => {
    await render();
    const props = dashboardProps();
    expect(props.report).toBe(REPORT);
    expect(props.basePath).toBe("/resultats");
    expect(props.audience).toBe("owner");
    // Rien à conserver dans l'adresse : la page n'a pas d'autre paramètre que la période.
    expect(props.preserveParams).toBeUndefined();
  });

  it("avec un retour sur abonnement mesurable : il est transmis tel quel", async () => {
    mocks.loadSubscriptionReturn.mockResolvedValue(ROI_SHOWN);
    await render();
    expect(dashboardProps().roi).toBe(ROI_SHOWN);
  });

  it("sans retour mesurable : l'état masqué est transmis tel quel, avec sa raison, jamais remplacé par un ratio", async () => {
    mocks.loadSubscriptionReturn.mockResolvedValue(ROI_HIDDEN);
    await render();
    expect(dashboardProps().roi).toBe(ROI_HIDDEN);
    expect(dashboardProps().roi).toMatchObject({ status: "hidden", reason: "not_enough_sales" });
  });

  it("le titre et le sous-titre de la page, sans chiffre ni collaborateur", async () => {
    const html = await render();
    expect(html).toMatch(/<h1[^>]*>Ce que PharmaBoost vous rapporte<\/h1>/);
    const shown = html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'");
    expect(shown).toContain("ventes confirmées");
    expect(shown).not.toMatch(/\d/);
    expect(html).toContain('data-testid="dashboard"');
  });

  it("le sous-titre ne promet pas « visibles que de vous » : l'équipe PharmaBoost voit les mêmes chiffres, et la permission peut être accordée", async () => {
    const shown = (await render()).replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
    expect(shown).toContain("Ces chiffres sont réservés au titulaire de l'officine et à l'équipe PharmaBoost qui vous accompagne.");
    expect(shown).not.toContain("visibles que de vous");
  });

  it("le titre de l'onglet", () => {
    expect(page.metadata).toEqual({ title: "Ce que PharmaBoost vous rapporte" });
  });
});

describe("un refus reste un vrai 403 (comme Pilotage)", () => {
  it("la page n'a pas de loading.tsx : il la mettrait dans une frontière Suspense, et un refus partirait en 200 avec l'écran « Accès réservé »", () => {
    const folder = join(dirname(fileURLToPath(import.meta.url)), "..");
    expect(existsSync(join(folder, "page.tsx"))).toBe(true);
    for (const name of ["loading.tsx", "loading.ts", "loading.jsx", "loading.js"]) expect(existsSync(join(folder, name)), name).toBe(false);
  });
});
