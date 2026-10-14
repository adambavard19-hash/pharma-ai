import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La connexion de l'équipe avec le mot de passe de l'officine : SON adresse e-mail + le mot de passe commun. Jamais un compte
 * de titulaire, jamais une officine où la personne n'est pas, jamais une officine fermée ; le mot de passe personnel marche toujours.
 */
vi.mock("server-only", () => ({}));
vi.mock("@/server/audit/log", () => ({ recordAudit: vi.fn() }));
vi.mock("@/server/security/encryption", () => ({ encryptField: (value: string) => `enc:${value}`, decryptField: (value: string) => value.replace(/^enc:/, "") }));
const findUnique = vi.fn();
vi.mock("@/server/db/client", () => ({ prisma: { user: { findUnique: (...args: unknown[]) => findUnique(...args) } } }));

const { authenticateUser } = await import("../credentials");
const { newTeamPasswordData } = await import("@/server/services/team-password");
const { hashPassword } = await import("@/server/security/password");

const officeA = await newTeamPasswordData();
const officeB = await newTeamPasswordData();
const personal = await hashPassword("MonMotDePasse2026!");

const user = (memberships: { pharmacyId: string; role: string; isActive?: boolean; hash: string | null }[], extra: Record<string, unknown> = {}) => ({
  id: "u1",
  organizationId: "org",
  passwordHash: null,
  status: "ACTIVE",
  deletedAt: null,
  mobileOnboardedAt: null,
  memberships: memberships.map((m) => ({ pharmacyId: m.pharmacyId, role: m.role, pharmacy: { isActive: m.isActive ?? true, teamPasswordHash: m.hash } })),
  ...extra,
});

let n = 0;
const email = () => `membre${++n}@exemple.fr`;

beforeEach(() => findUnique.mockReset());

describe("connexion avec le mot de passe de l'officine", () => {
  it("un préparateur ajouté par le titulaire entre avec son e-mail et le mot de passe de son officine, même tapé en minuscules", async () => {
    findUnique.mockResolvedValue(user([{ pharmacyId: "A", role: "TECHNICIAN", hash: officeA.data.teamPasswordHash }]));
    const check = await authenticateUser(email(), officeA.password.toLowerCase().replace(/-/g, " "));
    expect(check).toMatchObject({ kind: "OK", user: { activePharmacyIds: ["A"], viaTeamPassword: true } });
  });

  it("ouvre l'officine dont c'est le mot de passe, en premier, pour quelqu'un qui travaille dans deux officines", async () => {
    findUnique.mockResolvedValue(user([{ pharmacyId: "A", role: "PHARMACIST", hash: officeA.data.teamPasswordHash }, { pharmacyId: "B", role: "PHARMACIST", hash: officeB.data.teamPasswordHash }]));
    const check = await authenticateUser(email(), officeB.password);
    expect(check).toMatchObject({ kind: "OK", user: { activePharmacyIds: ["B", "A"] } });
  });

  it("refuse le mot de passe d'une AUTRE officine", async () => {
    findUnique.mockResolvedValue(user([{ pharmacyId: "A", role: "TECHNICIAN", hash: officeA.data.teamPasswordHash }]));
    expect((await authenticateUser(email(), officeB.password)).kind).toBe("INVALID");
  });

  it("n'ouvre jamais un compte de titulaire avec le mot de passe commun", async () => {
    findUnique.mockResolvedValue(user([{ pharmacyId: "A", role: "OWNER", hash: officeA.data.teamPasswordHash }]));
    expect((await authenticateUser(email(), officeA.password)).kind).toBe("INVALID");
  });

  it("refuse une officine fermée, un compte supprimé, et une adresse inconnue", async () => {
    findUnique.mockResolvedValue(user([{ pharmacyId: "A", role: "TECHNICIAN", isActive: false, hash: officeA.data.teamPasswordHash }]));
    expect((await authenticateUser(email(), officeA.password)).kind).toBe("INVALID");
    findUnique.mockResolvedValue(user([{ pharmacyId: "A", role: "TECHNICIAN", hash: officeA.data.teamPasswordHash }], { deletedAt: new Date() }));
    expect((await authenticateUser(email(), officeA.password)).kind).toBe("INVALID");
    findUnique.mockResolvedValue(null);
    expect((await authenticateUser(email(), officeA.password)).kind).toBe("INVALID");
  });

  it("un compte suspendu reste suspendu", async () => {
    findUnique.mockResolvedValue(user([{ pharmacyId: "A", role: "TECHNICIAN", hash: officeA.data.teamPasswordHash }], { status: "SUSPENDED" }));
    expect((await authenticateUser(email(), officeA.password)).kind).toBe("INACTIVE");
  });

  it("le mot de passe personnel marche toujours", async () => {
    findUnique.mockResolvedValue(user([{ pharmacyId: "A", role: "OWNER", hash: officeA.data.teamPasswordHash }], { passwordHash: personal }));
    expect(await authenticateUser(email(), "MonMotDePasse2026!")).toMatchObject({ kind: "OK", user: { viaTeamPassword: false } });
  });

  it("freine les essais en boucle sur une même adresse", async () => {
    const address = email();
    findUnique.mockResolvedValue(user([{ pharmacyId: "A", role: "TECHNICIAN", hash: officeA.data.teamPasswordHash }]));
    for (let attempt = 0; attempt < 8; attempt++) await authenticateUser(address, "Faux-0000");
    expect((await authenticateUser(address, officeA.password)).kind).toBe("INVALID");
  });
});
