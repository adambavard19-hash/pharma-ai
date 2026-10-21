import { beforeEach, describe, expect, it, vi } from "vitest";
import { recommendationSchema } from "@/core/site/recommendation-form";

const mocks = vi.hoisted(() => ({
  salesRepFindFirst: vi.fn(),
  prospectCreate: vi.fn(),
  companyFindUnique: vi.fn(),
  sendEmail: vi.fn(),
  notifyAdmins: vi.fn(),
  notifySalesRep: vi.fn(),
  recordProspectEvent: vi.fn(),
  traceDispatch: vi.fn(),
  adminFindMany: vi.fn(),
}));

vi.mock("@/server/db/client", () => ({
  prisma: { salesRep: { findFirst: mocks.salesRepFindFirst }, prospect: { create: mocks.prospectCreate }, companyProfile: { findUnique: mocks.companyFindUnique }, platformAdmin: { findMany: mocks.adminFindMany } },
}));
vi.mock("@/server/ai/registry", () => ({ getMessagingProvider: () => ({ sendEmail: mocks.sendEmail }) }));
vi.mock("@/server/public-url", () => ({ publicUrl: (path: string) => `https://pharmaboost.test${path}` }));
vi.mock("@/server/services/sales/events", () => ({ recordProspectEvent: mocks.recordProspectEvent }));
vi.mock("@/server/services/sales/notifications", () => ({ notifyAdmins: mocks.notifyAdmins, notifySalesRep: mocks.notifySalesRep }));
vi.mock("@/server/services/email-dispatch", () => ({ traceDispatch: mocks.traceDispatch }));
vi.mock("@/server/services/site-leads", () => ({ DEFAULT_CONTACT_EMAIL: "contact@pharmaboost.test" }));

const { receivePharmacyRecommendation } = await import("../pharmacy-recommendations");

const input = recommendationSchema.parse({ referrerName: "Julie Martin", referrerEmail: "julie@exemple.test", referrerPhone: "06 12 34 56 78", pharmacyName: "Pharmacie du Port", city: "Toulon", contactName: "", contactPhone: "", message: "" });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prospectCreate.mockResolvedValue({ id: "p_reco" });
  mocks.companyFindUnique.mockResolvedValue(null);
  mocks.sendEmail.mockResolvedValue({ status: "SENT" });
  mocks.salesRepFindFirst.mockResolvedValue(null);
  mocks.notifySalesRep.mockResolvedValue(undefined);
  mocks.adminFindMany.mockResolvedValue([]);
});

describe("« Recommander une pharmacie » : 100 € pour l'apporteur si elle signe", () => {
  it("la pharmacie devient un dossier, avec l'apporteur et sa prime écrits ; l'équipe et l'apporteur sont prévenus, jamais la pharmacie", async () => {
    const result = await receivePharmacyRecommendation(input);
    expect(result).toEqual({ prospectId: "p_reco", acknowledged: true });
    const data = mocks.prospectCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({ name: "Pharmacie du Port", city: "Toulon", origin: "SELF_SERVICE_SITE", status: "PROSPECT", salesRepId: null });
    expect(data.notes).toContain("Apportée par : Julie Martin · julie@exemple.test · 06 12 34 56 78");
    expect(data.notes).toMatch(/Prime d'apport : 100\s€ HT si la pharmacie signe et règle sa mise en service/);
    expect(mocks.notifyAdmins).toHaveBeenCalledWith(expect.objectContaining({ title: "Pharmacie recommandée — Pharmacie du Port" }));
    expect(mocks.sendEmail.mock.calls.map(([mail]) => mail.to)).toEqual(["contact@pharmaboost.test", "julie@exemple.test"]);
    expect(mocks.sendEmail.mock.calls[1][0].text).toMatch(/votre prime de 100\s€ HT vous est versée dès que sa mise en service est réglée/);
  });

  it("chaque administrateur de la console reçoit aussi l'alerte par e-mail (sans doublon avec l'adresse de contact)", async () => {
    mocks.adminFindMany.mockResolvedValue([{ email: "fondateur@exemple.test" }, { email: "Contact@pharmaboost.test" }]);
    await receivePharmacyRecommendation(input);
    expect(mocks.sendEmail.mock.calls.map(([mail]) => mail.to)).toEqual(["contact@pharmaboost.test", "fondateur@exemple.test", "julie@exemple.test"]);
    expect(mocks.sendEmail.mock.calls[1][0].subject).toBe(mocks.sendEmail.mock.calls[0][0].subject);
  });

  it("un affilié inscrit (même e-mail, actif) se voit attribuer le dossier : sa prime sera calculée toute seule", async () => {
    mocks.salesRepFindFirst.mockResolvedValue({ id: "rep_1", firstName: "Julie", lastName: "Martin" });
    await receivePharmacyRecommendation(input);
    expect(mocks.salesRepFindFirst.mock.calls[0][0].where).toEqual({ email: { equals: "julie@exemple.test", mode: "insensitive" }, commissionType: "AFFILIATE", isActive: true });
    expect(mocks.prospectCreate.mock.calls[0][0].data.salesRepId).toBe("rep_1");
    expect(mocks.notifySalesRep).toHaveBeenCalledWith(expect.objectContaining({ salesRepId: "rep_1" }));
  });

  it("le formulaire exige la pharmacie, sa ville et de quoi joindre l'apporteur", () => {
    expect(recommendationSchema.safeParse({ ...input, city: "" }).success).toBe(false);
    expect(recommendationSchema.safeParse({ ...input, referrerPhone: "12" }).success).toBe(false);
    expect(recommendationSchema.safeParse({ ...input, referrerEmail: "pas-une-adresse" }).success).toBe(false);
  });
});
