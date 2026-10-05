import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * L'arrivée d'une candidature commerciale. Base, stockage et messagerie sont
 * simulés : AUCUN e-mail réel ne part d'ici, aucune écriture en base.
 */
const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  put: vi.fn(),
  remove: vi.fn(),
  getStorage: vi.fn(),
  sendEmail: vi.fn(),
  notifyAdmins: vi.fn(),
  recordAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: { salesApplication: { findFirst: mocks.findFirst, create: mocks.create, update: mocks.update } } }));
vi.mock("@/server/ai/registry", () => ({ getStorageProvider: mocks.getStorage, getMessagingProvider: () => ({ sendEmail: mocks.sendEmail }) }));
vi.mock("@/server/audit/log", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@/server/services/sales/notifications", () => ({ notifyAdmins: mocks.notifyAdmins }));
vi.mock("@/server/services/email-context", () => ({
  platformEmailContext: async () => ({ baseUrl: "https://pharmaboost.app", company: { legalName: "PharmaBoost", contactEmail: "Contact@pharmaboost.app" } }),
}));

const { receiveSalesApplication, cvUploadAvailable, DUPLICATE_WINDOW_MS } = await import("../intake");

const INPUT = {
  firstName: "Claire",
  lastName: "Martin",
  email: "claire.martin@exemple.fr",
  phone: "06 12 34 56 78",
  city: "Lyon",
  zone: "Rhône-Alpes",
  currentStatus: "FREELANCE",
  salesExperience: "Dix ans de vente en B2B.",
  healthExperience: "",
  message: "Je veux développer un produit utile.",
};
const CV = { bytes: new TextEncoder().encode("%PDF-1.7 contenu"), fileName: "cv.pdf" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.findFirst.mockResolvedValue(null);
  mocks.create.mockResolvedValue({ id: "app_1" });
  mocks.update.mockResolvedValue({});
  mocks.put.mockResolvedValue({ key: "k" });
  mocks.remove.mockResolvedValue(undefined);
  mocks.getStorage.mockReturnValue({ put: mocks.put, delete: mocks.remove });
  mocks.sendEmail.mockResolvedValue({ status: "SENT", provider: "test", detail: "ok" });
  mocks.notifyAdmins.mockResolvedValue(undefined);
  mocks.recordAudit.mockResolvedValue(undefined);
});

