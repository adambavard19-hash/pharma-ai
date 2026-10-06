import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { DepositView } from "@/core/stock-deposit/types";

/**
 * La page « Mettre à jour mon stock », rendue côté serveur sans base ni
 * navigateur : l'état en haut, les trois étapes, l'envoi du fichier, les
 * derniers envois. Services simulés ; on lit le texte rendu, pas le balisage.
 */

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  findPharmacy: vi.fn(),
  getConnection: vi.fn(),
  listPharmacyDeposits: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ push: vi.fn() }) }));
vi.mock("@/server/auth/session", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/server/db/client", () => ({ prisma: { pharmacy: { findUnique: mocks.findPharmacy } } }));
vi.mock("@/server/services/stock-sync", () => ({ getConnection: mocks.getConnection }));
vi.mock("@/server/services/stock-deposits", () => ({ listPharmacyDeposits: mocks.listPharmacyDeposits }));
vi.mock("@/server/actions/stock-deposits", () => ({ sendStockAction: vi.fn() }));

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

const connection = (overrides: Record<string, unknown> = {}) => ({
  id: "c1",
  lgo: "lgpi",
  lgoLabel: "LGPI",
  status: "CONNECTED",
  hostname: "SRV-PHARMA",
  agentVersion: "0.2.0",
  exportPath: null,
  scansPath: null,
  intervalSeconds: 300,
  lastSeenAt: ago(60_000),
  lastSyncAt: ago(HOUR),
  lastSyncLines: 4235,
  lastError: null,
  pairedAt: ago(10 * DAY),
  pairingExpiresAt: null,
  freshness: "FRESH",
  ageSeconds: 3600,
  seenAgeSeconds: 60,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  mocks.requirePermission.mockResolvedValue({ scope: { pharmacyId: "ph-1", userId: "u-1" }, pharmacy: { isDemo: false } });
  mocks.findPharmacy.mockResolvedValue({ stockSyncedAt: new Date("2026-10-05T06:42:00Z") });
  mocks.getConnection.mockResolvedValue(connection());
  mocks.listPharmacyDeposits.mockResolvedValue([deposit()]);
});

afterEach(() => vi.useRealTimers());

describe("l'accès", () => {
  it("exige la permission du titulaire avant de lire quoi que ce soit", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("403"));
    await expect(render()).rejects.toThrow("403");
    expect(mocks.requirePermission).toHaveBeenCalledWith(PERMISSIONS.PRODUCT_IMPORT);
    expect(mocks.findPharmacy).not.toHaveBeenCalled();
    expect(mocks.getConnection).not.toHaveBeenCalled();
    expect(mocks.listPharmacyDeposits).not.toHaveBeenCalled();
  });

  it("ne lit que l'officine de la session : cinq derniers envois, liaison et date du stock", async () => {
    await render();
    expect(mocks.findPharmacy).toHaveBeenCalledWith({ where: { id: "ph-1" }, select: { stockSyncedAt: true } });
    expect(mocks.getConnection).toHaveBeenCalledWith("ph-1");
    expect(mocks.listPharmacyDeposits).toHaveBeenCalledWith("ph-1", 5);
  });
});

