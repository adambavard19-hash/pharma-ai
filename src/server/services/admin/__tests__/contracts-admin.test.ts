import { beforeEach, describe, expect, it, vi } from "vitest";

// Ni base, ni session, ni envoi : tout ce qui sort du processus est simulé.
const db = vi.hoisted(() => ({
  companyProfile: { findUnique: vi.fn(), upsert: vi.fn() },
  contract: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), upsert: vi.fn(), delete: vi.fn(), deleteMany: vi.fn(), count: vi.fn() },
  plan: { findFirst: vi.fn() },
}));
const audit = vi.hoisted(() => ({ recordAudit: vi.fn() }));
const session = vi.hoisted(() => ({ getPlatformSession: vi.fn(), requirePlatformSession: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: db }));
vi.mock("@/server/audit/log", () => audit);
vi.mock("@/server/auth/platform-session", () => session);
vi.mock("@/config/env", () => ({ getEnv: () => ({}) }));
vi.mock("@/server/db/advisory-lock", () => ({ withAdvisoryLock: vi.fn() }));
vi.mock("@/server/security/tokens", () => ({ deriveToken: vi.fn(), generateToken: vi.fn(), hashToken: vi.fn() }));
vi.mock("@/server/ai/registry", () => ({ getMessagingProvider: vi.fn(), getStorageProvider: vi.fn() }));
vi.mock("@/server/signature/registry", () => ({ getSignatureProvider: vi.fn() }));
vi.mock("@/server/public-url", () => ({ publicUrl: (path: string) => `https://exemple.invalid${path}` }));
vi.mock("@/server/services/email-context", () => ({ platformEmailContext: vi.fn() }));
vi.mock("@/server/services/platform-settings", () => ({ loadReminderPolicy: vi.fn() }));
vi.mock("@/server/services/email-dispatch", () => ({ traceDispatch: vi.fn() }));
vi.mock("@/server/services/sales/events", () => ({ recordProspectEvent: vi.fn() }));
vi.mock("@/server/services/sales/notifications", () => ({ notifyAdmins: vi.fn(), notifySalesRep: vi.fn() }));
vi.mock("@/server/services/sales/commissions", () => ({ upsertCommissionForContract: vi.fn() }));

const view = await import("@/core/contracts/admin-view");
const admin = await import("../contracts-admin");
const contracts = await import("@/server/services/sales/contracts");

