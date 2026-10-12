import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { personRobotLook } from "@/core/robot/counter-look";

/**
 * La coquille de l'espace pharmacie et le robot : sur le navigateur lié au poste du comptoir, où le logiciel PharmaBoost
 * installé dessine déjà le sien, l'espace n'en dessine pas un second — mais seul le DESSIN s'efface : l'île de l'en-tête
 * reste (sans robot), avec les alertes du robot, leurs gestes et la discussion ; aucun compagnon dans le coin ; le reste
 * de l'espace (menu, « Nouvelle vente », barre et île de vente) sait qu'il ne doit pas en dessiner. Ailleurs, tout est
 * comme avant, avec le robot de la PERSONNE. Les composants lourds sont remplacés par des témoins ; la décision est celle
 * du serveur (server/services/post-link.ts).
 */

const mocks = vi.hoisted(() => ({ requireSession: vi.fn(), thisPcComptoir: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/config/env", () => ({ patientDataEnabled: () => true }));
vi.mock("@/server/services/notifications", () => ({ countUnreadNotifications: async () => 0 }));
vi.mock("@/server/services/support", () => ({ countPharmacyUnread: async () => 0 }));
vi.mock("@/server/services/pharmacy-assistant/viewer", () => ({ viewersOf: () => ({ viewer: {} }) }));
vi.mock("@/core/pharmacy-assistant/assistant", () => ({ pharmacySuggestions: () => [] }));
vi.mock("@/server/rbac/permissions", () => ({ PERMISSIONS: { PRODUCT_IMPORT: "product:import", PRESCRIPTION_CREATE: "prescription:create" } }));
vi.mock("@/server/services/post-link", () => ({ thisPcComptoir: mocks.thisPcComptoir, NOT_LINKED: { postId: null, robotOnPost: false } }));
vi.mock("@/components/robot/robot-alerts", () => ({ RobotAlertsProvider: ({ children }: { children: ReactNode }) => createElement("div", { "data-temoin": "ALERTES-DU-ROBOT" }, children) }));
vi.mock("@/components/island/platform-island", () => ({ IslandSlotProvider: ({ children }: { children: ReactNode }) => children }));
// L'île témoin dit ce qu'elle lit, comme la vraie (app-island.tsx) : avec ou sans le dessin du robot.
vi.mock("@/components/island/app-island", async () => {
  const { useRobotInBrowser } = await import("@/components/robot/robot-presence");
  return { AppIsland: () => createElement("div", null, useRobotInBrowser() ? "ILE-DE-L-ESPACE AVEC-ROBOT" : "ILE-DE-L-ESPACE SANS-ROBOT") };
});
vi.mock("@/components/robot/app-companion", () => ({ AppRobotCompanion: () => createElement("div", null, "ROBOT-DU-COIN") }));
vi.mock("@/components/app/topbar", () => ({
  Topbar: ({ island }: { island?: ReactNode }) => createElement("header", null, island ?? "BANNIERE-SANS-ILE"),
}));
// Le menu témoin dit ce que le reste de l'espace lit : faut-il dessiner le robot, et lequel ?
vi.mock("@/components/app/sidebar", async () => {
  const { useRobotInBrowser } = await import("@/components/robot/robot-presence");
  const { useCounterLook } = await import("@/components/robot/counter-look-context");
  return { Sidebar: () => createElement("nav", null, `${useRobotInBrowser() ? "MENU-AVEC-ROBOT" : "MENU-SANS-ROBOT"} ROBOT-N-${useCounterLook()?.look ?? "MARQUE"}`) };
});

const layout = await import("../layout");

const SESSION = {
  scope: { pharmacyId: "ph_port", organizationId: "org_1", userId: "u_1" },
  pharmacy: { id: "ph_port", name: "Pharmacie du Port" },
  permissions: new Set<string>(["prescription:create"]),
};

const renderLayout = async () => renderToStaticMarkup((await layout.default({ children: "CONTENU-DE-LA-PAGE" })) as React.ReactElement);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireSession.mockResolvedValue(SESSION);
});

describe("1 robot pour 1 espace", () => {
  it("ailleurs (PC du bureau sans logiciel, Mac, téléphone) : l'île, le compagnon et le robot du menu, comme avant", async () => {
    mocks.thisPcComptoir.mockResolvedValue({ postId: null, robotOnPost: false });
    const html = await renderLayout();
    expect(html).toContain("ILE-DE-L-ESPACE AVEC-ROBOT");
    expect(html).toContain("ROBOT-DU-COIN");
    expect(html).toContain("MENU-AVEC-ROBOT");
    expect(html).toContain("ALERTES-DU-ROBOT");
    expect(html).toContain("CONTENU-DE-LA-PAGE");
  });

  it("sur le navigateur lié au poste qui dessine le robot : l'île reste SANS robot (alertes, discussion), ni compagnon ni robot du menu", async () => {
    mocks.thisPcComptoir.mockResolvedValue({ postId: "post_1", robotOnPost: true });
    const html = await renderLayout();
    // Les alertes du robot (paiement, demandes d'accès, primes) et la discussion ne se lisent que dans l'île : elle reste.
    expect(html).toContain("ILE-DE-L-ESPACE SANS-ROBOT");
    expect(html).not.toContain("BANNIERE-SANS-ILE");
    expect(html).toContain("ALERTES-DU-ROBOT");
    expect(html).not.toContain("ROBOT-DU-COIN");
    expect(html).toContain("MENU-SANS-ROBOT");
    expect(html).toContain("CONTENU-DE-LA-PAGE");
  });

  it("la décision (et l'attribution du poste lié) est prise pour la pharmacie ET la personne de la session", async () => {
    mocks.thisPcComptoir.mockResolvedValue({ postId: null, robotOnPost: false });
    await renderLayout();
    expect(mocks.thisPcComptoir).toHaveBeenCalledWith("ph_port", "u_1", true);
    // Quelqu'un qui ne prend pas les ventes (consultation) ne prend jamais un comptoir.
    mocks.requireSession.mockResolvedValue({ ...SESSION, permissions: new Set<string>() });
    await renderLayout();
    expect(mocks.thisPcComptoir).toHaveBeenLastCalledWith("ph_port", "u_1", false);
  });

  it("le robot dessiné est celui de la PERSONNE connectée, toujours le même pour elle, jamais celui d'un comptoir", async () => {
    mocks.thisPcComptoir.mockResolvedValue({ postId: null, robotOnPost: false });
    expect(await renderLayout()).toContain(`ROBOT-N-${personRobotLook("u_1")}`);
    mocks.requireSession.mockResolvedValue({ ...SESSION, scope: { ...SESSION.scope, userId: "u_2" } });
    expect(await renderLayout()).toContain(`ROBOT-N-${personRobotLook("u_2")}`);
  });

  it("une décision impossible (erreur) garde le robot : la page ne casse jamais pour ça", async () => {
    mocks.thisPcComptoir.mockRejectedValue(new Error("base indisponible"));
    const html = await renderLayout();
    expect(html).toContain("ILE-DE-L-ESPACE AVEC-ROBOT");
    expect(html).toContain("ROBOT-DU-COIN");
  });
});
