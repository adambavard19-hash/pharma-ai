import { describe, expect, it, vi } from "vitest";

/**
 * La session de PharmaBoost Mobile : une personne, avec ou sans officine. Le cœur (`resolveUserSession`) est pur :
 * on le nourrit d'enregistrements de session tels que la base les rend.
 */
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`NEXT_REDIRECT ${path}`); } }));
vi.mock("@/server/db/client", () => ({ prisma: {} }));

const { resolveUserSession } = await import("../user-session");
const now = new Date("2026-10-11T10:00:00Z");

const pharmacy = (id: string, extra: Partial<{ isActive: boolean; isDemo: boolean; organizationId: string }> = {}) => ({ id, name: `Pharmacie ${id}`, city: "Lyon", isDemo: false, isActive: true, organizationId: "org-client", ...extra });
const record = (overrides: { pharmacyId?: string | null; memberships?: unknown[]; kind?: "CLIENT" | "COMMUNITY"; status?: string; revokedAt?: Date | null; expiresAt?: Date; deletedAt?: Date | null } = {}) => ({
  id: "sess1",
  pharmacyId: overrides.pharmacyId ?? null,
  revokedAt: overrides.revokedAt ?? null,
  expiresAt: overrides.expiresAt ?? new Date("2026-10-11T20:00:00Z"),
  user: {
    id: "u1",
    email: "ines@exemple.fr",
    firstName: "Inès",
    lastName: "Martin",
    avatarUrl: null,
    status: overrides.status ?? "ACTIVE",
    deletedAt: overrides.deletedAt ?? null,
    profession: "PHARMACY_STUDENT",
    rppsDeclared: null,
    declaredPharmacyName: null,
    mobileOnboardedAt: null,
    organization: { id: overrides.kind === "CLIENT" ? "org-client" : "org-communaute", name: "x", kind: overrides.kind ?? "COMMUNITY" },
    memberships: (overrides.memberships ?? []) as never,
  },
});
const membership = (id: string, role = "TECHNICIAN", extra = {}) => ({ pharmacyId: id, role, grantedPermissions: [], revokedPermissions: [], pharmacy: pharmacy(id, extra) });

describe("sans rattachement : un compte gratuit", () => {
  it("rend une session de communauté, sans officine ni portée", () => {
    const session = resolveUserSession(record(), now)!;
    expect(session).not.toBeNull();
    expect(session.isCommunity).toBe(true);
    expect(session.isClientStaff).toBe(false);
    expect(session.activePharmacy).toBeNull();
    expect(session.scope).toBeNull();
    expect(session.role).toBeNull();
    expect(session.permissions.size).toBe(0);
  });

  it("une session révoquée, expirée, ou d'un compte inactif ou supprimé ne rend rien", () => {
    expect(resolveUserSession(record({ revokedAt: now }), now)).toBeNull();
    expect(resolveUserSession(record({ expiresAt: new Date("2026-10-11T09:00:00Z") }), now)).toBeNull();
    expect(resolveUserSession(record({ status: "SUSPENDED" }), now)).toBeNull();
    expect(resolveUserSession(record({ deletedAt: now }), now)).toBeNull();
    expect(resolveUserSession(null, now)).toBeNull();
  });
});

describe("avec rattachement : un collaborateur d'officine cliente", () => {
  it("rend l'officine de la session, son rôle, et une portée bornée à ELLE", () => {
    const session = resolveUserSession(record({ kind: "CLIENT", pharmacyId: "B", memberships: [membership("A", "OWNER"), membership("B", "PHARMACIST")] }), now)!;
    expect(session.isClientStaff).toBe(true);
    expect(session.isCommunity).toBe(false);
    expect(session.activePharmacy?.id).toBe("B");
    expect(session.role).toBe("PHARMACIST");
    expect(session.scope).toEqual({ pharmacyId: "B", organizationId: "org-client", userId: "u1", isDemo: false });
    expect(session.memberships.map((m) => m.pharmacyId)).toEqual(["A", "B"]);
  });

  it("une officine de session qui n'est pas (ou plus) la sienne n'est jamais retenue : repli sur son premier rattachement", () => {
    const session = resolveUserSession(record({ kind: "CLIENT", pharmacyId: "AUTRE", memberships: [membership("A")] }), now)!;
    expect(session.scope?.pharmacyId).toBe("A");
  });

  it("une officine désactivée ne compte pas : seul rattachement → retour à une session sans officine", () => {
    const session = resolveUserSession(record({ kind: "CLIENT", pharmacyId: "A", memberships: [membership("A", "TECHNICIAN", { isActive: false })] }), now)!;
    expect(session.scope).toBeNull();
    expect(session.memberships).toEqual([]);
    // Toujours de l'organisation cliente : ce n'est pas un compte de la communauté.
    expect(session.isCommunity).toBe(false);
  });
});
