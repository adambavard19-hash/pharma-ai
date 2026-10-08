import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * « Mon stock », rendu côté serveur sans base ni navigateur : ce que le pharmacien lit, et surtout ses CHIFFRES.
 * L'ancien écran affichait « 2 735 en stock » à côté d'« une seule rupture » sur 4 307 références : le « stock faible »
 * (sous un seuil par défaut de 5) n'était pas compté comme disponible. Ici, un produit est disponible, en rupture ou désactivé.
 */

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  productFindMany: vi.fn(),
  drugFindMany: vi.fn(),
  loadOverview: vi.fn(),
  countLots: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ push: vi.fn() }) }));
vi.mock("@/server/actions/stock", () => ({ setQuantityAction: vi.fn() }));
vi.mock("@/server/auth/session", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/server/db/client", () => ({ prisma: { product: { findMany: mocks.productFindMany }, pharmacyDrugStock: { findMany: mocks.drugFindMany } } }));
vi.mock("@/server/services/connection-overview", () => ({ loadConnectionOverview: mocks.loadOverview }));
vi.mock("@/server/services/stock-lots", () => ({ countLotsNeedingAction: mocks.countLots }));

const { default: StockPage } = await import("../page");
const { PERMISSIONS } = await import("@/server/rbac/permissions");

const NOW = new Date("2026-10-08T12:00:00Z");
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[\s  ]+/g, " ")
    .trim();
const render = async (searchParams: { q?: string; etat?: string; page?: string } = {}) => renderToStaticMarkup(await StockPage({ searchParams: Promise.resolve(searchParams) }));

type ProductLine = { id: string; name: string; brand: string | null; ean: string | null; salePriceCents: number; isActive: boolean; stockItem: { quantity: number } | null };
type DrugLine = { id: string; quantity: number; priceCents: number | null; presentation: { cip13: string; label: string; priceCents: number; specialty: { name: string } } };

const product = (n: number, quantity: number, extra: Partial<ProductLine> = {}): ProductLine => ({ id: `p${n}`, name: `PRODUIT ${String(n).padStart(4, "0")}`, brand: null, ean: `20000${String(n).padStart(8, "0")}`, salePriceCents: 990, isActive: true, stockItem: { quantity }, ...extra });
const drug = (n: number, quantity: number): DrugLine => ({ id: `d${n}`, quantity, priceCents: null, presentation: { cip13: `34009${String(n).padStart(8, "0")}`, label: "1 tube", priceCents: 650, specialty: { name: `MEDICAMENT ${String(n).padStart(4, "0")}` } } });

/** Le catalogue : `products` et `drugs`. Les deux lectures (chiffres de tout le catalogue, puis liste) sont servies par les mêmes données. */
function catalogue(products: ProductLine[], drugs: DrugLine[]) {
  mocks.productFindMany.mockImplementation(async (args: { select: Record<string, unknown> }) => (args.select.name ? products : products.map((p) => ({ isActive: p.isActive, stockItem: p.stockItem }))));
  mocks.drugFindMany.mockImplementation(async (args: { select: Record<string, unknown> }) => (args.select.presentation ? drugs : drugs.map((d) => ({ quantity: d.quantity }))));
}

const SESSION = { scope: { pharmacyId: "ph-1", organizationId: "org-1", userId: "u-1" }, pharmacy: { name: "Pharmacie Test LGPI" }, permissions: new Set([PERMISSIONS.STOCK_VIEW, PERMISSIONS.STOCK_ADJUST, PERMISSIONS.PRODUCT_MANAGE, PERMISSIONS.PRODUCT_IMPORT]) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  mocks.requirePermission.mockResolvedValue(SESSION);
  mocks.loadOverview.mockResolvedValue({ stockSyncedAt: new Date(NOW.getTime() - 21 * 86_400_000) });
  mocks.countLots.mockResolvedValue({ urgent: 0, expired: 0 });
  catalogue([product(1, 5), product(2, 0), product(3, 12)], [drug(1, 3)]);
});

