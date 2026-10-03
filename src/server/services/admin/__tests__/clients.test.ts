import { beforeEach, describe, expect, it, vi } from "vitest";

// Ni base ni journal réels : prisma et l'audit sont des doublures.
vi.mock("server-only", () => ({}));

const prisma = vi.hoisted(() => ({
  adminNote: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  pharmacy: { findUnique: vi.fn(), findMany: vi.fn() },
  prospect: { findUnique: vi.fn() },
}));
const recordAudit = vi.hoisted(() => vi.fn());

vi.mock("@/server/db/client", () => ({ prisma }));
vi.mock("@/server/audit/log", () => ({ recordAudit }));

const notes = await import("../notes");
const clients = await import("../clients");

const NOW = new Date("2026-10-03T12:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("notes internes", () => {
  it("refuse une note vide ou faite d'espaces, sans toucher la base", async () => {
    for (const body of ["", "   ", "\n\n", "a"]) {
      const result = await notes.addAdminNote({ pharmacyId: "ph1", body, adminId: "adm1", label: "Adam B." });
      expect(result.ok).toBe(false);
    }
    expect(prisma.adminNote.create).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("refuse une note trop longue, ou sans cible unique", async () => {
    expect((await notes.addAdminNote({ pharmacyId: "ph1", body: "x".repeat(2001), adminId: "adm1", label: "A" })).ok).toBe(false);
    expect((await notes.addAdminNote({ body: "Bonjour", adminId: "adm1", label: "A" })).ok).toBe(false);
    expect((await notes.addAdminNote({ pharmacyId: "ph1", prospectId: "pr1", body: "Bonjour", adminId: "adm1", label: "A" })).ok).toBe(false);
    expect(prisma.adminNote.create).not.toHaveBeenCalled();
  });

  it("refuse une officine inconnue : l'identifiant venu de l'écran est relu", async () => {
    prisma.pharmacy.findUnique.mockResolvedValue(null);
    const result = await notes.addAdminNote({ pharmacyId: "inconnue", body: "Appel du titulaire", adminId: "adm1", label: "A" });
    expect(result).toEqual({ ok: false, error: "Officine introuvable." });
    expect(prisma.adminNote.create).not.toHaveBeenCalled();
  });

  it("enregistre la note nettoyée et la trace au journal (sans le texte)", async () => {
    prisma.pharmacy.findUnique.mockResolvedValue({ id: "ph1" });
    prisma.adminNote.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "n1", pinned: false, createdAt: NOW, ...data }));
    const result = await notes.addAdminNote({ pharmacyId: "ph1", body: "  Appel du titulaire.\n\n\n\nRappeler lundi.  ", adminId: "adm1", label: "Adam B." });
    expect(result.ok).toBe(true);
    expect(prisma.adminNote.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ pharmacyId: "ph1", prospectId: null, body: "Appel du titulaire.\n\nRappeler lundi.", authorAdminId: "adm1", authorLabel: "Adam B." }) }));
    expect(recordAudit).toHaveBeenCalledTimes(1);
    const audit = recordAudit.mock.calls[0][0];
    expect(audit).toMatchObject({ action: "platform.note_added", entityType: "AdminNote", entityId: "n1", pharmacyId: "ph1", platformAdminId: "adm1" });
    expect(JSON.stringify(audit.metadata)).not.toContain("Rappeler");
  });

  it("une note sur un dossier est rattachée, au journal, à l'officine du dossier", async () => {
    prisma.prospect.findUnique.mockResolvedValue({ id: "pr1", pharmacyId: "ph9" });
    prisma.adminNote.create.mockResolvedValue({ id: "n2", pharmacyId: null, prospectId: "pr1", body: "Relance faite", pinned: false, authorAdminId: "adm1", authorLabel: "A", createdAt: NOW });
    const result = await notes.addAdminNote({ prospectId: "pr1", body: "Relance faite", adminId: "adm1", label: "A" });
    expect(result.ok).toBe(true);
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ pharmacyId: "ph9", metadata: expect.objectContaining({ target: "Prospect", targetId: "pr1" }) }));
  });

  it("épingler : avant et après au journal ; rien si l'état ne change pas", async () => {
    const note = { id: "n1", pharmacyId: "ph1", prospectId: null, body: "x", pinned: false, authorAdminId: "adm1", authorLabel: "A", createdAt: NOW };
    prisma.adminNote.findUnique.mockResolvedValue(note);
    prisma.adminNote.update.mockResolvedValue({ ...note, pinned: true });
    const pinned = await notes.setNotePinned("n1", true, "adm2");
    expect(pinned).toMatchObject({ ok: true, changed: true });
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "platform.note_pinned", platformAdminId: "adm2", pharmacyId: "ph1", metadata: expect.objectContaining({ before: { pinned: false }, after: { pinned: true } }) }));

    recordAudit.mockClear();
    prisma.adminNote.update.mockClear();
    const unchanged = await notes.setNotePinned("n1", false, "adm2");
    expect(unchanged).toMatchObject({ ok: true, changed: false });
    expect(prisma.adminNote.update).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();

    prisma.adminNote.findUnique.mockResolvedValue(null);
    expect(await notes.setNotePinned("absente", true, "adm2")).toEqual({ ok: false, error: "Note introuvable." });
  });

  it("liste : officine et dossier réunis, épinglées d'abord ; sans cible, aucune requête", async () => {
    expect(await notes.listNotes({})).toEqual([]);
    expect(prisma.adminNote.findMany).not.toHaveBeenCalled();
    prisma.adminNote.findMany.mockResolvedValue([]);
    await notes.listNotes({ pharmacyId: "ph1", prospectId: "pr1" }, { pinnedOnly: true });
    expect(prisma.adminNote.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { OR: [{ pharmacyId: "ph1" }, { prospectId: "pr1" }], pinned: true }, orderBy: [{ pinned: "desc" }, { createdAt: "desc" }] }));
  });
});

