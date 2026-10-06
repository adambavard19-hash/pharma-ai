import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * La page « Stocks reçus » de la console, rendue côté serveur sans navigateur
 * ni base : services simulés, session console simulée. On lit le texte rendu,
 * pas le balisage.
 */

const mocks = vi.hoisted(() => ({
  requirePlatformSession: vi.fn(),
  consoleStockOverview: vi.fn(),
  countDepositsNeedingAttention: vi.fn(),
  listDepositsForConsole: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ push: vi.fn() }) }));
// La fenêtre de confirmation s'ouvre à la demande : seul son bouton d'ouverture compte ici.
vi.mock("@/components/ui/modal", () => ({ Modal: ({ open, children }: { open: boolean; children: ReactNode }) => (open ? createElement("div", null, children) : null) }));
vi.mock("@/server/auth/platform-session", () => ({ requirePlatformSession: mocks.requirePlatformSession }));
vi.mock("@/server/services/stock-deposits", () => ({ consoleStockOverview: mocks.consoleStockOverview, countDepositsNeedingAttention: mocks.countDepositsNeedingAttention, listDepositsForConsole: mocks.listDepositsForConsole }));
vi.mock("@/server/actions/admin-stock-deposits", () => ({ decideDepositAction: vi.fn(), retryDepositAction: vi.fn(), depositForPharmacyAction: vi.fn() }));

const page = await import("../page");
const status = await import("../_components/status");
const { describeDepositResult } = await import("@/core/stock-deposit/rules");

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/[\s  ]+/g, " ");