afterEach(() => vi.useRealTimers());

describe("l'écran « Mon stock »", () => {
  it("affiche le titre, l'officine, l'âge du stock, son état et UN bouton principal vers la mise à jour", async () => {
    const html = await render();
    const t = text(html);
    expect(t).toContain("Mon stock");
    expect(t).toContain("Pharmacie Test LGPI");
    expect(t).toContain("À actualiser");
    expect(t).toContain("Dernière mise à jour");
    expect(t).toContain("Il y a 21 jours");
    expect(t).toContain("Mettre à jour mon stock");
    expect(html).toContain('href="/stock/mise-a-jour"');
    expect([...html.matchAll(/href="\/stock\/mise-a-jour"/g)]).toHaveLength(1);
  });

  it("un stock récent est « À jour », jamais reçu « Aucun stock reçu » avec un bouton qui dit « Envoyer »", async () => {
    mocks.loadOverview.mockResolvedValue({ stockSyncedAt: new Date(NOW.getTime() - 3_600_000) });
    const fresh = text(await render());
    expect(fresh).toContain("À jour");
    expect(fresh).toContain("Aujourd'hui");
    mocks.loadOverview.mockResolvedValue({ stockSyncedAt: null });
    const none = text(await render());
    expect(none).toContain("Aucun stock reçu");
    expect(none).toContain("Envoyer mon stock");
  });

  it("n'affiche QUE ce qui est demandé : plus de « Ma connexion », de produits à comprendre, de photos, d'anomalies ni d'alertes répétées", async () => {
    const t = text(await render());
    for (const gone of ["Ma connexion", "Comprendre", "non classés", "Chercher les photos", "Anomalies", "Stock reçu", "Dates courtes", "Historique", "PharmaBoost Connect"]) {
      expect(t, gone).not.toContain(gone);
    }
    expect(t).toContain("Ajouter un produit");
    expect(t).toContain("Qualité du catalogue");
  });

  it("la recherche, la liste avec quantité, prix et disponibilité", async () => {
    const t = text(await render());
    expect(t).toContain("Rechercher un produit");
    expect(t).toContain("Nom, code CIP, EAN…");
    expect(t).toContain("Quantité");
    expect(t).toContain("9,90 €");
    expect(t).toContain("Disponible");
    expect(t).toContain("Rupture");
  });

  it("les ruptures passent en premier", async () => {
    const t = text(await render());
    expect(t.indexOf("PRODUIT 0002")).toBeLessThan(t.indexOf("PRODUIT 0001"));
  });
});

