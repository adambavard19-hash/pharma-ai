import { beforeEach, describe, expect, it, vi } from "vitest";

// Ni base, ni envoi réel, ni prestataire de signature : tout ce qui sort du processus est simulé.
const db = vi.hoisted(() => ({
  contract: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), findMany: vi.fn(), count: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  prospect: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  pharmacy: { findFirst: vi.fn() },
  plan: { findFirst: vi.fn(), findUnique: vi.fn() },
  emailTemplate: { findUnique: vi.fn() },
  companyProfile: { findUnique: vi.fn() },
  // Le rapprochement d'un nouveau dossier avec un confrère proposé au parrainage : aucun ici.
  referralLead: { findFirst: vi.fn().mockResolvedValue(null) },
}));
const messaging = vi.hoisted(() => ({ sendEmail: vi.fn() }));
const dispatch = vi.hoisted(() => ({ traceDispatch: vi.fn() }));
const events = vi.hoisted(() => ({ recordProspectEvent: vi.fn() }));
const audit = vi.hoisted(() => ({ recordAudit: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: db }));
vi.mock("@/server/audit/log", () => audit);
vi.mock("@/config/env", () => ({ getEnv: () => ({}) }));
vi.mock("@/server/db/advisory-lock", () => ({ withAdvisoryLock: (_key: string, fn: () => Promise<unknown>) => fn() }));
vi.mock("@/server/security/tokens", () => ({
  deriveToken: (seed: string) => `jeton-${seed}`,
  generateToken: () => "jeton-aleatoire",
  hashToken: (token: string) => `empreinte-${token}`,
  signPayload: () => "jeton-signe",
  verifyPayload: vi.fn(),
}));
vi.mock("@/server/ai/registry", () => ({ getMessagingProvider: () => messaging, getStorageProvider: vi.fn() }));
vi.mock("@/server/signature/registry", () => ({ getSignatureProvider: () => ({ info: { id: "none", label: "Aucun prestataire", capability: "NONE" } }) }));
vi.mock("@/server/public-url", () => ({ publicUrl: (path: string) => `https://exemple.invalid${path}` }));
vi.mock("@/server/services/email-context", () => ({
  platformEmailContext: async () => ({ baseUrl: "https://exemple.invalid", company: { legalName: "PharmaBoost SAS", address: null, siren: null, contactEmail: "contact@pharmaboost.app" } }),
}));
vi.mock("@/server/services/platform-settings", () => ({ loadReminderPolicy: vi.fn() }));
vi.mock("@/server/services/email-dispatch", () => dispatch);
vi.mock("@/server/services/sales/events", () => events);
vi.mock("@/server/services/sales/notifications", () => ({ notifyAdmins: vi.fn(), notifySalesRep: vi.fn() }));
vi.mock("@/server/services/sales/commissions", () => ({ upsertCommissionForContract: vi.fn() }));
vi.mock("@/server/services/referral", () => ({ resolveReferralCode: async () => null }));

const { DEFAULT_REMINDER_POLICY } = await import("@/core/contracts/reminders");
const contracts = await import("@/server/services/sales/contracts");
const subscriptions = await import("@/server/services/subscription-requests");
const siteLeads = await import("@/server/services/site-leads");

const NOW = new Date("2026-10-03T10:00:00Z");
const HOUR = 3_600_000;
const SENT: { status: "SENT"; provider: string; detail: string; messageId: string } = { status: "SENT", provider: "resend", detail: "Message transmis à Resend.", messageId: "msg-1" };
const FAILED: { status: "FAILED"; provider: string; detail: string } = { status: "FAILED", provider: "resend", detail: "Resend a refusé le message (domaine non vérifié)." };

/** Une ligne de contrat qui sert à la fois au contrat seul et à ses faits (offre, dossier). */
const contractRow = (over: Record<string, unknown> = {}) => ({
  id: "c2",
  prospectId: "p1",
  pharmacyId: "ph1",
  version: 2,
  status: "OPENED",
  reference: "PB-2026-PORT-V2",
  createdAt: new Date("2026-09-20T10:00:00Z"),
  monthlyPriceCents: 12900,
  durationMonths: 12,
  trialDays: 30,
  pharmacySignerName: "Marc Delaunay",
  pharmacySignerEmail: "marc@port.fr",
  pharmacySigningUrl: null,
  companySignerName: "Adam Bavard",
  companySignerEmail: "contact@pharmaboost.app",
  providerEnvelopeId: null,
  signatureProvider: null,
  sentAt: new Date("2026-09-25T10:00:00Z"),
  openedAt: new Date("2026-09-26T10:00:00Z"),
  pharmacySignedAt: null,
  companySignedAt: null,
  finalizedAt: null,
  expiresAt: new Date("2026-10-25T10:00:00Z"),
  reminderCount: 1,
  lastReminderAt: new Date(NOW.getTime() - 48 * HOUR),
  escalatedAt: null,
  plan: { name: "Officine" },
  prospect: { id: "p1", name: "Pharmacie du Port", legalName: "SELARL Pharmacie du Port", salesRepId: null, salesRep: null, origin: "ADMIN", status: "CONTRACT_SENT", blockedAt: null, phone: null },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.contract.updateMany.mockResolvedValue({ count: 1 });
  db.contract.update.mockResolvedValue({});
  db.emailTemplate.findUnique.mockResolvedValue(null);
  messaging.sendEmail.mockResolvedValue(SENT);
});

