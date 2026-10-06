import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * « Installation sous AnyDesk » sur la fiche officine : l'état en trois lignes
 * (serveur, postes, stock), puis les deux gestes. Rendu côté serveur, service
 * et actions simulés : le panneau montre des états, jamais un code.
 */

const mocks = vi.hoisted(() => ({ pharmacyInstallState: vi.fn(), prepareInstallationAction: vi.fn(), preparePostInstallAction: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/admin/pharmacies/ph_1", useSearchParams: () => new URLSearchParams() }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ push: vi.fn() }) }));
vi.mock("@/server/actions/admin-install", () => ({ prepareInstallationAction: mocks.prepareInstallationAction, preparePostInstallAction: mocks.preparePostInstallAction }));
vi.mock("@/server/services/stock-sync", () => ({ pharmacyInstallState: mocks.pharmacyInstallState }));

const { InstallPanel, InstallPanelView } = await import("../install-panel");

const NOW = new Date("2026-10-06T09:00:00.000Z");
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 3_600_000);

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/[\s  ]+/g, " ")
    // Les balises retirées laissent une espace avant la ponctuation : on la recolle.
    .replace(/ ([.,)])/g, "$1");

const state = (overrides: Record<string, unknown> = {}) => ({ server: null, posts: [], stockSyncedAt: null, ...overrides });
const linkedServer = (overrides: Record<string, unknown> = {}) => ({ lgo: "lgpi", lgoLabel: "LGPI", hostname: "SRV-PHARMA", linked: true, pairedAt: new Date("2026-10-03T08:00:00.000Z"), lastSeenAt: minutesAgo(2), codeValidUntil: null, ...overrides });
const render = (value: unknown) => renderToStaticMarkup(createElement(InstallPanelView as never, { pharmacyId: "ph_1", state: value } as never));

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("le panneau d'installation : les états", () => {
  it("officine neuve : serveur pas relié, aucun poste, aucun stock, et les deux gestes sont là", () => {
    const html = text(render(state()));
    expect(html).toContain("Installation sous AnyDesk");
    expect(html).toContain("Serveur pas encore relié.");
    expect(html).toContain("Aucun poste relié.");
    expect(html).toContain("Stock : aucun fichier reçu pour l'instant.");
    expect(html).toContain("Préparer l'installation du serveur");
    expect(html).toContain("Ajouter un poste");
    expect(html).toContain("Nom du poste");
  });

  it("serveur relié : depuis le jour du lien, avec le dernier signe de vie et le nom de la machine", () => {
    const html = text(render(state({ server: linkedServer() })));
    expect(html).toContain("Serveur relié (SRV-PHARMA) depuis le 3 oct. — dernier signe il y a 2 minutes.");
    expect(html).not.toContain("Serveur pas encore relié");
  });

  it("serveur relié sans nom de machine ni signe de vie : une phrase honnête", () => {
    const html = text(render(state({ server: linkedServer({ hostname: null, lastSeenAt: null }) })));
    expect(html).toContain("Serveur relié depuis le 3 oct. — dernier signe jamais.");
  });

  it("un code émis et pas encore utilisé : la ligne d'état ne promet pas une ligne à recopier, et la phrase sous le bouton dit quoi faire", () => {
    const html = text(render(state({ server: { lgo: "lgpi", lgoLabel: "LGPI", hostname: null, linked: false, pairedAt: null, lastSeenAt: null, codeValidUntil: new Date("2026-10-06T10:00:00.000Z") } })));
    // Après un rechargement la commande n'existe plus à l'écran (le code n'est gardé nulle part) : ne pas laisser croire qu'elle y est.
    expect(html).toContain("Serveur pas encore relié.");
    expect(html).not.toMatch(/ligne prête|valable jusqu'à/);
    expect(html).toContain("Une ligne a été préparée mais n'est plus affichée : cliquez de nouveau sur Préparer l'installation du serveur.");
    // Le bouton annoncé existe bien, juste au-dessus de la phrase.
    expect(html.indexOf("Préparer l'installation du serveur")).toBeLessThan(html.indexOf("Une ligne a été préparée"));
  });

  it("sans code en attente (jamais préparé, périmé, déjà utilisé), la phrase n'apparaît pas", () => {
    for (const server of [null, linkedServer(), { lgo: "lgpi", lgoLabel: "LGPI", hostname: null, linked: false, pairedAt: null, lastSeenAt: null, codeValidUntil: null }]) {
      expect(text(render(state({ server })))).not.toContain("n'est plus affichée");
    }
  });

  it("une liaison connue mais sans code ni appairage (créée à l'inscription) : « pas encore relié »", () => {
    const html = text(render(state({ server: { lgo: "winpharma", lgoLabel: "Winpharma", hostname: null, linked: false, pairedAt: null, lastSeenAt: null, codeValidUntil: null } })));
    expect(html).toContain("Serveur pas encore relié.");
    expect(html).not.toContain("ligne prête");
  });

  it("serveur déconnecté : on le dit, et on propose de repartir", () => {
    const html = text(render(state({ server: linkedServer({ linked: false }) })));
    expect(html).toContain("Serveur déconnecté");
    expect(html).toContain("Préparez une nouvelle installation");
  });

  it("postes reliés : leur nom et leur dernier signe ; un poste dont la ligne est prête est dit en attente", () => {
    const html = text(
      render(
        state({
          posts: [
            { id: "p1", label: "Comptoir 1", hostname: "POSTE1", linked: true, pairedAt: daysAgo(2), lastSeenAt: minutesAgo(3), linkValidUntil: null },
            { id: "p2", label: null, hostname: "POSTE2", linked: true, pairedAt: daysAgo(2), lastSeenAt: null, linkValidUntil: null },
            { id: "p3", label: "Comptoir 3", hostname: "", linked: false, pairedAt: null, lastSeenAt: null, linkValidUntil: new Date("2026-10-13T09:00:00.000Z") },
            // Un lien expiré, jamais utilisé, n'encombre pas la liste.
            { id: "p4", label: "Fantôme", hostname: "", linked: false, pairedAt: null, lastSeenAt: null, linkValidUntil: null },
          ],
        }),
      ),
    );
    expect(html).toContain("Postes : Comptoir 1 (vu il y a 3 minutes), POSTE2 (vu jamais), Comptoir 3 (ligne prête jusqu'à");
    expect(html).not.toContain("Fantôme");
    expect(html).not.toContain("Aucun poste relié");
  });

  it("une liste de postes longue reste courte : cinq noms, puis « et N autres »", () => {
    const posts = Array.from({ length: 8 }, (_, index) => ({ id: `p${index}`, label: `Poste ${index + 1}`, hostname: "", linked: true, pairedAt: daysAgo(1), lastSeenAt: minutesAgo(1), linkValidUntil: null }));
    const html = text(render(state({ posts })));
    expect(html).toContain("Poste 5");
    expect(html).not.toContain("Poste 6");
    expect(html).toContain("et 3 autres");
  });

  it("le dernier stock reçu, et le lien vers la liste des stocks reçus de l'équipe", () => {
    const html = render(state({ stockSyncedAt: daysAgo(4) }));
    expect(text(html)).toContain("Stock : dernier fichier reçu il y a 4 jours.");
    expect(html).toContain('href="/admin/depots-stock"');
    expect(text(html)).toContain("Voir les stocks reçus");
  });

  it("le logiciel proposé est celui de la liaison ; sans liaison, LGPI d'office (le seul dont la procédure est vérifiée)", () => {
    const withServer = render(state({ server: linkedServer({ lgo: "winpharma" }) }));
    expect(withServer).toMatch(/<option value="winpharma" selected="">Winpharma<\/option>/);
    const without = render(state());
    expect(without).toMatch(/<option value="lgpi" selected="">LGPI<\/option>/);
    expect(without).not.toMatch(/<option value="autre" selected/);
    // Les autres logiciels restent proposés.
    expect(without).toContain('<option value="autre">Autre logiciel</option>');
    expect(without).toContain('<option value="winpharma">Winpharma</option>');
  });

  it("une liaison déjà posée sur « Autre logiciel » garde ce choix : seul le cas sans liaison passe à LGPI", () => {
    const html = render(state({ server: { lgo: "autre", lgoLabel: "Autre logiciel", hostname: null, linked: false, pairedAt: null, lastSeenAt: null, codeValidUntil: null } }));
    expect(html).toMatch(/<option value="autre" selected="">Autre logiciel<\/option>/);
  });

  it("aucune commande, aucun code à l'affichage : ils n'existent qu'une fois demandés", () => {
    const html = render(state({ server: linkedServer() }));
    expect(html).not.toContain("irm ");
    expect(html).not.toContain("installer-serveur");
    expect(html).not.toContain("Copier la ligne");
  });
});

describe("InstallPanel : lit l'état de l'officine demandée", () => {
  it("appelle le service avec l'identifiant de l'officine et l'heure donnée", async () => {
    mocks.pharmacyInstallState.mockResolvedValue(state());
    const element = await (InstallPanel as unknown as (props: { pharmacyId: string; now: Date }) => Promise<{ props: Record<string, unknown> }>)({ pharmacyId: "ph_42", now: NOW });
    expect(mocks.pharmacyInstallState).toHaveBeenCalledWith("ph_42", NOW);
    expect(element.props.pharmacyId).toBe("ph_42");
    expect(element.props.state).toEqual(state());
  });
});
