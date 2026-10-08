import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { DepositView } from "@/core/stock-deposit/types";

/**
 * La page « Mettre à jour mon stock », rendue côté serveur sans base ni
 * navigateur : l'état en haut, le parcours en trois étapes (choisir, vérifier,
 * confirmer), les derniers envois. Services simulés ; on lit le texte rendu,
 * pas le balisage.
 */

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  findPharmacy: vi.fn(),
  listPharmacyDeposits: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ push: vi.fn() }) }));
vi.mock("@/server/auth/session", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/server/db/client", () => ({ prisma: { pharmacy: { findUnique: mocks.findPharmacy } } }));
vi.mock("@/server/services/stock-deposits", () => ({ listPharmacyDeposits: mocks.listPharmacyDeposits }));
vi.mock("@/server/actions/stock-deposits", () => ({ sendStockAction: vi.fn(), previewStockAction: vi.fn() }));

const { default: StockUpdatePage } = await import("../page");
const { PERMISSIONS } = await import("@/server/rbac/permissions");

const NOW = new Date("2026-10-05T10:00:00Z"); // 12:00 à Paris
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(NOW.getTime() - ms);

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/[\s\u00a0\u202f]+/g, " ")
    .trim();
const render = async () => renderToStaticMarkup(await StockUpdatePage());

const deposit = (overrides: Partial<DepositView> = {}): DepositView => ({
  id: "d1",
  pharmacyId: "ph-1",
  fileName: "inventaire.pdf",
  fileSize: 1000,
  status: "APPLIED",
  source: "AGENT",
  lines: 4235,
  created: 12,
  updated: 4190,
  invalid: 0,
  zeroed: 0,
  knownLines: 4200,
  message: null,
  receivedAt: new Date("2026-10-05T06:42:00Z"),
  appliedAt: new Date("2026-10-05T06:42:03Z"),
  decidedAt: null,
  hasFile: true,
  stalled: false,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  mocks.requirePermission.mockResolvedValue({ scope: { pharmacyId: "ph-1", userId: "u-1" }, pharmacy: { isDemo: false } });
  mocks.findPharmacy.mockResolvedValue({ stockSyncedAt: new Date("2026-10-05T06:42:00Z") });
  mocks.listPharmacyDeposits.mockResolvedValue([deposit()]);
});

afterEach(() => vi.useRealTimers());

describe("l'accès", () => {
  it("exige la permission du titulaire avant de lire quoi que ce soit", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("403"));
    await expect(render()).rejects.toThrow("403");
    expect(mocks.requirePermission).toHaveBeenCalledWith(PERMISSIONS.PRODUCT_IMPORT);
    expect(mocks.findPharmacy).not.toHaveBeenCalled();
    expect(mocks.listPharmacyDeposits).not.toHaveBeenCalled();
  });

  it("ne lit que l'officine de la session : cinq derniers envois et date du stock", async () => {
    await render();
    expect(mocks.findPharmacy).toHaveBeenCalledWith({ where: { id: "ph-1" }, select: { stockSyncedAt: true } });
    expect(mocks.listPharmacyDeposits).toHaveBeenCalledWith("ph-1", 5);
  });
});

describe("l'état du stock, en haut", () => {
  it("à jour : « reçu aujourd'hui à 08:42 (4 235 lignes) »", async () => {
    const t = text(await render());
    expect(t).toContain("Mettre à jour mon stock");
    expect(t).toContain("Votre stock est à jour");
    expect(t).toContain("Reçu aujourd'hui à 08:42 (4 235 lignes)");
  });

  it("ancien : « votre stock date de 5 jours »", async () => {
    mocks.findPharmacy.mockResolvedValue({ stockSyncedAt: ago(5 * DAY) });
    mocks.listPharmacyDeposits.mockResolvedValue([deposit({ receivedAt: ago(5 * DAY), appliedAt: ago(5 * DAY) })]);
    const t = text(await render());
    expect(t).toContain("Votre stock date de 5 jours");
    expect(t).not.toContain("Votre stock est à jour");
  });

  it("jamais reçu : « aucun stock reçu pour l'instant », et aucun envoi listé", async () => {
    mocks.findPharmacy.mockResolvedValue({ stockSyncedAt: null });
    mocks.listPharmacyDeposits.mockResolvedValue([]);
    const t = text(await render());
    expect(t).toContain("Aucun stock reçu pour l'instant");
    expect(t).toContain("Aucun fichier reçu pour l'instant.");
  });

  it("une officine introuvable n'invente rien : « aucun stock reçu »", async () => {
    mocks.findPharmacy.mockResolvedValue(null);
    mocks.listPharmacyDeposits.mockResolvedValue([]);
    expect(text(await render())).toContain("Aucun stock reçu pour l'instant");
  });
});