describe("e-mails système tracés dans l'historique des communications", () => {
  it("signature de l'officine reçue : l'e-mail au titulaire laisse sa ligne, rattachée au dossier, à l'officine et au contrat", async () => {
    const row = contractRow();
    db.contract.findUniqueOrThrow.mockResolvedValue(row);
    db.contract.findUnique.mockResolvedValue({ ...row, status: "SIGNED_PHARMACY", pharmacySignedAt: NOW });

    expect(await contracts.applySignatureStatus("c2", "SIGNED_PHARMACY", { type: "SIGNER", label: "Prestataire de signature" })).toBe(true);

    expect(messaging.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "marc@port.fr", subject: "Nous avons bien reçu votre signature" }));
    expect(dispatch.traceDispatch).toHaveBeenCalledWith({ kind: "CONTRACT_SIGNED_PHARMACY", recipient: "marc@port.fr", outcome: SENT, subject: "Nous avons bien reçu votre signature", trigger: "SYSTEM", prospectId: "p1", pharmacyId: "ph1", contractId: "c2" });
  });

  it("contrat finalisé : tracé aussi quand l'envoi échoue, avec le motif du prestataire", async () => {
    const row = contractRow({ status: "SIGNED_COMPANY" });
    db.contract.findUniqueOrThrow.mockResolvedValue(row);
    db.contract.findUnique.mockResolvedValue({ ...row, status: "FINALIZED", finalizedAt: NOW });
    messaging.sendEmail.mockResolvedValue(FAILED);

    await contracts.applySignatureStatus("c2", "FINALIZED", { type: "SIGNER", label: "Prestataire de signature" });

    expect(dispatch.traceDispatch).toHaveBeenCalledWith(expect.objectContaining({ kind: "CONTRACT_FINALIZED", outcome: FAILED, subject: "Votre contrat PharmaBoost est signé", trigger: "SYSTEM", prospectId: "p1", contractId: "c2" }));
  });

  const request = { pharmacyName: "Pharmacie du Port", legalName: "SELARL Pharmacie du Port", siret: "73282932000074", addressLine1: "1 quai du Port", postalCode: "13002", city: "Marseille", ownerFirstName: "Marc", ownerLastName: "Delaunay", ownerTitle: "Pharmacien titulaire", ownerEmail: "marc@port.fr" };

  it("souscription d'un nouveau dossier : l'accusé de réception est tracé ; plus de demande de confirmation d'adresse, le contrat est retenu", async () => {
    db.plan.findFirst.mockResolvedValue(null);
    db.pharmacy.findFirst.mockResolvedValue(null);
    db.prospect.findMany.mockResolvedValue([]);
    db.prospect.create.mockResolvedValue({ id: "p-new" });

    const result = await subscriptions.requestSubscription(request);

    expect(result).toMatchObject({ ok: true, outcome: { status: "RECEIVED", prospectId: "p-new" } });
    expect(dispatch.traceDispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.traceDispatch).toHaveBeenCalledWith({ kind: "SUBSCRIPTION_RECEIVED", recipient: "marc@port.fr", outcome: SENT, subject: "Votre demande d'abonnement PharmaBoost est bien reçue", trigger: "SYSTEM", prospectId: "p-new", pharmacyId: null });
    expect(dispatch.traceDispatch).not.toHaveBeenCalledWith(expect.objectContaining({ kind: "EMAIL_CONFIRMATION" }));
  });

  it("souscription pour un SIRET déjà connu : l'accusé de réception est tracé sur le dossier et l'officine existants", async () => {
    db.plan.findFirst.mockResolvedValue(null);
    db.pharmacy.findFirst.mockResolvedValue({ id: "ph1", name: "Pharmacie du Port", prospect: { id: "p1" } });
    db.prospect.findMany.mockResolvedValue([{ id: "p1", name: "Pharmacie du Port", salesRepId: null }]);
    messaging.sendEmail.mockResolvedValue(FAILED);

    const result = await subscriptions.requestSubscription(request);

    expect(result).toMatchObject({ ok: true, outcome: { status: "RECEIVED", prospectId: "p1" } });
    expect(db.prospect.create).not.toHaveBeenCalled();
    expect(dispatch.traceDispatch).toHaveBeenCalledWith({ kind: "SUBSCRIPTION_RECEIVED", recipient: "marc@port.fr", outcome: FAILED, subject: "Votre demande d'abonnement PharmaBoost est bien reçue", trigger: "SYSTEM", prospectId: "p1", pharmacyId: "ph1" });
  });

  it("demande de démonstration : l'accusé de réception au demandeur est tracé", async () => {
    db.prospect.findFirst.mockResolvedValue(null);
    db.prospect.create.mockResolvedValue({ id: "p-demo" });
    db.companyProfile.findUnique.mockResolvedValue({ representativeEmail: "contact@pharmaboost.app" });

    const result = await siteLeads.receiveSiteLead({ kind: "DEMO", pharmacyName: "Pharmacie de la Gare", contactName: "Camille Martin", email: "camille@gare.fr", phone: null, city: "Lyon", lgo: null, postCount: null, message: null, preferredSlot: null, referralCode: null });

    expect(result).toEqual({ prospectId: "p-demo", acknowledged: true });
    expect(dispatch.traceDispatch).toHaveBeenCalledWith({ kind: "SITE_LEAD_ACK", recipient: "camille@gare.fr", outcome: SENT, subject: "Votre demande de démonstration — PharmaBoost", trigger: "SYSTEM", prospectId: "p-demo" });
  });
});