const render = async (query: Record<string, string | string[] | undefined> = {}) => renderToStaticMarkup((await page.default({ searchParams: Promise.resolve(query) })) as never);
const buttons = (html: string) => [...html.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((match) => text(match[1]).trim());

const NOW = new Date("2026-10-12T10:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

const stockRow = (overrides: Record<string, unknown> = {}) => ({
  pharmacyId: "ph_1",
  name: "Pharmacie du Parc",
  stockSyncedAt: daysAgo(1),
  lastDepositAt: daysAgo(1),
  lastSource: "AGENT",
  lines: 4235,
  connected: true,
  lgoLabel: "LGPI",
  ...overrides,
});

const deposit = (overrides: Record<string, unknown> = {}) => ({
  id: "dep_1",
  pharmacyId: "ph_1",
  pharmacyName: "Pharmacie du Parc",
  fileName: "inventaire.csv",
  fileSize: 412_000,
  status: "APPLIED",
  source: "WEB",
  lines: 4235,
  created: 12,
  updated: 4190,
  invalid: 0,
  zeroed: 33,
  knownLines: 4200,
  message: null,
  receivedAt: new Date("2026-10-12T08:42:00Z"),
  appliedAt: new Date("2026-10-12T08:42:30Z"),
  decidedAt: null,
  hasFile: true,
  stalled: false,
  ...overrides,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  mocks.requirePlatformSession.mockResolvedValue({ admin: { id: "adm_1" } });
  mocks.consoleStockOverview.mockResolvedValue([stockRow()]);
  mocks.countDepositsNeedingAttention.mockResolvedValue(0);
  mocks.listDepositsForConsole.mockResolvedValue([deposit()]);
});

describe("l'accès", () => {
  it("passe d'abord par la session console : sans session, aucune lecture", async () => {
    mocks.requirePlatformSession.mockRejectedValue(new Error("NEXT_REDIRECT /admin-connexion"));
    await expect(render()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.consoleStockOverview).not.toHaveBeenCalled();
    expect(mocks.countDepositsNeedingAttention).not.toHaveBeenCalled();
    expect(mocks.listDepositsForConsole).not.toHaveBeenCalled();
  });
});

describe("les trois blocs", () => {
  it("rend le bandeau de chiffres, le stock de chaque officine et les fichiers reçus", async () => {
    const content = text(await render());
    expect(content).toContain("Stocks reçus");
    expect(content).toContain("Reçus aujourd'hui");
    expect(content).toContain("À trancher");
    expect(content).toContain("Officines sans stock depuis 7 jours");
    expect(content).toContain("Stock de chaque officine");
    expect(content).toContain("Fichiers reçus");
  });

  it("le bandeau compte les fichiers du jour (heure de Paris), ceux à trancher et les officines au-delà de 7 jours", async () => {
    mocks.consoleStockOverview.mockResolvedValue([stockRow({ pharmacyId: "a", name: "A", stockSyncedAt: daysAgo(9) }), stockRow({ pharmacyId: "b", name: "B", stockSyncedAt: null, lines: null, lastSource: null }), stockRow({ pharmacyId: "c", name: "C", stockSyncedAt: daysAgo(1) })]);
    mocks.countDepositsNeedingAttention.mockResolvedValue(2);
    mocks.listDepositsForConsole.mockResolvedValue([
      deposit({ id: "d1", receivedAt: new Date("2026-10-12T07:00:00Z") }),
      deposit({ id: "d2", receivedAt: new Date("2026-10-12T08:00:00Z") }),
      // Hier soir, 23 h 30 à Paris : pas aujourd'hui.
      deposit({ id: "d3", receivedAt: new Date("2026-10-11T21:30:00Z") }),
    ]);
    const html = await render();
    const content = text(html);
    expect(content).toMatch(/Reçus aujourd'hui\s*2\b/);
    expect(content).toMatch(/À trancher\s*2\b/);
    expect(content).toMatch(/Officines sans stock depuis 7 jours\s*2\b/);
    expect(content).toContain("Dont 1 qui n'ont encore rien envoyé");
    // Chaque chiffre mène à ce qu'il compte.
    expect(html).toContain('href="/admin/depots-stock?etat=tous"');
    expect(html).toContain('href="/admin/depots-stock?etat=attention"');
    expect(html).toContain('href="#stock-par-officine"');
  });

  it("« À trancher » passe en orange et « sans stock » en rouge seulement s'ils dépassent zéro", async () => {
    const calm = await render();
    expect(calm).not.toContain("border-warning-100");
    expect(calm).not.toContain("border-danger-100");
    expect(text(calm)).toContain("Rien en attente");
    expect(text(calm)).toContain("Toutes les officines ont envoyé leur stock cette semaine");

    mocks.countDepositsNeedingAttention.mockResolvedValue(1);
    mocks.consoleStockOverview.mockResolvedValue([stockRow({ stockSyncedAt: daysAgo(8) })]);
    const alert = await render();
    expect(alert).toMatch(/border-warning-100[^"]*"[^>]*href="\/admin\/depots-stock\?etat=attention"/);
    expect(alert).toMatch(/border-danger-100[^"]*"[^>]*href="#stock-par-officine"/);
  });
});

describe("stock de chaque officine", () => {
  it("une ligne par officine, dans l'ordre du service (la plus ancienne d'abord), avec lien, fraîcheur, origine et lignes", async () => {
    mocks.consoleStockOverview.mockResolvedValue([
      stockRow({ pharmacyId: "old", name: "Pharmacie Ancienne", stockSyncedAt: daysAgo(10), lastSource: "WEB", lines: 1 }),
      stockRow({ pharmacyId: "mid", name: "Pharmacie Moyenne", stockSyncedAt: daysAgo(4), lastSource: "CONSOLE", lines: 980 }),
      stockRow({ pharmacyId: "new", name: "Pharmacie Récente", stockSyncedAt: daysAgo(0), lastSource: "AGENT", lines: 4235 }),
    ]);
    const html = await render();
    const content = text(html);
    expect(content.indexOf("Pharmacie Ancienne")).toBeLessThan(content.indexOf("Pharmacie Moyenne"));
    expect(content.indexOf("Pharmacie Moyenne")).toBeLessThan(content.indexOf("Pharmacie Récente"));
    for (const id of ["old", "mid", "new"]) expect(html).toContain(`href="/admin/pharmacies/${id}"`);
    // La pastille suit les seuils du rappel : 3 jours et 7 jours.
    expect(content).toContain("Trop ancien");
    expect(content).toContain("À rafraîchir");
    expect(content).toContain("À jour");
    // Origine du dernier envoi et nombre de lignes.
    expect(content).toContain("Envoyé par le titulaire");
    expect(content).toContain("Déposé par l'équipe");
    expect(content).toContain("Dossier PharmaBoost (petit facteur)");
    expect(content).toContain("1 ligne");
    expect(content).not.toContain("1 lignes");
    expect(content).toContain("4 235 lignes");
    // Un seul geste par officine.
    expect(buttons(html).filter((label) => label === "Déposer son stock")).toHaveLength(3);
  });

  it("une officine qui n'a jamais rien envoyé est rouge, sans origine ni nombre de lignes inventés", async () => {
    mocks.consoleStockOverview.mockResolvedValue([stockRow({ stockSyncedAt: null, lastDepositAt: null, lastSource: null, lines: null, connected: false, lgoLabel: null })]);
    const content = text(await render());
    expect(content).toContain("Jamais reçu");
    expect(content).toContain("Aucun stock reçu");
    expect(content).toContain("Aucun envoi");
    expect(content).toContain("Dossier PharmaBoost non relié");
  });

  it("dit si le dossier PharmaBoost est relié, et pour quel logiciel", async () => {
    expect(text(await render())).toContain("Dossier PharmaBoost relié · LGPI");
  });

  it("un stock reçu sans dépôt suivi (import classique, ancienne liaison) n'est pas présenté comme « aucun envoi »", async () => {
    mocks.consoleStockOverview.mockResolvedValue([stockRow({ lastDepositAt: null, lastSource: null, lines: null })]);
    const content = text(await render());
    expect(content).toContain("Autre import");
    expect(content).not.toContain("Aucun envoi");
  });

  it("état vide honnête quand il n'y a aucune officine active", async () => {
    mocks.consoleStockOverview.mockResolvedValue([]);
    const content = text(await render());
    expect(content).toContain("Aucune officine cliente pour l'instant");
    expect(content).not.toContain("Déposer son stock");
  });
});

describe("fichiers reçus", () => {
  it("sans filtre, ouvre sur « Tous » quand rien n'attend l'équipe", async () => {
    await render();
    expect(mocks.listDepositsForConsole).toHaveBeenCalledTimes(1);
    expect(mocks.listDepositsForConsole).toHaveBeenCalledWith({ limit: 100 });
  });

  it("sans filtre, ouvre sur « À trancher » quand des fichiers attendent, et les lit à part des 100 derniers", async () => {
    mocks.countDepositsNeedingAttention.mockResolvedValue(1);
    mocks.listDepositsForConsole.mockImplementation(async (filter?: { status?: string }) => (filter?.status === "ATTENTION" ? [deposit({ id: "held", status: "HELD", fileName: "nouveautes.csv", message: "Le fichier contient 12 lignes valides." })] : [deposit({ id: "ok", fileName: "complet.csv" })]));
    const content = text(await render());
    expect(mocks.listDepositsForConsole).toHaveBeenCalledWith({ status: "ATTENTION", limit: 100 });
    expect(content).toContain("nouveautes.csv");
    expect(content).not.toContain("complet.csv");
  });

  it("?etat=tous montre tous les fichiers, même quand certains attendent", async () => {
    mocks.countDepositsNeedingAttention.mockResolvedValue(1);
    mocks.listDepositsForConsole.mockResolvedValue([deposit({ id: "ok", fileName: "complet.csv" }), deposit({ id: "held", status: "HELD", fileName: "nouveautes.csv" })]);
    const content = text(await render({ etat: "tous" }));
    expect(content).toContain("complet.csv");
    expect(content).toContain("nouveautes.csv");
    expect(mocks.listDepositsForConsole).not.toHaveBeenCalledWith(expect.objectContaining({ status: "ATTENTION" }));
  });

  it("?etat=attention force « À trancher », une valeur inconnue retombe sur le choix par défaut", async () => {
    mocks.listDepositsForConsole.mockResolvedValue([]);
    await render({ etat: "attention" });
    expect(mocks.listDepositsForConsole).toHaveBeenCalledWith({ status: "ATTENTION", limit: 100 });
    mocks.listDepositsForConsole.mockClear();
    await render({ etat: "n-importe-quoi" });
    expect(mocks.listDepositsForConsole).toHaveBeenCalledTimes(1);
    expect(mocks.listDepositsForConsole).toHaveBeenCalledWith({ limit: 100 });
  });

  it("les pastilles de filtre portent le nombre de fichiers à trancher et gardent le filtre courant", async () => {
    mocks.countDepositsNeedingAttention.mockResolvedValue(3);
    const html = await render({ etat: "tous" });
    expect(text(html)).toMatch(/À trancher\s*3\b/);
    expect(html).toMatch(/aria-current="true"[^>]*href="\/admin\/depots-stock\?etat=tous"|href="\/admin\/depots-stock\?etat=tous"[^>]*aria-current="true"/);
  });

  it("chaque fichier montre sa date, l'officine (lien), le fichier à télécharger, l'origine, le résultat et la pastille", async () => {
    mocks.listDepositsForConsole.mockResolvedValue([deposit()]);
    const html = await render();
    const content = text(html);
    expect(content).toContain("12/10/2026 10:42");
    expect(content).toContain("Pharmacie du Parc");
    expect(html).toContain('href="/admin/pharmacies/ph_1"');
    expect(html).toContain('href="/api/admin/depots-stock/dep_1/fichier"');
    expect(content).toContain("inventaire.csv");
    expect(content).toContain("402 Ko");
    expect(content).toContain("Envoyé par le titulaire");
    // Le détail vient des règles du lot (leurs mots peuvent évoluer) : on vérifie qu'il est montré tel qu'elles le disent, avec ses chiffres.
    const result = text(describeDepositResult(deposit())).trim();
    expect(result).toContain("4 235 lignes lues : 12 créées, 4 190 mises à jour");
    expect(result).toContain("33");
    expect(content).toContain(result);
    expect(content).toContain("Appliqué");
  });

  it("un fichier purgé n'a plus de lien de téléchargement et le dit", async () => {
    mocks.listDepositsForConsole.mockResolvedValue([deposit({ hasFile: false })]);
    const html = await render();
    expect(html).not.toContain("/api/admin/depots-stock/dep_1/fichier");
    expect(text(html)).toContain("fichier supprimé (gardé 90 jours)");
  });

  it("un fichier en attente (HELD) propose exactement trois gestes, et l'aide dit quand choisir le deuxième", async () => {
    mocks.countDepositsNeedingAttention.mockResolvedValue(1);
    mocks.listDepositsForConsole.mockResolvedValue([deposit({ status: "HELD", lines: 12, created: null, updated: null, zeroed: null, message: "Le fichier contient 12 lignes valides, alors que le stock de l'officine en compte 4200. Il n'a pas été appliqué : est-ce un stock complet ?" })]);
    const html = await render({ etat: "attention" });
    const content = text(html);
    const labels = buttons(html).filter((label) => label !== "Déposer son stock");
    expect(labels).toEqual(["Appliquer (stock complet)", "Appliquer sans remettre à zéro", "Écarter"]);
    expect(content).toContain("à choisir si le fichier ne contient que les nouveautés");
    expect(content).toContain("À trancher");
    expect(content).toContain("Il n'a pas été appliqué : est-ce un stock complet ?");
    expect(content).not.toContain("Relancer");
  });

  it("un fichier en échec (FAILED) propose « Relancer » et montre pourquoi", async () => {
    mocks.countDepositsNeedingAttention.mockResolvedValue(1);
    mocks.listDepositsForConsole.mockResolvedValue([deposit({ status: "FAILED", lines: null, created: null, updated: null, zeroed: null, message: "Colonnes non reconnues : quantité." })]);
    const html = await render({ etat: "attention" });
    const content = text(html);
    expect(buttons(html).filter((label) => label !== "Déposer son stock")).toEqual(["Relancer"]);
    expect(content).toContain("En échec");
    expect(content).toContain("Colonnes non reconnues : quantité.");
    expect(content).not.toContain("Appliquer (stock complet)");
  });

  it("un fichier « en cours » depuis trop longtemps (stalled) n'est plus « en cours » : il propose « Relancer » comme un fichier en échec", async () => {
    mocks.countDepositsNeedingAttention.mockResolvedValue(1);
    mocks.listDepositsForConsole.mockResolvedValue([deposit({ status: "RECEIVED", stalled: true, lines: null, created: null, updated: null, zeroed: null, appliedAt: null, message: null, fileName: "gros-inventaire.pdf" })]);
    const html = await render({ etat: "attention" });
    const content = text(html);
    expect(buttons(html).filter((label) => label !== "Déposer son stock")).toEqual(["Relancer"]);
    expect(content).toContain("Lecture interrompue");
    expect(content).not.toContain("En cours");
    expect(content).toContain("La lecture de ce fichier s'est arrêtée avant la fin");
    expect(content).not.toContain("Appliquer (stock complet)");
  });

  it("un stalled qui porte déjà un message (posé par le traitement) montre ce message, pas un second texte", async () => {
    mocks.listDepositsForConsole.mockResolvedValue([deposit({ status: "RECEIVED", stalled: true, lines: null, message: "Le traitement a été interrompu avant la fin. Le stock n'a pas changé : renvoyez le fichier." })]);
    const content = text(await render({ etat: "tous" }));
    expect(content).toContain("Le traitement a été interrompu avant la fin. Le stock n'a pas changé : renvoyez le fichier.");
    expect(content).not.toContain("La lecture de ce fichier s'est arrêtée");
  });

  it("un fichier « en cours » depuis peu (pas stalled) reste « En cours » et n'a aucun geste : on laisse la lecture finir", async () => {
    mocks.listDepositsForConsole.mockResolvedValue([deposit({ status: "RECEIVED", stalled: false, lines: null, appliedAt: null })]);
    const html = await render({ etat: "tous" });
    expect(text(html)).toContain("En cours");
    expect(text(html)).not.toContain("Lecture interrompue");
    expect(buttons(html).filter((label) => label !== "Déposer son stock")).toEqual([]);
  });

  it("un fichier appliqué ou écarté n'a aucun geste", async () => {
    mocks.listDepositsForConsole.mockResolvedValue([deposit({ id: "a" }), deposit({ id: "r", status: "REJECTED", fileName: "ecarte.csv" })]);
    const html = await render({ etat: "tous" });
    expect(buttons(html).filter((label) => label !== "Déposer son stock")).toEqual([]);
    expect(text(html)).toContain("Écarté");
  });

  it("une officine supprimée est dite telle quelle, sans lien", async () => {
    mocks.listDepositsForConsole.mockResolvedValue([deposit({ pharmacyName: undefined })]);
    expect(text(await render())).toContain("Officine supprimée");
  });

  it("état vide honnête : aucun stock reçu pour l'instant", async () => {
    mocks.listDepositsForConsole.mockResolvedValue([]);
    const content = text(await render());
    expect(content).toContain("Aucun stock reçu pour l'instant");
  });

  it("rien à trancher : on le dit, sans prétendre qu'aucun fichier n'a jamais été reçu, et on propose de tout voir", async () => {
    mocks.listDepositsForConsole.mockImplementation(async (filter?: { status?: string }) => (filter?.status === "ATTENTION" ? [] : [deposit()]));
    const html = await render({ etat: "attention" });
    const content = text(html);
    expect(content).toContain("Rien à trancher");
    expect(content).not.toContain("Aucun stock reçu pour l'instant");
    expect(content).toContain("Voir tous les fichiers");
    expect(html).toContain('href="/admin/depots-stock?etat=tous"');
  });

  it("annonce « 100+ » quand les 100 derniers fichiers sont tous d'aujourd'hui", async () => {
    mocks.listDepositsForConsole.mockResolvedValue(Array.from({ length: 100 }, (_, index) => deposit({ id: `d${index}`, receivedAt: new Date("2026-10-12T08:00:00Z") })));
    expect(text(await render())).toMatch(/Reçus aujourd'hui\s*100\+/);
  });
});

describe("les aides de la page", () => {
  it("la fraîcheur suit les seuils du rappel du titulaire (3 et 7 jours)", () => {
    expect(status.stockFreshness(daysAgo(0), NOW)).toEqual({ tone: "success", label: "À jour" });
    expect(status.stockFreshness(daysAgo(2), NOW)).toEqual({ tone: "success", label: "À jour" });
    expect(status.stockFreshness(daysAgo(3), NOW)).toEqual({ tone: "warning", label: "À rafraîchir" });
    expect(status.stockFreshness(daysAgo(6), NOW)).toEqual({ tone: "warning", label: "À rafraîchir" });
    expect(status.stockFreshness(daysAgo(7), NOW)).toEqual({ tone: "danger", label: "Trop ancien" });
    expect(status.stockFreshness(null, NOW)).toEqual({ tone: "danger", label: "Jamais reçu" });
  });

  it("le filtre de l'adresse : valeurs connues respectées, sinon « À trancher » s'il y en a, « Tous » sinon", () => {
    expect(status.viewFromParam("tous", 5)).toBe("tous");
    expect(status.viewFromParam("attention", 0)).toBe("attention");
    expect(status.viewFromParam(null, 2)).toBe("attention");
    expect(status.viewFromParam(undefined, 0)).toBe("tous");
    expect(status.viewFromParam("autre", 1)).toBe("attention");
  });

  it("la pastille d'un fichier « en cours » devient « Lecture interrompue » (rouge) seulement s'il est stalled", () => {
    const render = (props: { status: "RECEIVED" | "APPLIED" | "FAILED"; stalled?: boolean }) => text(renderToStaticMarkup(createElement(status.DepositStatusBadge, props)));
    expect(render({ status: "RECEIVED" })).toContain("En cours");
    expect(render({ status: "RECEIVED", stalled: false })).toContain("En cours");
    expect(render({ status: "RECEIVED", stalled: true })).toContain("Lecture interrompue");
    // Un autre état garde sa pastille, même si le drapeau était posé par erreur.
    expect(render({ status: "APPLIED", stalled: true })).toContain("Appliqué");
    expect(render({ status: "FAILED", stalled: true })).toContain("En échec");
  });

  it("la taille d'un fichier est lisible", () => {
    expect(status.formatFileSize(900)).toBe("900 o");
    expect(status.formatFileSize(412_000)).toBe("402 Ko");
    expect(status.formatFileSize(1_258_291)).toBe("1,2 Mo");
    expect(status.formatFileSize(8 * 1024 * 1024)).toBe("8 Mo");
  });
});
