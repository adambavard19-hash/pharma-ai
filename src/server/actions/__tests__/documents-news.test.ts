import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * L'envoi du plan par e-mail en mode complet (fiches conservées) porte, lui
 * aussi, le lien facultatif d'abonnement aux nouveautés — sans jamais
 * contourner le consentement au plan, ni retarder sa remise.
 */

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  newsOptInUrlFor: vi.fn(),
  sendEmail: vi.fn(),
  recordAudit: vi.fn(),
  prisma: {
    patientDocument: { findUnique: vi.fn() },
    pharmacy: { findUnique: vi.fn() },
    documentDelivery: { create: vi.fn() },
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: mocks.prisma }));
vi.mock("@/server/auth/session", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/server/ai/registry", () => ({ getMessagingProvider: () => ({ info: { capability: "LIVE" }, sendEmail: mocks.sendEmail }) }));
vi.mock("@/server/audit/log", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/services/documents", () => ({ generatePatientDocument: vi.fn(), buildDocumentUrl: (token: string) => `https://pharma.example/fiche/${token}` }));
vi.mock("@/server/services/patient-news", () => ({ newsOptInUrlFor: mocks.newsOptInUrlFor }));
vi.mock("@/config/env", () => ({ getEnv: () => ({ AUTH_SESSION_SECRET: "secret-de-session-pour-les-tests-0123456789", DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") }) }));

const { deliverDocumentAction } = await import("../documents");

const SESSION = { scope: { pharmacyId: "ph_1", organizationId: "org_1", userId: "user_1" }, pharmacy: { name: "Pharmacie Saint-Michel" } };
const OPT_IN_URL = "https://pharma.example/nouveautes/abonnement/jeton-chiffre";

function document(overrides: Record<string, unknown> = {}) {
  return {
    id: "doc_1",
    pharmacyId: "ph_1",
    prescriptionId: "rx_1",
    accessToken: "tok_abc",
    tokenExpiresAt: new Date("2027-01-08T10:00:00Z"),
    contentJson: { generatedAt: "2026-10-10T08:05:00Z", passageAt: "2026-10-10T08:00:00Z", treatment: [] },
    revokedAt: null,
    isDemo: false,
    patient: { firstName: "Marie", lastName: "Dupont", email: "marie.dupont@example.org", consents: [{ granted: true, revokedAt: null }] },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requirePermission.mockResolvedValue(SESSION);
  mocks.prisma.patientDocument.findUnique.mockResolvedValue(document());
  mocks.prisma.pharmacy.findUnique.mockResolvedValue({ phone: "01 23 45 67 89", brandColor: "#0F766E" });
  mocks.prisma.documentDelivery.create.mockResolvedValue({});
  mocks.sendEmail.mockResolvedValue({ status: "SENT", provider: "test", detail: "Remis au prestataire." });
  mocks.newsOptInUrlFor.mockResolvedValue(OPT_IN_URL);
});

const sent = () => mocks.sendEmail.mock.calls[0][0] as { to: string; subject: string; text: string; html: string };

describe("deliverDocumentAction (e-mail) et le lien d'abonnement aux nouveautés", () => {
  it("demande le lien pour l'officine de la session et l'adresse du patient, puis l'ajoute au message", async () => {
    const result = await deliverDocumentAction({ documentId: "doc_1", channel: "EMAIL" });
    expect(result).toMatchObject({ ok: true, data: { status: "SENT" } });
    expect(mocks.newsOptInUrlFor).toHaveBeenCalledWith("ph_1", "marie.dupont@example.org");
    const message = sent();
    expect(message.to).toBe("marie.dupont@example.org");
    expect(message.text).toContain(`Je souhaite être prévenu(e) : ${OPT_IN_URL}`);
    expect(message.html).toContain(`href="${OPT_IN_URL}"`);
    expect(message.text).toContain("Consulter mon plan : https://pharma.example/fiche/tok_abc");
    expect(message.text).toContain("Télécharger / imprimer : https://pharma.example/fiche/tok_abc?imprimer=1");
  });

  it("une adresse saisie au comptoir remplace celle de la fiche, pour l'envoi comme pour le lien", async () => {
    await deliverDocumentAction({ documentId: "doc_1", channel: "EMAIL", target: "autre@example.org" });
    expect(mocks.newsOptInUrlFor).toHaveBeenCalledWith("ph_1", "autre@example.org");
    expect(sent().to).toBe("autre@example.org");
  });

  it("fonction coupée : le plan part sans le bloc", async () => {
    mocks.newsOptInUrlFor.mockResolvedValue(null);
    await deliverDocumentAction({ documentId: "doc_1", channel: "EMAIL" });
    expect(sent().text).not.toContain("Facultatif");
    expect(sent().html).not.toContain("nouveautes");
  });

  it("le lien ne peut pas être préparé : le plan part quand même, sans le bloc", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.newsOptInUrlFor.mockRejectedValue(new Error("base indisponible"));
    const result = await deliverDocumentAction({ documentId: "doc_1", channel: "EMAIL" });
    expect(result).toMatchObject({ ok: true, data: { status: "SENT" } });
    expect(sent().text).toContain("Consulter mon plan");
    expect(sent().text).not.toContain("Facultatif");
    expect(JSON.stringify(errors.mock.calls)).not.toContain("marie");
    errors.mockRestore();
  });

  it("ne contourne pas le consentement au plan : sans accord, rien n'est préparé ni envoyé", async () => {
    mocks.prisma.patientDocument.findUnique.mockResolvedValue(document({ patient: { firstName: "Marie", lastName: "Dupont", email: "marie.dupont@example.org", consents: [] } }));
    const result = await deliverDocumentAction({ documentId: "doc_1", channel: "EMAIL" });
    expect(result.ok).toBe(false);
    expect(mocks.newsOptInUrlFor).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("le QR code ne prépare aucun lien d'abonnement : il n'y a pas d'adresse", async () => {
    await deliverDocumentAction({ documentId: "doc_1", channel: "QR_CODE" });
    expect(mocks.newsOptInUrlFor).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("l'audit de la remise ne porte aucune adresse", async () => {
    await deliverDocumentAction({ documentId: "doc_1", channel: "EMAIL" });
    expect(JSON.stringify(mocks.recordAudit.mock.calls)).not.toContain("marie");
    expect(JSON.stringify(mocks.recordAudit.mock.calls)).not.toContain(OPT_IN_URL);
  });
});
