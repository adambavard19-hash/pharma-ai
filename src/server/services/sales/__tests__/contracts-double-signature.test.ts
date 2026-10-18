import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Le webhook de signature, de bout en bout côté service, sur une base en
 * mémoire : un contrat de pharmacie et un contrat d'affiliation, des
 * événements DocuSeal dans l'ordre, rejoués, ou en désordre.
 */
type Row = Record<string, unknown> & { id: string; status: string };

const store = vi.hoisted(() => ({ contract: null as Row | null, affiliate: null as Row | null, updates: [] as { table: string; data: Record<string, unknown> }[] }));

function applyWhere(row: Row | null, where: Record<string, unknown>, data: Record<string, unknown>, table: string) {
  if (!row || row.id !== where.id) return { count: 0 };
  if (where.status !== undefined && row.status !== where.status) return { count: 0 };
  if (where.signedArchivedAt === null && row.signedArchivedAt) return { count: 0 };
  Object.assign(row, data);
  store.updates.push({ table, data });
  return { count: 1 };
}

const db = vi.hoisted(() => ({
  contract: {
    findFirst: vi.fn(async ({ where }: { where: { providerEnvelopeId: string } }) => (store.contract && store.contract.providerEnvelopeId === where.providerEnvelopeId ? store.contract : null)),
    findUnique: vi.fn(async () => store.contract),
    findUniqueOrThrow: vi.fn(async () => store.contract),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => applyWhere(store.contract, where, data, "contract")),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => Object.assign(store.contract!, data)),
  },
  affiliateContract: {
    findUnique: vi.fn(async ({ where }: { where: { id?: string; providerEnvelopeId?: string } }) => {
      const row = store.affiliate;
      if (!row) return null;
      if (where.providerEnvelopeId !== undefined) return row.providerEnvelopeId === where.providerEnvelopeId ? row : null;
      return row.id === where.id ? row : null;
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => applyWhere(store.affiliate, where, data, "affiliate")),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => Object.assign(store.affiliate!, data)),
  },
  prospect: { update: vi.fn() },
  emailTemplate: { findUnique: vi.fn() },
}));
const notifications = vi.hoisted(() => ({ notifyAdmins: vi.fn(), notifySalesRep: vi.fn() }));
const commissions = vi.hoisted(() => ({ upsertCommissionForContract: vi.fn() }));
const provider = vi.hoisted(() => ({
  info: { id: "docuseal", label: "DocuSeal (UE)", capability: "LIVE", description: "" },
  getStatus: vi.fn(),
  downloadSigned: vi.fn(async () => new Uint8Array([37, 80, 68, 70])),
}));
const storage = vi.hoisted(() => ({ files: new Map<string, Uint8Array>() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: db }));
vi.mock("@/server/audit/log", () => ({ recordAudit: vi.fn() }));
vi.mock("@/config/env", () => ({ getEnv: () => ({}) }));
vi.mock("@/server/db/advisory-lock", () => ({ withAdvisoryLock: vi.fn((_k: string, fn: () => unknown) => fn()) }));
vi.mock("@/server/security/tokens", () => ({ deriveToken: () => "jeton-de-test-0123456789", generateToken: () => "x", hashToken: (t: string) => `h:${t}` }));
vi.mock("@/server/ai/registry", () => ({
  getMessagingProvider: () => ({ sendEmail: vi.fn(async () => ({ status: "SENT", detail: "ok" })) }),
  getStorageProvider: () => ({ read: async (key: string) => storage.files.get(key) ?? null, put: async (key: string, bytes: Uint8Array) => void storage.files.set(key, bytes) }),
}));
vi.mock("@/server/signature/registry", () => ({ getSignatureProvider: () => provider }));
vi.mock("@/server/public-url", () => ({ publicUrl: (path: string) => `https://exemple.invalid${path}` }));
vi.mock("@/server/services/email-context", () => ({ platformEmailContext: vi.fn(async () => ({ appName: "PharmaBoost", baseUrl: "https://exemple.invalid" })) }));
vi.mock("@/server/services/platform-settings", () => ({ loadReminderPolicy: vi.fn() }));
vi.mock("@/server/services/email-dispatch", () => ({ traceDispatch: vi.fn() }));
vi.mock("@/server/services/sales/events", () => ({ recordProspectEvent: vi.fn() }));
vi.mock("@/server/services/sales/notifications", () => notifications);
vi.mock("@/server/services/sales/commissions", () => commissions);
vi.mock("@/core/platform/contract-emails", () => ({
  buildContractFinalizedEmail: () => ({ subject: "Contrat signé", text: "", html: "" }),
  buildPharmacySignedEmail: () => ({ subject: "Signature reçue", text: "", html: "" }),
  buildSignatureReminderEmail: () => ({ subject: "", text: "", html: "" }),
  buildSignatureRequestEmail: () => ({ subject: "", text: "", html: "" }),
}));

