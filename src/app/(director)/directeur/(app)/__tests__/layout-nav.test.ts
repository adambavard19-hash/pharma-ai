import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * La coquille de l'espace du directeur (en-tête, menu, compte) et son menu,
 * rendus côté serveur. La garde de session est celle du directeur, et elle seule.
 */

const mocks = vi.hoisted(() => ({ requireDirectorSession: vi.fn(), pathname: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ usePathname: mocks.pathname }));
vi.mock("@/server/auth/director-session", () => ({ requireDirectorSession: mocks.requireDirectorSession }));
vi.mock("@/server/actions/director-auth", () => ({ directorLogoutAction: vi.fn() }));

const layout = await import("../layout");
const { DirectorNav } = await import("../director-nav");

const SESSION = { director: { id: "dir_1", email: "camille@exemple.test", firstName: "Camille", lastName: "Roux", fullName: "Camille Roux", initials: "CR" }, sessionId: "s_1" };

const renderLayout = async () => renderToStaticMarkup((await layout.default({ children: "CONTENU-DE-LA-PAGE" })) as React.ReactElement);
const renderNav = (pathname: string) => {
  mocks.pathname.mockReturnValue(pathname);
  return renderToStaticMarkup(createElement(DirectorNav));
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireDirectorSession.mockResolvedValue(SESSION);
  mocks.pathname.mockReturnValue("/directeur");
});

describe("la coquille", () => {
  it("sans session de directeur : redirection, rien n'est rendu", async () => {
    mocks.requireDirectorSession.mockRejectedValue(new Error("NEXT_REDIRECT /directeur/connexion"));
    await expect(renderLayout()).rejects.toThrow("NEXT_REDIRECT /directeur/connexion");
  });

  it("un en-tête sobre « PharmaBoost · Direction commerciale », le contenu de la page, le menu", async () => {
    const html = await renderLayout();
    expect(html).toContain("PharmaBoost · Direction commerciale");
    expect(html).toContain("CONTENU-DE-LA-PAGE");
    expect(html).toContain("<main");
    expect(html).toContain("Rubriques de l&#x27;espace");
    expect(html).toContain('href="/directeur"');
  });

  it("le menu du compte porte les initiales ; la déconnexion est un formulaire (le directeur et son e-mail n'apparaissent qu'une fois ouvert)", async () => {
    const html = await renderLayout();
    expect(html).toContain(">CR<");
    expect(html).not.toContain("camille@exemple.test");
    expect(html).toContain('aria-label="Mon compte"');
  });

  it("n'offre aucun lien vers la console, l'extranet ni l'application d'une officine", async () => {
    const html = await renderLayout();
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
    expect(hrefs.length).toBeGreaterThan(5);
    for (const href of hrefs) expect(href.startsWith("/directeur"), href).toBe(true);
    expect(html).not.toMatch(/recherche|search|patient|ordonnance/i);
  });

  it("n'est pas indexé", () => {
    expect(layout.metadata.robots).toMatchObject({ index: false, follow: false });
  });
});

describe("le menu", () => {
  it("six rubriques, dans l'ordre, sur grand écran comme sur téléphone", () => {
    const html = renderNav("/directeur");
    const labels = ["Tableau de bord", "Commerciaux", "Candidatures", "Commissions", "Factures", "Challenges"];
    const desktop = html.slice(0, html.indexOf("sm:hidden"));
    let last = -1;
    for (const label of labels) {
      const at = desktop.indexOf(`</svg>${label}</a>`);
      expect(at, label).toBeGreaterThan(last);
      last = at;
    }
  });

  it("souligne la page courante, une seule à la fois", () => {
    for (const [path, label] of [["/directeur", "Tableau de bord"], ["/directeur/commerciaux/nouveau", "Commerciaux"], ["/directeur/factures/abc", "Factures"], ["/directeur/challenges", "Challenges"]] as const) {
      const html = renderNav(path);
      const desktop = html.slice(0, html.indexOf("sm:hidden"));
      expect((desktop.match(/aria-current="page"/g) ?? []).length, path).toBe(1);
      expect(desktop, path).toMatch(new RegExp(`aria-current="page"[^>]*>(<svg[^>]*>.*?</svg>)${label}</a>`));
    }
  });

  it("sur téléphone : un seul bouton qui nomme la page courante, la liste est repliée", () => {
    const html = renderNav("/directeur/candidatures");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="director-menu"');
    const mobile = html.slice(html.indexOf("sm:hidden"));
    expect(mobile).toContain("Candidatures");
    expect(mobile).not.toContain('id="director-menu"');
    expect(mobile).not.toContain("Les personnes qui veulent rejoindre l");
  });

  it("hors du menu (page d'erreur), aucune rubrique n'est soulignée et le bouton dit « Menu »", () => {
    const html = renderNav("/directeur/inconnu-au-menu");
    expect(html).not.toContain('aria-current="page"');
    expect(html).toContain(">Menu<");
  });
});
