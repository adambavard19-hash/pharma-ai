import { describe, expect, it, vi } from "vitest";

/** « Mes comptoirs » a quitté le menu : ses anciennes adresses (liens d'e-mails, favoris) mènent à Paramètres → Postes du comptoir. */
const redirect = vi.fn((to: string) => {
  throw new Error(`REDIRECT ${to}`);
});
vi.mock("next/navigation", () => ({ redirect }));

describe("les anciennes adresses de « Mes comptoirs »", () => {
  it.each([
    ["/connexion", () => import("../../../connexion/page")],
    ["/installation", () => import("../../../installation/page")],
    ["/stock/connexion", () => import("../../../stock/connexion/page")],
  ])("%s redirige vers /parametres/postes", async (_, load) => {
    const page = (await load()).default as () => unknown;
    expect(() => page()).toThrow("REDIRECT /parametres/postes");
  });
});