const NOW = new Date("2026-10-03T10:00:00Z");
const DAY = 86_400_000;
const inDays = (n: number) => new Date(NOW.getTime() + n * DAY);
const base = { escalatedAt: null as Date | null, expiresAt: inDays(25) as Date | null };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("classement d'un contrat dans les filtres", () => {
  it("range chaque statut à sa place", () => {
    expect(view.contractFilters({ ...base, status: "DRAFT" }, NOW)).toEqual(["brouillon"]);
    expect(view.contractFilters({ ...base, status: "SENT" }, NOW)).toEqual(["a-signer"]);
    expect(view.contractFilters({ ...base, status: "OPENED" }, NOW)).toEqual(["a-signer", "consultes"]);
    expect(view.contractFilters({ ...base, status: "SIGNED_PHARMACY" }, NOW)).toEqual(["a-contresigner"]);
    expect(view.contractFilters({ ...base, status: "SIGNED_COMPANY" }, NOW)).toEqual(["a-contresigner"]);
    expect(view.contractFilters({ ...base, status: "FINALIZED" }, NOW)).toEqual(["signes"]);
    expect(view.contractFilters({ ...base, status: "EXPIRED" }, NOW)).toEqual(["expires"]);
    expect(view.contractFilters({ ...base, status: "REFUSED" }, NOW)).toEqual(["expires"]);
  });

  it("relance nécessaire : signalé par les relances, ou expiration sous 7 jours", () => {
    expect(view.needsFollowUp({ status: "SENT", escalatedAt: inDays(-1), expiresAt: inDays(20) }, NOW)).toBe(true);
    expect(view.needsFollowUp({ status: "OPENED", escalatedAt: null, expiresAt: inDays(6) }, NOW)).toBe(true);
    expect(view.needsFollowUp({ status: "OPENED", escalatedAt: null, expiresAt: inDays(-1) }, NOW)).toBe(true);
    expect(view.needsFollowUp({ status: "SENT", escalatedAt: null, expiresAt: inDays(8) }, NOW)).toBe(false);
    expect(view.needsFollowUp({ status: "SENT", escalatedAt: null, expiresAt: null }, NOW)).toBe(false);
    // Un contrat signé ou un brouillon n'est jamais « à relancer », même proche de l'échéance.
    expect(view.needsFollowUp({ status: "SIGNED_PHARMACY", escalatedAt: inDays(-1), expiresAt: inDays(1) }, NOW)).toBe(false);
    expect(view.needsFollowUp({ status: "DRAFT", escalatedAt: null, expiresAt: inDays(1) }, NOW)).toBe(false);
    expect(view.contractFilters({ status: "OPENED", escalatedAt: null, expiresAt: inDays(3) }, NOW)).toEqual(["a-signer", "consultes", "relance"]);
  });

  it("affiche des libellés clairs : le geste attendu passe avant l'état", () => {
    const label = (c: Parameters<typeof view.contractDisplayStatus>[0]) => view.contractDisplayStatus(c, NOW).label;
    expect(label({ ...base, status: "DRAFT" })).toBe("Brouillon · à envoyer");
    expect(label({ ...base, status: "DRAFT", superseded: true })).toBe("Brouillon remplacé");
    expect(label({ ...base, status: "SENT" })).toBe("Envoyé");
    expect(label({ ...base, status: "OPENED" })).toBe("Consulté");
    expect(label({ ...base, status: "SIGNED_PHARMACY" })).toBe("À contresigner");
    expect(label({ ...base, status: "FINALIZED" })).toBe("Signé");
    expect(label({ ...base, status: "EXPIRED" })).toBe("Expiré");
    expect(label({ ...base, status: "REFUSED" })).toBe("Refusé");
    expect(label({ status: "SENT", escalatedAt: inDays(-2), expiresAt: inDays(20) })).toBe("Relance nécessaire");
    expect(view.contractDisplayStatus({ status: "SENT", escalatedAt: null, expiresAt: inDays(-1) }, NOW).tone).toBe("danger");
  });

  it("lit l'adresse du cockpit : ?vue=a-envoyer vaut ?statut=brouillon, une valeur inconnue est ignorée", () => {
    expect(view.resolveContractFilter({ vue: "a-envoyer" })).toBe("brouillon");
    expect(view.resolveContractFilter({ statut: "a-contresigner" })).toBe("a-contresigner");
    expect(view.resolveContractFilter({ statut: "nimporte" })).toBeNull();
    expect(view.resolveContractFilter({})).toBeNull();
  });

  it("compte, garde la dernière version, cherche sans accent", () => {
    const counts = view.countContractFilters([{ ...base, status: "OPENED" }, { ...base, status: "DRAFT" }, { status: "SENT", escalatedAt: NOW, expiresAt: null }], NOW);
    expect(counts).toMatchObject({ tous: 3, "a-signer": 2, consultes: 1, brouillon: 1, relance: 1, signes: 0 });
    const marked = view.markLatestVersions([{ prospectId: "p1", version: 1 }, { prospectId: "p1", version: 2 }, { prospectId: "p2", version: 1 }]);
    expect(marked.map((m) => [m.latest, m.versionCount])).toEqual([[false, 2], [true, 2], [true, 1]]);
    const row = { reference: "PB-2026-ETOILE-V1", pharmacyName: "Pharmacie de l'Étoile", legalName: null, signerName: "Marc Delaunay", signerEmail: "marc@etoile.fr" };
    expect(view.matchesContractSearch(row, "etoile")).toBe(true);
    expect(view.matchesContractSearch(row, "delaunay v1")).toBe(true);
    expect(view.matchesContractSearch(row, "gare")).toBe(false);
    expect(view.matchesContractSearch(row, "  ")).toBe(true);
  });

  it("l'historique ne garde que les événements de ce contrat, avec ses e-mails", () => {
    const events = [
      { id: "e1", type: "CONTRACT_SENT", summary: "Contrat v2 envoyé à marc@port.fr.", actorType: "ADMIN", actorLabel: "Adam", metadata: { contractId: "c2" }, createdAt: new Date("2026-10-02T09:00:00Z") },
      { id: "e2", type: "CONTRACT_GENERATED", summary: "Contrat v1 généré.", actorType: "SYSTEM", actorLabel: null, metadata: { contractId: "c1" }, createdAt: new Date("2026-09-01T09:00:00Z") },
      { id: "e3", type: "NOTE", summary: "Appel.", actorType: "ADMIN", actorLabel: "Adam", metadata: {}, createdAt: new Date("2026-10-01T09:00:00Z") },
    ];
    const mine = view.eventsOfContract(events, "c2");
    expect(mine.map((e) => e.id)).toEqual(["e1"]);
    const timeline = view.contractTimeline(mine, [{ id: "d1", kind: "CONTRACT_SENT", recipient: "marc@port.fr", status: "SENT", subject: "Votre contrat", detail: null, trigger: "SYSTEM", createdAt: new Date("2026-10-02T09:00:01Z") }]);
    expect(timeline.map((t) => t.id)).toEqual(["email:d1", "event:e1"]);
    expect(timeline[0].kind).toBe("email");
    expect(timeline[1]).toMatchObject({ kind: "contrat", actor: "Adam", tone: "info" });
  });
});