describe("envoi d'un contrat : une version remplacée ne part jamais", () => {
  it("refuse au niveau du moteur, quel que soit l'écran appelant, sans rien envoyer, et libère le verrou d'envoi", async () => {
    db.contract.findUnique.mockResolvedValue(contractRow({ status: "DRAFT", sentAt: null, openedAt: null }));
    db.contract.count.mockResolvedValue(1);

    const result = await contracts.sendContract("c2", { type: "ADMIN", id: "admin-1", label: "Adam" });

    expect(result).toEqual({ ok: false, error: "Une version plus récente de ce contrat existe : cette version ne peut plus être envoyée." });
    expect(db.contract.count).toHaveBeenCalledWith({ where: { prospectId: "p1", version: { gt: 2 } } });
    expect(messaging.sendEmail).not.toHaveBeenCalled();
    expect(dispatch.traceDispatch).not.toHaveBeenCalled();
    expect(db.contract.update).toHaveBeenCalledTimes(1);
    expect(db.contract.update).toHaveBeenCalledWith({ where: { id: "c2" }, data: { sendLockedAt: null } });
  });

  it("la dernière version part normalement", async () => {
    db.contract.findUnique.mockResolvedValue(contractRow({ status: "DRAFT", sentAt: null, openedAt: null }));
    db.contract.count.mockResolvedValue(0);
    db.prospect.update.mockResolvedValue({});

    const result = await contracts.sendContract("c2", { type: "ADMIN", id: "admin-1", label: "Adam" });

    expect(result).toMatchObject({ ok: true, email: { status: "SENT" } });
    expect(messaging.sendEmail).toHaveBeenCalledTimes(1);
    expect(dispatch.traceDispatch).toHaveBeenCalledWith(expect.objectContaining({ kind: "CONTRACT_SENT", contractId: "c2" }));
  });
});