const { handleSignatureEvent } = await import("../contracts");

const at = (h: number) => new Date(`2026-10-18T${String(h).padStart(2, "0")}:00:00Z`);
const event = (status: string, role: string | undefined, h: number, envelopeId = "env-pharmacie") => ({ envelopeId, status, role, occurredAt: at(h), verified: true, reason: null }) as Parameters<typeof handleSignatureEvent>[0];

beforeEach(() => {
  vi.clearAllMocks();
  store.updates = [];
  storage.files.clear();
  store.contract = {
    id: "c1",
    prospectId: "p1",
    version: 1,
    status: "SENT",
    fileKey: "plateforme/contrats/p1/PB-1.pdf",
    providerEnvelopeId: "env-pharmacie",
    signatureProvider: "docuseal",
    pharmacySignerName: "Claire Dumont",
    pharmacySignerEmail: "claire@officine.fr",
    companySignerName: "PharmaBoost",
    companySignerEmail: "contact@pharmaboost.app",
    pharmacySignedAt: null,
    companySignedAt: null,
    openedAt: null,
    finalizedAt: null,
    signedArchivedAt: null,
    monthlyPriceCents: 12600,
    setupFeeCents: 15000,
    durationMonths: 12,
    trialDays: 0,
    pharmacyId: null,
    reference: "PB-1",
    plan: null,
    prospect: { id: "p1", name: "Pharmacie du Port", legalName: null, salesRepId: null, status: "CONTRACT_SENT", origin: "SUPER_ADMIN", salesRep: null },
  };
  store.affiliate = {
    id: "a1",
    salesRepId: "rep1",
    status: "SENT",
    fileKey: "plateforme/contrats-affilies/rep1/PB-AFF-1.pdf",
    providerEnvelopeId: "env-affilie",
    signatureProvider: "docuseal",
    affiliateSignerName: "Julie Lefèvre",
    companySignerEmail: "contact@pharmaboost.app",
    affiliateSignedAt: null,
    companySignedAt: null,
    openedAt: null,
    signedArchivedAt: null,
  };
});