describe("liste des contrats de la console", () => {
  const contract = (over: Record<string, unknown>) => ({
    id: "c",
    prospectId: "p1",
    pharmacyId: null,
    version: 1,
    status: "SENT",
    reference: null,
    monthlyPriceCents: 12900,
    pharmacySignerName: "Marc Delaunay",
    pharmacySignerEmail: "marc@port.fr",
    sentAt: inDays(-3),
    openedAt: null,
    pharmacySignedAt: null,
    companySignedAt: null,
    finalizedAt: null,
    refusedAt: null,
    expiresAt: inDays(27),
    reminderCount: 0,
    lastReminderAt: null,
    escalatedAt: null,
    createdAt: new Date("2026-09-30T10:00:00Z"),
    prospect: { name: "Pharmacie du Port", legalName: null, blockedAt: null, updatedAt: new Date("2026-09-30T10:00:00Z") },
    pharmacy: null,
    ...over,
  });

  it("montre par défaut la dernière version de chaque dossier, toutes sur demande", async () => {
    db.contract.findMany.mockResolvedValue([
      contract({ id: "c2", version: 2, status: "DRAFT", reference: "PB-2026-PORT-V2", createdAt: new Date("2026-10-01T10:00:00Z") }),
      contract({ id: "c1", version: 1, status: "EXPIRED" }),
      contract({ id: "x1", prospectId: "p2", status: "OPENED", prospect: { name: "Pharmacie de la Gare", legalName: null, blockedAt: null, updatedAt: new Date("2026-09-30T10:00:00Z") } }),
    ]);
    const latest = await admin.listContractsForAdmin({ statut: null }, NOW);
    expect(latest.rows.map((r) => r.id)).toEqual(["c2", "x1"]);
    expect(latest.rows[0].reference).toBe("PB-2026-PORT-V2");
    expect(latest.rows[1].reference).toBe("PB-2026-PHARMACI-V1");
    expect(latest.counters).toMatchObject({ tous: 2, brouillon: 1, "a-signer": 1, expires: 0 });

    const all = await admin.listContractsForAdmin({ statut: "expires", versions: "toutes" }, NOW);
    expect(all.rows.map((r) => r.id)).toEqual(["c1"]);
    expect(all.counters.tous).toBe(3);

    const searched = await admin.listContractsForAdmin({ statut: null, q: "gare" }, NOW);
    expect(searched.rows.map((r) => r.id)).toEqual(["x1"]);
    expect(searched.totals.tous).toBe(2);
  });
});

const before = { id: "default", legalName: "PharmaBoost SAS", legalForm: "SAS", addressLine1: "10 rue de la République", postalCode: "75011", city: "Paris", siren: "123456789", representativeName: "Adam Bavard", representativeTitle: "Président", representativeEmail: "contact@pharmaboost.app", updatedAt: new Date() };

describe("fiche société", () => {
  it("ne touche à aucun contrat existant et journalise l'avant/après", async () => {
    db.companyProfile.findUnique.mockResolvedValue(before);
    db.companyProfile.upsert.mockResolvedValue({ ...before, city: "Lyon" });
    const result = await contracts.upsertCompanyProfile({ ...before, addressLine1: "5 place Bellecour", postalCode: "69002", city: "Lyon" }, "admin-1");

    expect(db.companyProfile.upsert).toHaveBeenCalledTimes(1);
    for (const method of Object.values(db.contract)) expect(method).not.toHaveBeenCalled();
    expect(result.changes).toEqual({ addressLine1: { from: "10 rue de la République", to: "5 place Bellecour" }, postalCode: { from: "75011", to: "69002" }, city: { from: "Paris", to: "Lyon" } });
    expect(audit.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "sales.company_profile_updated", platformAdminId: "admin-1", metadata: { created: false, changes: result.changes } }),
    );
  });

  it("un enregistrement sans changement n'encombre pas le journal", async () => {
    db.companyProfile.findUnique.mockResolvedValue(before);
    const result = await contracts.upsertCompanyProfile({ ...before }, "admin-1");
    expect(result.changes).toEqual({});
    expect(audit.recordAudit).not.toHaveBeenCalled();
  });
});

describe("PDF spécimen", () => {
  it("refuse sans session console (401), sans rien lire", async () => {
    session.getPlatformSession.mockResolvedValue(null);
    const { GET } = await import("@/app/api/admin/contrat-specimen/route");
    const response = await GET();
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(db.companyProfile.findUnique).not.toHaveBeenCalled();
  });

  it("avec une session : un PDF généré à la volée, jamais mis en cache ni stocké", async () => {
    session.getPlatformSession.mockResolvedValue({ admin: { id: "admin-1" } });
    db.companyProfile.findUnique.mockResolvedValue(before);
    db.plan.findFirst.mockResolvedValue(null);
    const { GET } = await import("@/app/api/admin/contrat-specimen/route");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    for (const method of Object.values(db.contract)) expect(method).not.toHaveBeenCalled();
  });
});
