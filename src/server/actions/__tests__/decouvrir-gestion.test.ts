import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * L'espace Découvrir est ouvert à toute l'équipe en lecture (consigne du fondateur du 13 oct. 2026) ; les gestes de
 * gestion restent au titulaire. Chaque action de gestion exige sa permission de gestion avant toute écriture — un
 * collaborateur qui l'appellerait directement (sans bouton) est refusé par le serveur.
 */

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/auth/session", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/server/audit/log", () => ({ recordAudit: vi.fn() }));
vi.mock("@/server/services/partners/pharmacy-partners", () => ({ setBrandPreference: vi.fn() }));
vi.mock("@/server/services/partners/orders", () => ({ openPartnerLink: vi.fn(), placeOrder: vi.fn(), recordBrandView: vi.fn(), requestContact: vi.fn() }));
vi.mock("@/server/services/training", () => ({ savePharmacyTraining: vi.fn(), searchPharmacyProducts: vi.fn(), setPharmacyTrainingActive: vi.fn(), setProgress: vi.fn() }));
vi.mock("@/server/actions/demo-guard", () => ({ refuseInDemo: vi.fn() }));

const partners = await import("../partners");
const training = await import("../training");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requirePermission.mockRejectedValue(new Error("NEXT_FORBIDDEN"));
});

const calledWith = () => mocks.requirePermission.mock.calls.map((call) => call[0]);

describe("Partenaires : masquer, contacter, ouvrir le lien, commander restent au titulaire", () => {
  it("chaque action de gestion exige partners:manage", async () => {
    await expect(partners.setPartnerPreferenceAction({} as never)).rejects.toThrow("NEXT_FORBIDDEN");
    await expect(partners.requestPartnerContactAction({} as never)).rejects.toThrow("NEXT_FORBIDDEN");
    await expect(partners.openPartnerLinkAction({} as never)).rejects.toThrow("NEXT_FORBIDDEN");
    await expect(partners.placePartnerOrderAction({} as never)).rejects.toThrow("NEXT_FORBIDDEN");
    expect(calledWith()).toEqual(["partners:manage", "partners:manage", "partners:manage", "partners:manage"]);
  });

  it("noter la consultation d'une marque suffit de partners:view (l'équipe consulte)", async () => {
    await expect(partners.recordPartnerViewAction({} as never)).rejects.toThrow("NEXT_FORBIDDEN");
    expect(calledWith()).toEqual(["partners:view"]);
  });
});

describe("Formations : publier reste au titulaire, suivre est ouvert", () => {
  it("publier, activer, chercher un produit à lier exigent training:manage", async () => {
    await expect(training.savePharmacyTrainingAction({} as never)).rejects.toThrow("NEXT_FORBIDDEN");
    await expect(training.setPharmacyTrainingActiveAction({} as never)).rejects.toThrow("NEXT_FORBIDDEN");
    await expect(training.searchTrainingProductsAction("x")).rejects.toThrow("NEXT_FORBIDDEN");
    expect(calledWith()).toEqual(["training:manage", "training:manage", "training:manage"]);
  });

  it("sa propre progression demande training:view", async () => {
    await expect(training.setTrainingProgressAction({ contentId: "c" } as never)).rejects.toThrow("NEXT_FORBIDDEN");
    expect(calledWith()).toEqual(["training:view"]);
  });
});
