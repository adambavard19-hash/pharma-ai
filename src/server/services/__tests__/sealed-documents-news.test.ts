import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentContent } from "@/core/documents/types";

/**
 * L'e-mail du plan scellé (mode sans patient) porte le lien facultatif
 * d'abonnement aux nouveautés. L'adresse est utilisée une fois pour l'envoi ;
 * le lien la porte chiffrée ; rien ne la conserve. Et aucune panne du lien ne
 * retarde la remise du plan.
 */

const mocks = vi.hoisted(() => ({
  newsOptInUrlFor: vi.fn(),
  sendEmail: vi.fn(),
  recordAudit: vi.fn(),
  prisma: { sealedDocument: { findUnique: vi.fn() }, pharmacy: { findUnique: vi.fn() } },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: mocks.prisma }));
vi.mock("@/server/ai/registry", () => ({ getMessagingProvider: () => ({ info: { capability: "LIVE" }, sendEmail: mocks.sendEmail }) }));
vi.mock("@/server/audit/log", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@/server/public-url", () => ({ resolvePublicBaseUrl: () => ({ url: "https://pharma.example", reach: "PUBLIC", secure: true }), publicUrl: (path: string) => `https://pharma.example${path}` }));
vi.mock("@/server/services/documents", () => ({ composeDocumentContent: vi.fn() }));
vi.mock("@/server/services/patient-news", () => ({ newsOptInUrlFor: mocks.newsOptInUrlFor }));
vi.mock("@/config/env", () => ({ getEnv: () => ({ AUTH_SESSION_SECRET: "secret-de-session-pour-les-tests-0123456789", DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") }) }));

const { emailSealedDocument } = await import("../sealed-documents");

const TO = "marie.dupont@example.org";
const PLAN_URL = "https://pharma.example/plan/doc_1#cle";
const OPT_IN_URL = "https://pharma.example/nouveautes/abonnement/jeton-chiffre";
const CONTENT = { pharmacy: { name: "Pharmacie Saint-Michel", phone: "01 23 45 67 89", brandColor: "#0F766E" }, passageAt: "2026-10-10T08:00:00Z", generatedAt: "2026-10-10T08:05:00Z", treatment: [] } as unknown as DocumentContent;
const PARAMS = { scope: { pharmacyId: "ph_1", userId: "user_1" }, documentId: "doc_1", url: PLAN_URL, to: TO, content: CONTENT };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.sealedDocument.findUnique.mockResolvedValue({ pharmacyId: "ph_1", expiresAt: new Date("2027-01-08T10:00:00Z"), isDemo: false });
  mocks.sendEmail.mockResolvedValue({ status: "SENT", provider: "test", detail: "Remis au prestataire." });
  mocks.newsOptInUrlFor.mockResolvedValue(OPT_IN_URL);
});

const sent = () => mocks.sendEmail.mock.calls[0][0] as { to: string; fromName: string; subject: string; text: string; html: string };

describe("emailSealedDocument et le lien d'abonnement aux nouveautés", () => {
  it("demande le lien pour l'officine de la SESSION et l'adresse du comptoir, puis l'ajoute au message", async () => {
    const outcome = await emailSealedDocument(PARAMS);
    expect(outcome).toEqual({ status: "SENT", detail: "Remis au prestataire." });
    expect(mocks.newsOptInUrlFor).toHaveBeenCalledTimes(1);
    expect(mocks.newsOptInUrlFor).toHaveBeenCalledWith("ph_1", TO);

    const message = sent();
    expect(message.to).toBe(TO);
    expect(message.text).toContain(`Je souhaite être prévenu(e) : ${OPT_IN_URL}`);
    expect(message.html).toContain(`href="${OPT_IN_URL}"`);
    // Le plan reste le geste principal, avec son propre lien.
    expect(message.text).toContain(`Consulter mon plan : ${PLAN_URL}`);
    expect(message.subject).toBe("Votre plan personnalisé — Pharmacie Saint-Michel");
  });

  it("l'adresse n'est conservée nulle part : aucune écriture, et la trace ne porte que la forme masquée", async () => {
    await emailSealedDocument(PARAMS);
    // Le faux Prisma n'expose que des lectures : une écriture lèverait une erreur.
    expect(Object.keys(mocks.prisma.sealedDocument)).toEqual(["findUnique"]);
    expect(mocks.recordAudit).toHaveBeenCalledTimes(1);
    expect(mocks.recordAudit.mock.calls[0][0]).toMatchObject({ action: "document.delivered", metadata: { channel: "EMAIL", status: "SENT", target: "m***@example.org" } });
    expect(JSON.stringify(mocks.recordAudit.mock.calls)).not.toContain(TO);
  });

  it("fonction coupée par l'officine : le plan part sans le bloc", async () => {
    mocks.newsOptInUrlFor.mockResolvedValue(null);
    await emailSealedDocument(PARAMS);
    const message = sent();
    expect(message.text).not.toContain("Facultatif");
    expect(message.text).not.toContain("nouveautes");
    expect(message.html).not.toContain("nouveautes");
  });

  it("le lien ne peut pas être préparé (rejet asynchrone ou exception) : le plan part quand même, sans le bloc", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.newsOptInUrlFor.mockRejectedValueOnce(new Error("base indisponible"));
    expect(await emailSealedDocument(PARAMS)).toEqual({ status: "SENT", detail: "Remis au prestataire." });
    expect(sent().text).toContain(`Consulter mon plan : ${PLAN_URL}`);
    expect(sent().text).not.toContain("Facultatif");

    mocks.sendEmail.mockClear();
    mocks.newsOptInUrlFor.mockImplementationOnce(() => {
      throw new Error("exception synchrone");
    });
    expect(await emailSealedDocument(PARAMS)).toEqual({ status: "SENT", detail: "Remis au prestataire." });
    expect(sent().text).not.toContain("Facultatif");
    // Une trace pour l'exploitation, sans l'adresse du patient.
    expect(errors).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(errors.mock.calls)).not.toContain(TO);
    errors.mockRestore();
  });

  it("sans le lien, le message est exactement celui d'avant", async () => {
    mocks.newsOptInUrlFor.mockResolvedValue(null);
    await emailSealedDocument(PARAMS);
    const { buildDocumentEmail } = await import("@/core/documents/email");
    const { summarizeDayPlan } = await import("@/core/documents/compose");
    const expected = buildDocumentEmail({ patientFirstName: "", pharmacyName: "Pharmacie Saint-Michel", pharmacyPhone: "01 23 45 67 89", brandColor: "#0F766E", passageAt: new Date("2026-10-10T08:00:00Z"), dayPlan: summarizeDayPlan([]), url: PLAN_URL, printUrl: null, expiresAt: new Date("2027-01-08T10:00:00Z"), isDemo: false });
    expect(sent().text).toBe(expected.text);
    expect(sent().html).toBe(expected.html);
  });

  it("un plan d'une autre officine est refusé avant tout : pas de lien préparé, rien n'est envoyé", async () => {
    mocks.prisma.sealedDocument.findUnique.mockResolvedValue({ pharmacyId: "ph_autre", expiresAt: new Date("2027-01-08T10:00:00Z"), isDemo: false });
    await expect(emailSealedDocument(PARAMS)).rejects.toThrow("Plan introuvable dans cette officine.");
    expect(mocks.newsOptInUrlFor).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("le résultat d'envoi reste fidèle : un envoi simulé ou en échec n'est pas déguisé", async () => {
    mocks.sendEmail.mockResolvedValue({ status: "SIMULATED", provider: "none", detail: "Aucun fournisseur." });
    expect(await emailSealedDocument(PARAMS)).toEqual({ status: "SIMULATED", detail: "Aucun fournisseur." });
  });
});

describe("de bout en bout avec le vrai service d'abonnement", () => {
  it("le lien du message ouvre l'abonnement de cette officine pour cette adresse, et ne la montre pas en clair", async () => {
    const real = await vi.importActual<typeof import("../patient-news")>("../patient-news");
    mocks.prisma.pharmacy.findUnique.mockResolvedValue({ isActive: true, patientNewsEnabled: true });
    mocks.newsOptInUrlFor.mockImplementation(real.newsOptInUrlFor);

    await emailSealedDocument(PARAMS);
    const message = sent();
    const link = /https:\/\/pharma\.example\/nouveautes\/abonnement\/[A-Za-z0-9_-]+/.exec(message.text)![0];
    const { openToken } = await import("@/server/security/tokens");
    expect(openToken("news-optin", link.split("/").pop()!)).toMatchObject({ p: "ph_1", e: TO });
    expect(link).not.toContain("marie");
    expect(link).not.toContain("example.org");
    // L'adresse n'apparaît dans le message qu'en destinataire, pas dans le corps.
    expect(`${message.text}${message.html}`).not.toContain(TO);
  });
});