describe("webhook — contrat de la pharmacie", () => {
  it("titulaire puis PharmaBoost : « en attente de PharmaBoost », puis « signé par les deux » seulement après la contresignature", async () => {
    expect(await handleSignatureEvent(event("SIGNED_PHARMACY", "PHARMACY", 9))).toBe(true);
    expect(store.contract!.status).toBe("SIGNED_PHARMACY");
    expect(store.contract!.pharmacySignedAt).toEqual(at(9));
    expect(store.contract!.finalizedAt).toBeNull();
    expect(commissions.upsertCommissionForContract).not.toHaveBeenCalled();
    expect(notifications.notifyAdmins).toHaveBeenCalledWith(expect.objectContaining({ type: "CONTRACT_SIGNED_PHARMACY", linkUrl: "/admin/contrats?statut=a-contresigner" }));

    expect(await handleSignatureEvent(event("SIGNED_COMPANY", "COMPANY", 10))).toBe(true);
    expect(store.contract!.status).toBe("FINALIZED");
    expect(store.contract!.companySignedAt).toEqual(at(10));
    expect(store.contract!.finalizedAt).toBeInstanceOf(Date);
    expect(commissions.upsertCommissionForContract).toHaveBeenCalledWith(expect.objectContaining({ status: "EARNED" }));
    // Le PDF signé est archivé à la finalisation.
    expect(storage.files.has("plateforme/contrats/p1/PB-1-signe.pdf")).toBe(true);
  });

  it("webhook rejoué : aucune mise à jour, aucune notification, aucun e-mail en double", async () => {
    await handleSignatureEvent(event("SIGNED_PHARMACY", "PHARMACY", 9));
    const updates = store.updates.length;
    const notified = notifications.notifyAdmins.mock.calls.length;
    expect(await handleSignatureEvent(event("SIGNED_PHARMACY", "PHARMACY", 11))).toBe(true);
    expect(store.updates.length).toBe(updates);
    expect(notifications.notifyAdmins.mock.calls.length).toBe(notified);
    expect(store.contract!.pharmacySignedAt).toEqual(at(9));

    await handleSignatureEvent(event("SIGNED_COMPANY", "COMPANY", 10));
    await handleSignatureEvent(event("FINALIZED", undefined, 10));
    await handleSignatureEvent(event("SIGNED_COMPANY", "COMPANY", 12));
    expect(commissions.upsertCommissionForContract.mock.calls.filter(([arg]) => (arg as { status: string }).status === "EARNED")).toHaveLength(1);
    expect(store.contract!.status).toBe("FINALIZED");
  });

  it("refusé puis expiré : le refus reste ; un contrat signé des deux ne peut plus être refusé", async () => {
    await handleSignatureEvent(event("REFUSED", undefined, 9));
    expect(store.contract!.status).toBe("REFUSED");
    await handleSignatureEvent(event("EXPIRED", undefined, 10));
    expect(store.contract!.status).toBe("REFUSED");

    store.contract = { ...store.contract!, status: "FINALIZED" };
    await handleSignatureEvent(event("REFUSED", undefined, 11));
    expect(store.contract!.status).toBe("FINALIZED");
  });

  it("notification non authentifiée : seul l'état relu chez DocuSeal fait foi", async () => {
    provider.getStatus.mockResolvedValueOnce("SENT");
    await handleSignatureEvent({ ...event("FINALIZED", undefined, 9), verified: false });
    expect(provider.getStatus).toHaveBeenCalledWith("env-pharmacie");
    expect(store.contract!.status).toBe("SENT");
  });
});

describe("webhook — contrat d'affiliation", () => {
  it("l'affilié signe, puis PharmaBoost : signé seulement après les deux, idempotent", async () => {
    expect(await handleSignatureEvent(event("SIGNED_PHARMACY", "AFFILIATE", 9, "env-affilie"))).toBe(true);
    expect(store.affiliate!.status).toBe("SIGNED_PHARMACY");
    expect(store.affiliate!.affiliateSignedAt).toEqual(at(9));
    expect(notifications.notifyAdmins).toHaveBeenCalledWith(expect.objectContaining({ type: "AFFILIATE_CONTRACT_SIGNED", linkUrl: "/admin/contrats?statut=a-contresigner" }));

    await handleSignatureEvent(event("SIGNED_PHARMACY", "AFFILIATE", 10, "env-affilie"));
    expect(store.affiliate!.affiliateSignedAt).toEqual(at(9));

    await handleSignatureEvent(event("SIGNED_COMPANY", "COMPANY", 11, "env-affilie"));
    expect(store.affiliate!.status).toBe("FINALIZED");
    expect(store.affiliate!.companySignedAt).toEqual(at(11));
    expect(notifications.notifySalesRep).toHaveBeenCalledWith(expect.objectContaining({ salesRepId: "rep1", type: "AFFILIATE_CONTRACT_FINALIZED" }));
    expect(storage.files.has("plateforme/contrats-affilies/rep1/PB-AFF-1-signe.pdf")).toBe(true);

    const finalizedNotices = notifications.notifySalesRep.mock.calls.length;
    await handleSignatureEvent(event("FINALIZED", undefined, 12, "env-affilie"));
    expect(notifications.notifySalesRep.mock.calls.length).toBe(finalizedNotices);
  });

  it("une enveloppe inconnue des deux registres est ignorée", async () => {
    expect(await handleSignatureEvent(event("SIGNED_PHARMACY", "PHARMACY", 9, "env-inconnue"))).toBe(false);
    expect(store.updates).toHaveLength(0);
  });
});