describe("les chiffres : un stock faible n'est pas une rupture", () => {
  it("l'officine de test : 4 307 références, 4 306 disponibles, 1 rupture — quels que soient les seuils d'alerte", async () => {
    // 1 571 produits à quantité 1 à 5 (sous un seuil par défaut de 5), 802 au-dessus, 1 933 médicaments, 1 rupture.
    const products = [...Array.from({ length: 1571 }, (_, i) => product(i + 1, 1 + (i % 5))), ...Array.from({ length: 802 }, (_, i) => product(2000 + i, 12))];
    const drugs = [...Array.from({ length: 1933 }, (_, i) => drug(i + 1, 3)), drug(5000, 0)];
    catalogue(products, drugs);
    const t = text(await render());
    expect(t).toContain("Produits référencés 4 307");
    expect(t).toContain("Produits disponibles 4 306");
    expect(t).toContain("Quantité supérieure à zéro");
    expect(t).toContain("Dans votre catalogue");
    expect(t).toContain("Tous 4 307");
    expect(t).toContain("Disponibles 4 306");
    expect(t).toContain("Ruptures 1");
    expect(t).not.toContain("2 735");
  });

  it("les chiffres du haut sont ceux de TOUT le catalogue, pas ceux de la recherche", async () => {
    catalogue([product(1, 5), product(2, 0), product(3, 12)], [drug(1, 3)]);
    mocks.productFindMany.mockImplementation(async (args: { select: Record<string, unknown>; where: Record<string, unknown> }) => {
      const all = [product(1, 5), product(2, 0), product(3, 12)];
      return args.select.name ? (args.where.OR ? [all[1]] : all) : all.map((p) => ({ isActive: p.isActive, stockItem: p.stockItem }));
    });
    // La recherche écarte aussi le médicament : seule la ligne cherchée reste dans la liste, pas dans les chiffres.
    mocks.drugFindMany.mockImplementation(async (args: { select: Record<string, unknown>; where: Record<string, unknown> }) => (args.select.presentation ? (args.where.presentation ? [] : [drug(1, 3)]) : [{ quantity: 3 }]));
    const t = text(await render({ q: "PRODUIT 0002" }));
    expect(t).toContain("Produits référencés 4");
    expect(t).toContain("Produits disponibles 3");
    expect(t).toContain("1 référence");
  });

  it("un produit désactivé n'est ni disponible ni en rupture ; le filtre « Désactivés » n'apparaît que s'il y en a", async () => {
    const t0 = text(await render());
    expect(t0).not.toContain("Désactivés");
    catalogue([product(1, 5), product(2, 0, { isActive: false }), product(3, 7, { isActive: false })], [drug(1, 3)]);
    const t1 = text(await render());
    expect(t1).toContain("Produits référencés 4");
    expect(t1).toContain("Produits disponibles 2");
    expect(t1).toContain("Ruptures 0");
    expect(t1).toContain("Désactivés 2");
  });

  it("un produit non classé ou sans photo reste disponible : seule sa quantité compte", async () => {
    catalogue([product(1, 4, { name: "PRODUIT NON CLASSE SANS PHOTO" })], []);
    const t = text(await render());
    expect(t).toContain("Produits disponibles 1");
    expect(t).toContain("Ruptures 0");
  });
});

describe("les filtres, y compris ceux de l'ancien écran", () => {
  it("« Ruptures » ne liste que les ruptures", async () => {
    const t = text(await render({ etat: "rupture" }));
    expect(t).toContain("PRODUIT 0002");
    expect(t).not.toContain("PRODUIT 0001");
  });

  it("l'ancienne adresse « stock » (en stock) liste les disponibles ; « faible » liste tout", async () => {
    const stock = text(await render({ etat: "stock" }));
    expect(stock).toContain("PRODUIT 0001");
    expect(stock).not.toContain("PRODUIT 0002");
    const faible = text(await render({ etat: "faible" }));
    expect(faible).toContain("PRODUIT 0002");
    expect(faible).toContain("PRODUIT 0001");
  });
});

describe("les droits", () => {
  it("exige le droit de voir le stock, et lit l'officine de la session", async () => {
    await render();
    expect(mocks.requirePermission).toHaveBeenCalledWith(PERMISSIONS.STOCK_VIEW);
    for (const call of mocks.productFindMany.mock.calls) expect(call[0].where.pharmacyId).toBe("ph-1");
    for (const call of mocks.drugFindMany.mock.calls) expect(call[0].where.pharmacyId).toBe("ph-1");
  });

  it("sans le droit d'importer : pas de bouton de mise à jour ; sans le droit de gérer ou d'ajuster : pas d'« Ajouter un produit »", async () => {
    mocks.requirePermission.mockResolvedValue({ ...SESSION, permissions: new Set([PERMISSIONS.STOCK_VIEW]) });
    const t = text(await render());
    expect(t).not.toContain("Mettre à jour mon stock");
    expect(t).not.toContain("Ajouter un produit");
    expect(t).toContain("Produits référencés");
  });

  it("l'alerte dates courtes se réduit à une pastille sur « Qualité du catalogue », seulement s'il y a de l'urgent", async () => {
    mocks.countLots.mockResolvedValue({ urgent: 2, expired: 1 });
    const html = await render();
    expect(html).toContain("3 dates courtes à traiter");
    expect(text(html)).not.toContain("Dates courtes");
  });
});