describe("liste des officines (lecture)", () => {
  function pharmacyRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "ph1",
      name: "Pharmacie du Marché",
      city: "Lyon",
      siret: null,
      email: null,
      isActive: true,
      isDemo: false,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      stockConnection: null,
      memberships: [{ role: "OWNER", isActive: true, user: { firstName: "Camille", lastName: "Martin", email: "camille@marche.fr", lastLoginAt: new Date("2026-10-01T08:00:00.000Z") } }],
      organization: { subscription: { status: "ACTIVE", suspendedAt: null, contractPriceCents: 29000, cancelAtPeriodEnd: false, trialEndsAt: null, plan: { name: "PharmaBoost", monthlyPriceCents: 34900 } } },
      ...overrides,
    };
  }

  it("tarif contractuel distinct du catalogue, filtres, inactivité et connecteurs à vérifier (hors démo)", async () => {
    prisma.pharmacy.findMany.mockResolvedValue([
      pharmacyRow(),
      pharmacyRow({ id: "ph2", name: "Officine Dormante", memberships: [], organization: { subscription: null }, stockConnection: { lgo: "lgpi", status: "ERROR", lastSyncAt: null, lastSeenAt: null, intervalSeconds: 300 } }),
      // Démonstration en erreur : affichée, mais jamais comptée parmi les pannes ni les inactives.
      pharmacyRow({ id: "ph3", name: "Démo", isDemo: true, memberships: [], organization: { subscription: null }, stockConnection: { lgo: "lgpi", status: "ERROR", lastSyncAt: null, lastSeenAt: null, intervalSeconds: 300 } }),
    ]);
    const result = await clients.listClientPharmacies({ q: null, statut: null, tri: "nom", now: NOW });
    expect(result.rows.map((r) => r.id)).toEqual(["ph3", "ph2", "ph1"]);
    const marche = result.rows.find((r) => r.id === "ph1");
    expect(marche?.subscriptionView).toMatchObject({ priceCents: 29000, priceSource: "CONTRACT", catalogDiffers: true, catalogCents: 34900 });
    expect(marche?.owner).toEqual({ name: "Camille MARTIN", email: "camille@marche.fr" });
    expect(result.allCounts).toMatchObject({ actives: 2, abonnees: 1, "sans-abonnement": 2, demo: 1 });
    expect(result.inactive).toBe(1);
    expect(result.connectorsToCheck).toBe(1);

    expect(result.rows.find((r) => r.id === "ph3")?.connector.state).toBe("ERROR");

    const searched = await clients.listClientPharmacies({ q: "camille@", statut: "abonnees", tri: "recent", now: NOW });
    expect(searched.rows.map((r) => r.id)).toEqual(["ph1"]);
    expect(searched.searched).toBe(1);
  });

  it("un compte suspendu, même connecté hier, ne rend pas l'équipe active (règle du cockpit)", async () => {
    prisma.pharmacy.findMany.mockResolvedValue([
      pharmacyRow({ memberships: [{ role: "TECHNICIAN", isActive: false, user: { firstName: "Ex", lastName: "Salarié", email: "ex@marche.fr", lastLoginAt: new Date("2026-10-02T08:00:00.000Z") } }] }),
    ]);
    const result = await clients.listClientPharmacies({ q: null, statut: null, tri: "recent", now: NOW });
    expect(result.rows[0].teamLastLoginAt).toBeNull();
    expect(result.inactive).toBe(1);
  });

  it("filtre de statut des comptes traduit en requête", () => {
    expect(clients.userStatusWhere(null)).toEqual({});
    expect(clients.userStatusWhere("jamais-connectes")).toEqual({ lastLoginAt: null, status: { not: "DISABLED" } });
    expect(clients.userStatusWhere("suspendus")).toMatchObject({ status: { not: "DISABLED" } });
    expect(clients.userBaseWhere({ q: null, role: "OWNER" })).toEqual({ AND: [{ deletedAt: null }, { memberships: { some: { role: "OWNER" } } }] });
  });
});