describe("le parcours en trois étapes", () => {
  it("annonce choisir, vérifier, confirmer, et ouvre sur le choix du fichier avec UN seul bouton vert", async () => {
    const html = await render();
    const t = text(html);
    expect(t).toContain("Choisir le fichier");
    expect(t).toContain("Vérifier");
    expect(t).toContain("Confirmer");
    expect(t).toContain("Choisissez le fichier de votre stock");
    expect(t).toContain("Choisir mon fichier");
    expect(t).toContain("Comment récupérer mon stock dans LGPI ?");
    expect(html).toContain("/connexion/guide?logiciel=lgpi");
    // Rien ne s'applique à ce stade : pas de bouton de confirmation avant d'avoir vérifié le fichier.
    expect(t).not.toContain("Confirmer la mise à jour");
  });

  it("ne montre plus ni dossier, ni chemin réseau, ni réglage du serveur", async () => {
    const t = text(await render());
    expect(t).not.toMatch(/dossier PharmaBoost|\\\\|raccourci|serveur de l'officine|PowerShell/i);
  });
});

describe("un fichier qui attend, ou qui n'a pas pu être lu", () => {
  it("en vérification : la phrase pour le titulaire, jamais la raison de la console", async () => {
    mocks.listPharmacyDeposits.mockResolvedValue([deposit({ status: "HELD", lines: 12, appliedAt: null, message: "Le fichier contient 12 lignes valides, alors que le stock de l'officine en compte 4200." })]);
    const t = text(await render());
    expect(t).toContain("Votre dernier fichier est en vérification");
    expect(t).toContain("L'équipe PharmaBoost vérifie votre fichier avant de l'appliquer : votre stock n'a pas changé. Si c'était un fichier partiel, envoyez votre stock complet, pas seulement les nouveautés.");
    expect(t).not.toContain("alors que le stock de l'officine en compte");
    expect(t).toContain("En vérification par l'équipe PharmaBoost");
  });

  it("non lu : la raison, le stock inchangé, l'équipe prévenue", async () => {
    mocks.listPharmacyDeposits.mockResolvedValue([deposit({ status: "FAILED", lines: null, appliedAt: null, message: "Colonnes non reconnues : quantité." })]);
    const t = text(await render());
    expect(t).toContain("Votre dernier fichier n'a pas pu être lu");
    expect(t).toContain("Colonnes non reconnues : quantité. Votre stock n'a pas changé. L'équipe PharmaBoost est prévenue.");
  });

  it("écarté : une alerte neutre — l'équipe n'a pas appliqué le fichier, le stock n'a pas changé", async () => {
    mocks.listPharmacyDeposits.mockResolvedValue([deposit({ status: "REJECTED", lines: null, appliedAt: null })]);
    const t = text(await render());
    expect(t).toContain("Votre dernier fichier n'a pas été appliqué");
    expect(t).toContain("L'équipe PharmaBoost n'a pas appliqué votre dernier fichier. Votre stock n'a pas changé. Envoyez votre stock complet.");
    expect(t).toContain("Écarté par l'équipe PharmaBoost.");
    expect(t).not.toContain("Votre dernier fichier n'a pas pu être lu");
    expect(t).not.toContain("Votre dernier fichier est en vérification");
  });

  it("un dernier envoi réussi n'a aucune de ces alertes", async () => {
    const t = text(await render());
    expect(t).not.toContain("n'a pas été appliqué");
    expect(t).not.toContain("interrompue");
  });

  it("une lecture restée bloquée : on le dit et on invite à renvoyer le fichier", async () => {
    mocks.listPharmacyDeposits.mockResolvedValue([deposit({ status: "RECEIVED", stalled: true, lines: null, appliedAt: null, receivedAt: ago(30 * 60_000) })]);
    const html = await render();
    const t = text(html);
    expect(t).toContain("La lecture de votre dernier fichier s'est interrompue");
    expect(t).toContain("Renvoyez votre fichier avec le parcours ci-dessous");
    expect(t).toContain("Lecture interrompue, renvoyez votre fichier.");
    expect(html).not.toContain("animate-spin");
  });

  it("un dernier envoi réussi efface l'alerte d'un ancien fichier en vérification", async () => {
    mocks.listPharmacyDeposits.mockResolvedValue([deposit({ id: "d2" }), deposit({ id: "d1", status: "HELD", appliedAt: null })]);
    expect(text(await render())).not.toContain("Votre dernier fichier est en vérification");
  });
});

describe("vos derniers envois", () => {
  it("la date, le fichier, le résultat en une ligne et la pastille d'état", async () => {
    mocks.listPharmacyDeposits.mockResolvedValue([
      deposit({ id: "d3", fileName: "inventaire.pdf" }),
      deposit({ id: "d2", fileName: "nouveautes.csv", status: "HELD", lines: 12, appliedAt: null, receivedAt: ago(DAY) }),
      deposit({ id: "d1", fileName: "vieux.csv", status: "REJECTED", appliedAt: null, receivedAt: ago(2 * DAY) }),
    ]);
    const t = text(await render());
    expect(t).toContain("Vos derniers envois");
    expect(t).toContain("inventaire.pdf");
    expect(t).toContain("Stock à jour");
    expect(t).toContain("4 235 lignes lues : 12 créées, 4 190 mises à jour.");
    expect(t).toContain("05/10/2026 08:42");
    expect(t).toContain("nouveautes.csv");
    expect(t).toContain("L'équipe PharmaBoost le vérifie avant de l'appliquer.");
    expect(t).toContain("vieux.csv");
    expect(t).toContain("Fichier écarté, stock inchangé");
  });
});

describe("le vocabulaire du titulaire", () => {
  it("jamais « agent », « appairage », « petit facteur », « CIP » ni « import job », dans aucun état", async () => {
    const scenarios: [string, () => void][] = [
      ["à jour", () => undefined],
      ["jamais reçu", () => {
        mocks.findPharmacy.mockResolvedValue({ stockSyncedAt: null });
        mocks.listPharmacyDeposits.mockResolvedValue([]);
      }],
      ["en vérification", () => mocks.listPharmacyDeposits.mockResolvedValue([deposit({ status: "HELD", message: "raison de la console" })])],
      ["non lu", () => mocks.listPharmacyDeposits.mockResolvedValue([deposit({ status: "FAILED", message: "Colonnes non reconnues : quantité." })])],
      ["écarté", () => mocks.listPharmacyDeposits.mockResolvedValue([deposit({ status: "REJECTED", message: "raison de la console" })])],
      ["lecture interrompue", () => mocks.listPharmacyDeposits.mockResolvedValue([deposit({ status: "RECEIVED", stalled: true, message: null })])],
    ];
    for (const [name, arrange] of scenarios) {
      vi.clearAllMocks();
      mocks.requirePermission.mockResolvedValue({ scope: { pharmacyId: "ph-1", userId: "u-1" }, pharmacy: { isDemo: false } });
      mocks.findPharmacy.mockResolvedValue({ stockSyncedAt: new Date("2026-10-05T06:42:00Z") });
      mocks.listPharmacyDeposits.mockResolvedValue([deposit()]);
      arrange();
      expect(text(await render()), name).not.toMatch(/\bagent\b|appairage|facteur|\bCIP\b|import job/i);
    }
  });
});
