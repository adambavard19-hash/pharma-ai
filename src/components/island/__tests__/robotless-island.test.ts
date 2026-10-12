import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Un seul robot sur le PC du comptoir, côté écran : là où le logiciel PharmaBoost installé dessine déjà le robot, seul
 * le DESSIN s'efface. L'île de l'en-tête reste (une pastille à la place du robot, le compte des alertes, ce qu'elles
 * permettent, la discussion), le menu garde le compte des alertes hors du robot, et l'île de l'écran de vente — que le
 * logiciel installé joue déjà — n'est pas rejouée. Ailleurs, le robot est là comme avant.
 */

const ALERTS = [
  { key: "billing", severity: "problem", text: "Le dernier paiement n'est pas passé.", actions: [], snoozable: false },
  { key: "join:1", severity: "todo", text: "Léa demande à rejoindre l'officine.", actions: [], snoozable: true },
];
const mocks = vi.hoisted(() => ({ alerts: [] as unknown[], counterIsland: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined, refresh: () => undefined }), usePathname: () => "/" }));
vi.mock("@/server/actions/stock-deposits", () => ({ previewStockAction: vi.fn(), sendStockAction: vi.fn() }));
vi.mock("@/components/robot/robot-alerts", () => ({
  useRobotAlerts: () => ({ alerts: mocks.alerts, unseen: [], mood: "idle", loaded: true, running: null, markSeen: () => undefined, snooze: () => undefined, run: async () => undefined }),
  AlertBadge: ({ alerts }: { alerts: unknown[] }) => (alerts.length ? createElement("span", { "data-temoin": "compte" }, String(alerts.length)) : null),
}));
vi.mock("@/components/island/counter-island", () => ({ CounterIsland: (props: unknown) => (mocks.counterIsland(props), createElement("div", null, "ILE-DE-VENTE")) }));

const { RobotPresenceProvider } = await import("@/components/robot/robot-presence");
const { MobileNavProvider } = await import("@/components/app/mobile-nav");
const { AppIsland } = await import("../app-island");
const { Sidebar } = await import("@/components/app/sidebar");

/** Rendu dans l'espace : `robotHere` faux = le PC où le logiciel installé a son robot. */
// Les enfants passés en arguments (règle du dépôt) : les fournisseurs sont vus avec des enfants facultatifs.
const Presence = RobotPresenceProvider as (props: { inBrowser: boolean; children?: ReactNode }) => ReactNode;
const MobileNav = MobileNavProvider as (props: { children?: ReactNode }) => ReactNode;
const inSpace = (robotHere: boolean, node: ReactNode) => renderToStaticMarkup(createElement(Presence, { inBrowser: robotHere }, createElement(MobileNav, null, node)));
const island = (robotHere: boolean) => inSpace(robotHere, createElement(AppIsland, { suggestions: ["Résume ma journée"], canImportStock: true }));
const menu = (robotHere: boolean) => inSpace(robotHere, createElement(Sidebar, { permissions: [], pharmacyName: "Pharmacie du Port" }));

beforeEach(() => {
  mocks.alerts = ALERTS;
  mocks.counterIsland.mockClear();
});

describe("l'île de l'en-tête", () => {
  it("ailleurs : le robot du comptoir, avec le compte des alertes", () => {
    const html = island(true);
    expect(html).toContain("data-mood=");
    expect(html).not.toContain("data-island-mark");
    expect(html).toContain("L&#x27;île PharmaBoost : ");
    expect(html).toMatch(/\(2\)"/);
  });

  it("sur le PC du comptoir : l'île reste, sans dessin du robot, avec le compte des alertes (paiement, demandes d'accès)", () => {
    const html = island(false);
    expect(html).not.toContain("data-mood=");
    expect(html).not.toContain("Le robot PharmaBoost");
    expect(html).toContain("data-island-mark");
    // La capsule et son compte : c'est elle qui ouvre l'accueil (alertes et gestes) et la discussion.
    expect(html).toContain("data-island-toggle");
    expect(html).toMatch(/\(2\)"/);
    expect(html).toMatch(/>2<\/span>/);
  });
});

describe("le menu", () => {
  it("ailleurs : le robot, et le compte des alertes sur lui", () => {
    const html = menu(true);
    expect(html).toContain("data-mood=");
    expect(html).toContain('data-temoin="compte"');
    expect(html).not.toContain("ouvrir l&#x27;île PharmaBoost");
  });

  it("sur le PC du comptoir : pas de robot, mais le compte des alertes reste, en bouton qui ouvre l'île", () => {
    const html = menu(false);
    expect(html).not.toContain("data-mood=");
    expect(html).toContain('aria-label="2 choses à vous dire : ouvrir l&#x27;île PharmaBoost"');
    expect(html).toContain('data-temoin="compte"');
  });

  it("sur le PC du comptoir, sans alerte : ni robot ni bouton vide", () => {
    mocks.alerts = [];
    const html = menu(false);
    expect(html).not.toContain("data-mood=");
    expect(html).not.toContain("ouvrir l&#x27;île PharmaBoost");
  });
});

describe("l'île de l'écran de vente", () => {
  // Le portail témoin dessine sur place (le vrai attend la place mesurée dans le navigateur).
  vi.doMock("@/components/island/platform-island", async (importOriginal) => ({ ...(await importOriginal<object>()), IslandPortal: ({ children }: { children: ReactNode }) => children }));
  const sale = async (robotHere: boolean) => {
    const { SaleIsland } = await import("@/app/(app)/vente/[id]/sale-island");
    const props = { editing: false, analysing: false, analysisStep: null, liveScan: false, lineNames: ["Doliprane 1000 mg"], findings: [], advice: [], basketIds: new Set<string>(), hasSale: true, look: null, canDecide: true, onSold: () => undefined, onNotSold: () => undefined, onReopen: () => undefined, onFinish: () => undefined };
    return inSpace(robotHere, createElement(SaleIsland, props));
  };

  it("ailleurs : elle joue la vente", async () => {
    expect(await sale(true)).toContain("ILE-DE-VENTE");
    expect(mocks.counterIsland).toHaveBeenCalledTimes(1);
  });

  it("sur le PC du comptoir : le logiciel installé la joue déjà, elle ne la rejoue pas", async () => {
    expect(await sale(false)).toBe("");
    expect(mocks.counterIsland).not.toHaveBeenCalled();
  });
});