describe("receiveSalesApplication", () => {
  it("crée une candidature Nouvelle avec son événement, le consentement daté et rien d'autre", async () => {
    const result = await receiveSalesApplication(INPUT, null);
    expect(result).toEqual({ applicationId: "app_1", duplicate: false, acknowledged: true, cv: "none" });
    const data = mocks.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: "NEW", firstName: "Claire", email: "claire.martin@exemple.fr", city: "Lyon", zone: "Rhône-Alpes", currentStatus: "FREELANCE", healthExperience: null });
    expect(data.consentAt).toBeInstanceOf(Date);
    expect(data.events.create).toMatchObject({ kind: "CREATED", toStatus: "NEW" });
    expect(data).not.toHaveProperty("salesRepId");
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("prévient la console avec le lien de la fiche", async () => {
    await receiveSalesApplication(INPUT, null);
    expect(mocks.notifyAdmins).toHaveBeenCalledTimes(1);
    expect(mocks.notifyAdmins.mock.calls[0][0]).toMatchObject({ type: "SALES_APPLICATION", linkUrl: "/admin/candidatures-commerciales/app_1", severity: "INFO" });
  });

  it("envoie l'accusé au candidat (par la messagerie simulée) et le date", async () => {
    await receiveSalesApplication(INPUT, null);
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    const message = mocks.sendEmail.mock.calls[0][0];
    expect(message).toMatchObject({ to: "claire.martin@exemple.fr", fromName: "PharmaBoost" });
    expect(message.text).toContain("Bonjour Claire,");
    const ackUpdate = mocks.update.mock.calls.find(([call]) => call.data.acknowledgedAt);
    expect(ackUpdate?.[0]).toMatchObject({ where: { id: "app_1" } });
  });

  it("journalise sans aucune donnée personnelle", async () => {
    await receiveSalesApplication(INPUT, CV);
    expect(mocks.recordAudit).toHaveBeenCalledTimes(1);
    const entry = mocks.recordAudit.mock.calls[0][0];
    expect(entry).toMatchObject({ action: "sales_application.created", entityType: "SalesApplication", entityId: "app_1", metadata: { hasCv: true, acknowledged: true } });
    const serialized = JSON.stringify(entry);
    for (const secret of ["Claire", "Martin", "claire.martin", "06 12", "Lyon"]) expect(serialized).not.toContain(secret);
  });

  it("garde le CV sous sales-applications/<id>/cv.pdf et le relie à la candidature", async () => {
    const result = await receiveSalesApplication(INPUT, CV);
    expect(result.cv).toBe("saved");
    expect(mocks.put).toHaveBeenCalledWith("sales-applications/app_1/cv.pdf", CV.bytes, "application/pdf");
    const cvUpdate = mocks.update.mock.calls.find(([call]) => call.data.cvKey);
    expect(cvUpdate?.[0]).toEqual({ where: { id: "app_1" }, data: { cvKey: "sales-applications/app_1/cv.pdf", cvFileName: "cv.pdf", cvSizeBytes: CV.bytes.byteLength } });
  });

  it("une panne du stockage n'empêche pas la candidature : le CV est dit non gardé", async () => {
    mocks.put.mockRejectedValue(new Error("stockage hors service"));
    const result = await receiveSalesApplication(INPUT, CV);
    expect(result).toMatchObject({ applicationId: "app_1", duplicate: false, cv: "failed" });
    expect(mocks.update.mock.calls.some(([call]) => call.data.cvKey)).toBe(false);
    expect(mocks.notifyAdmins).toHaveBeenCalledTimes(1);
    // L'accusé ne parle pas d'un CV qu'on n'a pas.
    expect(mocks.sendEmail.mock.calls[0][0].text).not.toContain("CV");
  });

  it("un stockage mal configuré ne fait jamais échouer la candidature", async () => {
    mocks.getStorage.mockImplementation(() => {
      throw new Error("Stockage S3 incomplet");
    });
    const result = await receiveSalesApplication(INPUT, CV);
    expect(result.cv).toBe("failed");
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it("un fichier stocké mais non référencé est retiré", async () => {
    mocks.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      if (data.cvKey) throw new Error("base indisponible");
      return {};
    });
    const result = await receiveSalesApplication(INPUT, CV);
    expect(result.cv).toBe("failed");
    expect(mocks.remove).toHaveBeenCalledWith("sales-applications/app_1/cv.pdf");
  });

  it("une panne d'e-mail ou de notification ne fait pas échouer la candidature", async () => {
    mocks.sendEmail.mockRejectedValue(new Error("SMTP"));
    mocks.notifyAdmins.mockRejectedValue(new Error("base"));
    const result = await receiveSalesApplication(INPUT, null);
    expect(result).toMatchObject({ applicationId: "app_1", duplicate: false, acknowledged: false });
    expect(mocks.recordAudit).toHaveBeenCalledTimes(1);
  });

  it("un e-mail non parti (échec ou simulé) ne marque pas l'accusé comme envoyé", async () => {
    mocks.sendEmail.mockResolvedValue({ status: "FAILED", provider: "test", detail: "refusé" });
    const result = await receiveSalesApplication(INPUT, null);
    expect(result.acknowledged).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("une candidature de la même adresse dans les 24 h n'en crée pas une seconde", async () => {
    mocks.findFirst.mockResolvedValue({ id: "app_0", acknowledgedAt: new Date() });
    const result = await receiveSalesApplication({ ...INPUT, email: "CLAIRE.Martin@exemple.fr" }, CV);
    expect(result).toEqual({ applicationId: "app_0", duplicate: true, acknowledged: true, cv: "none" });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.notifyAdmins).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("le doublon se cherche sans tenir compte de la casse, sur 24 h exactement", async () => {
    const before = Date.now();
    await receiveSalesApplication(INPUT, null);
    const where = mocks.findFirst.mock.calls[0][0].where;
    expect(where.email).toEqual({ equals: "claire.martin@exemple.fr", mode: "insensitive" });
    const since = (where.createdAt.gte as Date).getTime();
    expect(before - since).toBeGreaterThanOrEqual(DUPLICATE_WINDOW_MS - 50);
    expect(before - since).toBeLessThanOrEqual(DUPLICATE_WINDOW_MS + 5_000);
  });

  it("le doublon sans accusé parti le dit : le visiteur voit la bonne confirmation", async () => {
    mocks.findFirst.mockResolvedValue({ id: "app_0", acknowledgedAt: null });
    expect((await receiveSalesApplication(INPUT, null)).acknowledged).toBe(false);
  });
});

describe("cvUploadAvailable", () => {
  it("vrai quand le stockage est utilisable, faux (sans erreur) quand il ne l'est pas", () => {
    expect(cvUploadAvailable()).toBe(true);
    mocks.getStorage.mockImplementation(() => {
      throw new Error("Le stockage des ordonnances n'est pas configuré pour la production");
    });
    expect(cvUploadAvailable()).toBe(false);
  });
});