describe("l'état du stock, en haut", () => {
  it("à jour : « reçu aujourd'hui à 08:42 (4 235 lignes) »", async () => {
    const html = await render();
    const t = text(html);
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
    mocks.getConnection.mockResolvedValue(null);
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

describe("les trois étapes", () => {
  it("LGPI, serveur connu : la procédure vérifiée, le chemin du dossier sur le serveur, sans promesse du bureau d'un poste", async () => {
    const html = await render();
    const t = text(html);
    expect(t).toContain("En 3 étapes");
    expect(t).toContain("Sortez votre stock de LGPI");
    expect(t).toContain("ouvrez le module Inventaire, puis Édition");
    expect(t).toContain("Prenez tout votre stock, pas seulement les nouveautés.");
    expect(t).toContain("Enregistrez le fichier dans le dossier PharmaBoost");
    expect(html).toContain("\\\\SRV-PHARMA\\PharmaBoost");
    expect(t).toContain("Copier");
    expect(t).toContain("Dans LGPI, enregistrez (F9) l'édition en PDF dans ce dossier.");
    expect(t).toContain("C'est tout : PharmaBoost lit le fichier dans la minute");
    expect(t).not.toContain(UNVERIFIED);
  });

  it("le chemin ne promet rien : « se trouve sur le serveur », un raccourci posé sur le serveur seulement, et le repli par l'envoi du fichier", async () => {
    const t = text(await render());
    expect(t).toContain("Le dossier PharmaBoost se trouve sur le serveur de l'officine : \\\\SRV-PHARMA\\PharmaBoost");
    expect(t).toContain("Sur le serveur, un raccourci « Stock PharmaBoost » est posé sur le bureau.");
    expect(t).toContain("Ce chemin ne s'ouvre pas ? Pas de souci : envoyez le fichier avec le bouton ci-dessous, c'est tout aussi bon.");
    // Les anciennes affirmations (le raccourci sur « votre » bureau, l'Explorateur) ne sont plus faites.
    expect(t).not.toContain("Sur votre bureau");
    expect(t).not.toContain("ouvre ce dossier");
    expect(t).not.toContain("Explorateur");
  });

  it("l'étape 1 prévient : ce qui n'est pas dans le fichier sera mis à 0 en stock", async () => {
    const t = text(await render());
    expect(t).toContain("Prenez tout votre stock, pas seulement les nouveautés. Ce qui n'est pas dans le fichier sera mis à 0 en stock.");
  });

  it("serveur sans nom connu : le dossier d'installation", async () => {
    mocks.getConnection.mockResolvedValue(connection({ hostname: null }));
    expect(await render()).toContain("C:\\PharmaBoost\\Export");
  });

  it("un autre logiciel : texte générique, aucun menu inventé, et la mention honnête", async () => {
    mocks.getConnection.mockResolvedValue(connection({ lgo: "winpharma" }));
    const t = text(await render());
    expect(t).toContain("Sortez votre stock de Winpharma");
    expect(t).toContain("lancez l'export ou l'édition du stock");
    expect(t).toContain(UNVERIFIED);
    expect(t).not.toContain("module Inventaire");
    expect(t).not.toContain("(F9)");
  });

  it("logiciel inconnu (pas de liaison) : « votre logiciel »", async () => {
    mocks.getConnection.mockResolvedValue(null);
    const t = text(await render());
    expect(t).toContain("Sortez votre stock de votre logiciel");
    expect(t).toContain(UNVERIFIED);
  });

  it("pas de dossier installé : on le dit, on ne montre aucun chemin qui n'existe pas, et l'envoi s'ouvre", async () => {
    mocks.getConnection.mockResolvedValue(connection({ status: "PENDING", hostname: "" }));
    const html = await render();
    const t = text(html);
    expect(t).toContain("Ce dossier est créé sur votre serveur quand votre conseiller PharmaBoost installe PharmaBoost");
    expect(html).not.toContain("C:\\PharmaBoost\\Export");
    expect(t).toContain("Quand vous envoyez votre fichier ci-dessous");
    expect(html).toContain('aria-expanded="true"');
  });

  it("dossier installé et vivant : l'envoi reste replié", async () => {
    expect(await render()).toContain('aria-expanded="false"');
  });

  it("serveur silencieux depuis plus d'une heure : avertissement, et l'envoi s'ouvre", async () => {
    mocks.getConnection.mockResolvedValue(connection({ freshness: "DISCONNECTED", seenAgeSeconds: 3 * 86400 }));
    const html = await render();
    expect(text(html)).toContain("Le dossier PharmaBoost ne répond plus (dernier signe : il y a 3 j)");
    expect(html).toContain('aria-expanded="true"');
  });
});

describe("l'envoi attendu, en direct", () => {
  it("rien de nouveau : on attend le fichier", async () => {
    expect(text(await render())).toContain("En attente de votre fichier… cette page se met à jour toute seule.");
  });

  it("un fichier en cours de lecture : « lecture en cours »", async () => {
    mocks.listPharmacyDeposits.mockResolvedValue([deposit({ status: "RECEIVED", lines: null, appliedAt: null })]);
    expect(text(await render())).toContain("Fichier reçu, lecture en cours…");
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

  it("écarté : une alerte neutre en haut — l'équipe n'a pas appliqué le fichier, le stock n'a pas changé, envoyez le stock complet", async () => {
    mocks.listPharmacyDeposits.mockResolvedValue([deposit({ status: "REJECTED", lines: null, appliedAt: null })]);
    const html = await render();
    const t = text(html);
    expect(t).toContain("Votre dernier fichier n'a pas été appliqué");
    expect(t).toContain("L'équipe PharmaBoost n'a pas appliqué votre dernier fichier. Votre stock n'a pas changé. Envoyez votre stock complet.");
    expect(t).toContain("Écarté par l'équipe PharmaBoost."); // la ligne de « Vos derniers envois »
    // Neutre : ni l'orange d'une vérification ni le rouge d'un échec.
    expect(t).not.toContain("Votre dernier fichier n'a pas pu être lu");
    expect(t).not.toContain("Votre dernier fichier est en vérification");
  });

  it("un dernier envoi réussi n'a aucune de ces alertes", async () => {
    const t = text(await render());
    expect(t).not.toContain("n'a pas été appliqué");
    expect(t).not.toContain("interrompue");
  });

  it("une lecture restée bloquée : « Lecture interrompue, renvoyez votre fichier » — pas de roue qui tourne à vie", async () => {
    mocks.listPharmacyDeposits.mockResolvedValue([deposit({ status: "RECEIVED", stalled: true, lines: null, appliedAt: null, receivedAt: ago(30 * 60_000) })]);
    const html = await render();
    const t = text(html);
    expect(t).toContain("La lecture de votre dernier fichier s'est interrompue");
    expect(t).toContain("Lecture interrompue, renvoyez votre fichier.");
    expect(t).not.toContain("lecture en cours");
    expect(t).not.toContain("Lecture en cours…");
    expect(html).not.toContain("animate-spin");
    expect(t).toContain("Lecture interrompue"); // la pastille et la ligne de la liste
  });

  it("une lecture récente, elle, reste « en cours » (et la roue tourne)", async () => {
    mocks.listPharmacyDeposits.mockResolvedValue([deposit({ status: "RECEIVED", stalled: false, lines: null, appliedAt: null })]);
    const html = await render();
    expect(text(html)).not.toContain("interrompue");
    expect(html).toContain("animate-spin");
  });

  it("un dernier envoi réussi efface l'alerte d'un ancien fichier en vérification", async () => {
    mocks.listPharmacyDeposits.mockResolvedValue([deposit({ id: "d2" }), deposit({ id: "d1", status: "HELD", appliedAt: null })]);
    expect(text(await render())).not.toContain("Votre dernier fichier est en vérification");
  });
});

describe("l'envoi du fichier depuis la page", () => {
  it("un seul bloc, replié par défaut, avec le rappel « stock complet » et un seul bouton Envoyer", async () => {
    const html = await render();
    const t = text(html);
    expect(t).toContain("Je n'ai pas le dossier PharmaBoost, ou je préfère envoyer le fichier ici");
    expect(t).toContain("Envoyez toujours votre stock complet (tous les produits en stock), pas seulement ce qui vient d'arriver. Ce qui n'est pas dans le fichier sera mis à 0 en stock.");
    expect(t).toContain("Choisir le fichier");
    expect(html.match(/type="submit"/g)).toHaveLength(1);
    expect(html).toContain('id="stock-deposit-file"');
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
        mocks.getConnection.mockResolvedValue(null);
      }],
      ["autre logiciel", () => mocks.getConnection.mockResolvedValue(connection({ lgo: "autre" }))],
      ["en vérification", () => mocks.listPharmacyDeposits.mockResolvedValue([deposit({ status: "HELD", message: "raison de la console" })])],
      ["non lu", () => mocks.listPharmacyDeposits.mockResolvedValue([deposit({ status: "FAILED", message: "Colonnes non reconnues : quantité." })])],
      ["serveur silencieux", () => mocks.getConnection.mockResolvedValue(connection({ freshness: "DISCONNECTED", seenAgeSeconds: 7200 }))],
      ["écarté", () => mocks.listPharmacyDeposits.mockResolvedValue([deposit({ status: "REJECTED", message: "raison de la console" })])],
      ["lecture interrompue", () => mocks.listPharmacyDeposits.mockResolvedValue([deposit({ status: "RECEIVED", stalled: true, message: null })])],
    ];
    for (const [name, arrange] of scenarios) {
      vi.clearAllMocks();
      mocks.requirePermission.mockResolvedValue({ scope: { pharmacyId: "ph-1", userId: "u-1" }, pharmacy: { isDemo: false } });
      mocks.findPharmacy.mockResolvedValue({ stockSyncedAt: new Date("2026-10-05T06:42:00Z") });
      mocks.getConnection.mockResolvedValue(connection());
      mocks.listPharmacyDeposits.mockResolvedValue([deposit()]);
      arrange();
      expect(text(await render()), name).not.toMatch(/\bagent\b|appairage|facteur|\bCIP\b|import job/i);
    }
  });
});

/** La mention honnête d'un logiciel dont la procédure n'est pas vérifiée. */
const UNVERIFIED = "Les étapes exactes de votre logiciel seront ajoutées avec votre conseiller PharmaBoost.";