describe("relance manuelle d'un contrat", () => {
  const admin = { type: "ADMIN" as const, id: "admin-1", label: "Adam" };
  const previous = new Date(NOW.getTime() - 48 * HOUR);
  const releaseCall = { where: { id: "c2", reminderCount: 2, lastReminderAt: NOW }, data: { reminderCount: 1, lastReminderAt: previous } };

  it("un envoi en échec ne compte pas : compteur et date remis à leur valeur, échec tracé, nouvel essai possible aussitôt", async () => {
    const row = contractRow({ status: "SENT", reminderCount: 1, lastReminderAt: previous });
    db.contract.findUnique.mockResolvedValue(row);
    messaging.sendEmail.mockResolvedValue(FAILED);

    const result = await contracts.remindContractNow("c2", admin, NOW);

    expect(result).toEqual({ ok: true, email: { status: "FAILED", detail: FAILED.detail } });
    // Réservation conditionnelle, puis restitution conditionnelle (personne n'a relancé entre-temps).
    expect(db.contract.updateMany).toHaveBeenCalledWith({ where: { id: "c2", reminderCount: 1, status: { in: ["SENT", "OPENED"] } }, data: { reminderCount: { increment: 1 }, lastReminderAt: NOW } });
    expect(db.contract.updateMany).toHaveBeenCalledWith(releaseCall);
    expect(dispatch.traceDispatch).toHaveBeenCalledWith(expect.objectContaining({ kind: "CONTRACT_REMINDER", outcome: FAILED, trigger: "MANUAL", contractId: "c2", sentByAdminId: "admin-1" }));
    expect(events.recordProspectEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "CONTRACT_REMINDER", summary: `Relance 2 NON envoyée : ${FAILED.detail}` }));
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "sales.contract_reminded", platformAdminId: "admin-1", metadata: { reminder: 2, emailStatus: "FAILED", released: true, reminderCount: { from: 1, to: 1 } } }));

    // Le nouvel essai n'est pas bloqué par « une relance est déjà partie il y a moins de 24 heures ».
    vi.clearAllMocks();
    db.contract.updateMany.mockResolvedValue({ count: 1 });
    db.emailTemplate.findUnique.mockResolvedValue(null);
    db.contract.findUnique.mockResolvedValue(row);
    messaging.sendEmail.mockResolvedValue(SENT);
    const retry = await contracts.remindContractNow("c2", admin, new Date(NOW.getTime() + 60_000));
    expect(retry).toEqual({ ok: true, email: { status: "SENT", detail: SENT.detail } });
  });

  it("un envoi réussi compte : aucune restitution", async () => {
    db.contract.findUnique.mockResolvedValue(contractRow({ status: "OPENED", reminderCount: 1, lastReminderAt: previous }));

    await contracts.remindContractNow("c2", admin, NOW);

    expect(db.contract.updateMany).not.toHaveBeenCalledWith(releaseCall);
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ metadata: { reminder: 2, emailStatus: "SENT", released: false, reminderCount: { from: 1, to: 2 } } }));
  });

  it("une erreur avant l'envoi rend aussi la réservation", async () => {
    db.contract.findUnique.mockResolvedValue(contractRow({ status: "SENT", reminderCount: 1, lastReminderAt: previous }));
    db.emailTemplate.findUnique.mockRejectedValue(new Error("base indisponible"));

    await expect(contracts.remindContractNow("c2", admin, NOW)).rejects.toThrow("base indisponible");

    expect(messaging.sendEmail).not.toHaveBeenCalled();
    expect(db.contract.updateMany).toHaveBeenCalledWith(releaseCall);
  });

  it("un e-mail remis garde sa réservation même si le journal du dossier échoue ensuite", async () => {
    db.contract.findUnique.mockResolvedValue(contractRow({ status: "SENT", reminderCount: 1, lastReminderAt: previous }));
    events.recordProspectEvent.mockRejectedValueOnce(new Error("base indisponible"));

    await expect(contracts.remindContractNow("c2", admin, NOW)).rejects.toThrow("base indisponible");

    expect(messaging.sendEmail).toHaveBeenCalledTimes(1);
    expect(db.contract.updateMany).not.toHaveBeenCalledWith(releaseCall);
  });

  it("la relance automatique garde son comportement : un échec reste compté, rien n'est restitué", async () => {
    const row = contractRow({ status: "SENT", reminderCount: 0, lastReminderAt: null, sentAt: new Date(NOW.getTime() - 10 * 24 * HOUR) });
    db.contract.findMany.mockResolvedValue([row]);
    db.contract.findUnique.mockResolvedValue(row);
    messaging.sendEmail.mockResolvedValue(FAILED);

    const report = await contracts.runContractReminders(NOW, DEFAULT_REMINDER_POLICY);

    expect(report).toMatchObject({ checked: 1, reminded: 0, errors: [] });
    expect(db.contract.updateMany).toHaveBeenCalledWith({ where: { id: "c2", reminderCount: 0, status: { in: ["SENT", "OPENED"] } }, data: { reminderCount: { increment: 1 }, lastReminderAt: NOW } });
    expect(db.contract.updateMany.mock.calls.some(([arg]) => typeof arg.data?.reminderCount === "number")).toBe(false);
    expect(dispatch.traceDispatch).toHaveBeenCalledWith(expect.objectContaining({ kind: "CONTRACT_REMINDER", outcome: FAILED, trigger: "AUTOMATIC" }));
  });
});
