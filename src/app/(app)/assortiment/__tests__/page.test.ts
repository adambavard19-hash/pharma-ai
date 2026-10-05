import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const session = vi.hoisted(() => ({ requirePermission: vi.fn() }));
const service = vi.hoisted(() => ({ loadAssortment: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/session", () => session);
vi.mock("@/server/services/assortment-gaps", () => service);
vi.mock("@/server/actions/assortment", () => ({ suggestLabAction: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ push: vi.fn() }) }));

const { default: AssortmentPage } = await import("../page");
const { PERMISSIONS } = await import("@/server/rbac/permissions");

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;| /g, " ").replace(/\s+/g, " ").trim();
const render = async (periode?: string) => text(renderToStaticMarkup(await AssortmentPage({ searchParams: Promise.resolve({ periode }) })));

const base = { days: 30, since: new Date("2026-09-05T00:00:00Z"), analysedPrescriptions: 11, withoutCoverage: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  session.requirePermission.mockResolvedValue({ scope: { pharmacyId: "ph-1", userId: "u-1" } });
});

describe("la page « Votre assortiment »", () => {
  it("exige la permission du titulaire avant de lire quoi que ce soit, et ne lit que l'officine de la session", async () => {
    service.loadAssortment.mockResolvedValue({ ...base, detected: 0, covered: 0, unmet: 0, coveredRate: null, groups: [] });
    await render();
    expect(session.requirePermission).toHaveBeenCalledWith(PERMISSIONS.PARTNERS_MANAGE);
    expect(service.loadAssortment).toHaveBeenCalledWith({ pharmacyId: "ph-1", userId: "u-1" }, 30);
  });

  it("un refus de permission arrête tout : rien n'est lu", async () => {
    session.requirePermission.mockRejectedValue(new Error("403"));
    await expect(render()).rejects.toThrow();
    expect(service.loadAssortment).not.toHaveBeenCalled();
  });

  it("montre les chiffres, chaque manque avec sa cause et les marques partenaires qui y répondent, et dit que la page est pour le titulaire", async () => {
    service.loadAssortment.mockResolvedValue({
      ...base,
      detected: 18,
      covered: 14,
      unmet: 4,
      coveredRate: 78,
      groups: [{ key: "digestive", title: "Tolérance digestive pendant l'antibiothérapie", category: "PROBIOTIQUES", count: 3, causes: { NOT_REFERENCED: 2, OUT_OF_STOCK: 1, NO_SUITABLE: 0 }, market: [{ id: "b1", slug: "marque-test", name: "Marque Test", partnerName: "Laboratoire Test", logoUrl: null }] }],
    });
    const t = await render();
    expect(t).toContain("Cette page est réservée au titulaire : l'équipe au comptoir ne la voit pas.");
    expect(t).toContain("Situations de conseil détectées 18 sur 11 ordonnances analysées");
    expect(t).toContain("Couvertes par votre stock 78 %");
    expect(t).toContain("Non couvertes 4");
    expect(t).toContain("Tolérance digestive pendant l'antibiothérapie 3 fois");
    expect(t).toContain("Aucune référence en stock · 2");
    expect(t).toContain("Référence en rupture · 1");
    expect(t).toContain("Chez nos partenaires, que vous ne référencez pas encore");
    expect(t).toContain("Marque Test · Laboratoire Test");
    expect(t).toContain("Un laboratoire manque ?");
  });

  it("sans partenaire pour un besoin : il le dit, sans inventer de marque", async () => {
    service.loadAssortment.mockResolvedValue({ ...base, detected: 2, covered: 1, unmet: 1, coveredRate: 50, groups: [{ key: "x", title: "Chaud ou froid sur la douleur", category: "SOINS", count: 1, causes: { NOT_REFERENCED: 0, OUT_OF_STOCK: 0, NO_SUITABLE: 1 }, market: [] }] });
    const t = await render();
    expect(t).toContain("Aucun laboratoire partenaire de PharmaBoost ne répond encore à ce besoin pour votre officine.");
    expect(t).not.toContain("Chez nos partenaires, que vous ne référencez pas encore");
  });

  it("états honnêtes : aucune ordonnance analysée, ou analyses sans l'information", async () => {
    service.loadAssortment.mockResolvedValue({ ...base, analysedPrescriptions: 0, detected: 0, covered: 0, unmet: 0, coveredRate: null, groups: [] });
    expect(await render()).toContain("Aucune ordonnance analysée sur cette période.");
    service.loadAssortment.mockResolvedValue({ ...base, detected: 0, covered: 0, unmet: 0, coveredRate: null, groups: [] });
    expect(await render()).toContain("aucune ne porte encore l'information de couverture du stock");
  });

  it("la période se choisit dans l'adresse : 7 jours, 30 jours par défaut, 3 mois", async () => {
    service.loadAssortment.mockResolvedValue({ ...base, detected: 0, covered: 0, unmet: 0, coveredRate: null, groups: [] });
    await render("7j");
    expect(service.loadAssortment).toHaveBeenLastCalledWith(expect.anything(), 7);
    await render("90j");
    expect(service.loadAssortment).toHaveBeenLastCalledWith(expect.anything(), 90);
    await render("n'importe quoi");
    expect(service.loadAssortment).toHaveBeenLastCalledWith(expect.anything(), 30);
  });

  it("aucune donnée patient : la page ne reçoit ni nom ni ordonnance", async () => {
    service.loadAssortment.mockResolvedValue({ ...base, detected: 1, covered: 0, unmet: 1, coveredRate: 0, groups: [{ key: "x", title: "Besoin", category: "SOINS", count: 1, causes: { NOT_REFERENCED: 1, OUT_OF_STOCK: 0, NO_SUITABLE: 0 }, market: [] }] });
    const t = await render();
    expect(t).toContain("Aucune donnée patient n'apparaît sur cette page.");
  });
});
