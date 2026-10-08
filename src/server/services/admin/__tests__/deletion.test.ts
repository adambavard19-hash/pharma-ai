import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Supprimer une officine ou un compte : ce qui est éprouvé, c'est l'ORDRE et la PORTÉE des gestes — jamais un
 * effacement sans le nom retapé, jamais une officine bloquée, jamais un compte qui travaille ailleurs emporté avec
 * celle qu'on supprime. La base est simulée ; le calendrier des appels, lui, est réel.
 */

vi.mock("server-only", () => ({}));

const calls = vi.hoisted(() => ({ log: [] as string[] }));
const track = <T,>(name: string, value: T) => vi.fn(async (...args: unknown[]) => {
  calls.log.push(`${name}${args.length > 0 ? ` ${JSON.stringify(args[0]).slice(0, 220)}` : ""}`);
  return value;
});

const prismaMock = vi.hoisted(() => {
  const tx: Record<string, Record<string, ReturnType<typeof vi.fn>>> = {};
  return {
    tx,
    pharmacy: { findUnique: vi.fn(), delete: vi.fn(), count: vi.fn() },
    membership: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(), deleteMany: vi.fn(), delete: vi.fn(), groupBy: vi.fn(), update: vi.fn() },
    patient: { count: vi.fn() },
    prescription: { count: vi.fn() },
    sale: { count: vi.fn() },
    product: { count: vi.fn() },
    partnerOrder: { count: vi.fn() },
    contract: { count: vi.fn() },
    billingPayment: { count: vi.fn() },
    session: { deleteMany: vi.fn() },
    notification: { deleteMany: vi.fn() },
    organization: { delete: vi.fn() },
    user: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
    $transaction: vi.fn(),
  };
});
const auditMock = vi.hoisted(() => ({ recordAudit: vi.fn() }));

vi.mock("@/server/db/client", () => ({ prisma: prismaMock }));
vi.mock("@/server/audit/log", () => auditMock);

const { deletePharmacy, deleteUserAccount, loadPharmacyDeletionImpact, releaseDeletedUserEmails, removeMemberFromPharmacy, soleOwnerPharmaciesByUser } = await import("../deletion");

type PharmacyRow = { id: string; name: string; city: string | null; siret: string | null; slug: string; isDemo: boolean; organizationId: string; organization: { subscription: { status: string; stripeSubscriptionId: string | null } | null } };

function pharmacyRow(overrides: Partial<PharmacyRow> = {}): PharmacyRow {
  return { id: "ph_1", name: "Pharmacie du Petit Nicolas", city: "Nice", siret: "12345678901234", slug: "petit-nicolas", isDemo: false, organizationId: "org_1", organization: { subscription: null }, ...overrides };
}

/** Une équipe de trois : u1 et u2 n'ont que cette officine, u3 travaille aussi ailleurs. */
function wireStandardPharmacy(options: { siblings?: number; payments?: number; subscription?: PharmacyRow["organization"]["subscription"]; pharmacy?: Partial<PharmacyRow> } = {}) {
  prismaMock.pharmacy.findUnique.mockResolvedValue(pharmacyRow({ organization: { subscription: options.subscription ?? null }, ...options.pharmacy }));
  prismaMock.membership.findMany.mockImplementation(async (args: { where: { pharmacyId?: string | { not: string }; userId?: { in: string[] } } }) => {
    if (typeof args.where.pharmacyId === "string") return [{ userId: "u1" }, { userId: "u2" }, { userId: "u3" }];
    return args.where.userId?.in.includes("u3") ? [{ userId: "u3" }] : [];
  });
  prismaMock.patient.count.mockResolvedValue(120);
  prismaMock.prescription.count.mockResolvedValue(340);
  prismaMock.sale.count.mockResolvedValue(95);
  prismaMock.product.count.mockResolvedValue(4306);
  prismaMock.partnerOrder.count.mockResolvedValue(2);
  prismaMock.contract.count.mockResolvedValue(1);
  prismaMock.billingPayment.count.mockResolvedValue(options.payments ?? 0);
  prismaMock.pharmacy.count.mockResolvedValue(options.siblings ?? 0);
}

beforeEach(() => {
  vi.clearAllMocks();
  calls.log.length = 0;
  prismaMock.session.deleteMany = track("session.deleteMany", { count: 1 }) as never;
  prismaMock.pharmacy.delete = track("pharmacy.delete", {}) as never;
  prismaMock.user.deleteMany = track("user.deleteMany", { count: 2 }) as never;
  prismaMock.organization.delete = track("organization.delete", {}) as never;
  prismaMock.membership.deleteMany = track("membership.deleteMany", { count: 1 }) as never;
  prismaMock.membership.delete = track("membership.delete", {}) as never;
  prismaMock.notification.deleteMany = track("notification.deleteMany", { count: 0 }) as never;
  prismaMock.user.update = track("user.update", {}) as never;
  // Les deux formes de transaction : fonction (interactive) ou tableau d'opérations déjà lancées.
  prismaMock.$transaction.mockImplementation(async (arg: unknown) => (typeof arg === "function" ? (arg as (tx: unknown) => Promise<unknown>)(prismaMock) : Promise.all(arg as Promise<unknown>[])));
});

describe("ce qu'une suppression d'officine emporterait", () => {
  it("compte ce qui part, et sépare les comptes supprimés de ceux qui travaillent aussi ailleurs", async () => {
    wireStandardPharmacy();
    const impact = await loadPharmacyDeletionImpact("ph_1");
    expect(impact).toMatchObject({ name: "Pharmacie du Petit Nicolas", usersDeleted: 2, usersKept: 1, deletesOrganization: true, blockers: [] });
    expect(impact?.counts).toEqual({ users: 3, patients: 120, prescriptions: 340, sales: 95, products: 4306, partnerOrders: 2, contracts: 1 });
  });

  it("une organisation qui a d'autres officines n'est pas supprimée", async () => {
    wireStandardPharmacy({ siblings: 2 });
    expect((await loadPharmacyDeletionImpact("ph_1"))?.deletesOrganization).toBe(false);
  });

  it("une officine inconnue ne donne rien", async () => {
    prismaMock.pharmacy.findUnique.mockResolvedValue(null);
    expect(await loadPharmacyDeletionImpact("absente")).toBeNull();
  });

  it("remonte les obstacles : abonnement Stripe en cours, paiements, démonstration commerciale", async () => {
    wireStandardPharmacy({ subscription: { status: "ACTIVE", stripeSubscriptionId: "sub_1" }, payments: 4 });
    expect((await loadPharmacyDeletionImpact("ph_1"))?.blockers.map((b) => b.code)).toEqual(["LIVE_SUBSCRIPTION", "PAYMENTS"]);
    wireStandardPharmacy({ pharmacy: { slug: "demo-commerciale", isDemo: true } });
    // Le slug réel de la démo vient de `core/demo/identity` : on contrôle seulement que l'identité est consultée.
    expect((await loadPharmacyDeletionImpact("ph_1"))?.isDemo).toBe(true);
  });
});

describe("supprimer une officine", () => {
  const input = { pharmacyId: "ph_1", typedName: "Pharmacie du Petit Nicolas", reason: "Officine d'essai", adminId: "adm_1" };

  it("sans motif, rien n'est lu ni supprimé", async () => {
    const result = await deletePharmacy({ ...input, reason: "ok" });
    expect(result).toMatchObject({ ok: false });
    expect(prismaMock.pharmacy.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.pharmacy.delete).not.toHaveBeenCalled();
  });

  it("avec un autre nom retapé, rien n'est supprimé", async () => {
    wireStandardPharmacy();
    const result = await deletePharmacy({ ...input, typedName: "Pharmacie du Port" });
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/ne correspond pas/) });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.pharmacy.delete).not.toHaveBeenCalled();
    expect(auditMock.recordAudit).not.toHaveBeenCalled();
  });

  it("un obstacle (abonnement en cours) interdit, même avec le bon nom", async () => {
    wireStandardPharmacy({ subscription: { status: "ACTIVE", stripeSubscriptionId: "sub_1" } });
    const result = await deletePharmacy(input);
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/Résiliez/) });
    expect(prismaMock.pharmacy.delete).not.toHaveBeenCalled();
  });

  it("une officine inconnue (déjà supprimée) ne plante pas", async () => {
    prismaMock.pharmacy.findUnique.mockResolvedValue(null);
    expect(await deletePharmacy(input)).toMatchObject({ ok: false, error: expect.stringMatching(/déjà été supprimée/) });
  });

  it("supprime dans l'ordre : sessions, officine, comptes orphelins, organisation — sans toucher au compte qui travaille ailleurs", async () => {
    wireStandardPharmacy();
    const result = await deletePharmacy(input);
    expect(result).toEqual({ ok: true, name: "Pharmacie du Petit Nicolas", usersDeleted: 2, usersKept: 1, organizationDeleted: true });

    const order = calls.log.map((entry) => entry.split(" ")[0]);
    expect(order).toEqual(["session.deleteMany", "pharmacy.delete", "user.deleteMany", "organization.delete"]);
    // Seuls u1 et u2 (qui n'ont que cette officine) sont supprimés : u3 travaille aussi ailleurs.
    const userDelete = calls.log.find((entry) => entry.startsWith("user.deleteMany"))!;
    expect(userDelete).toContain("u1");
    expect(userDelete).toContain("u2");
    expect(userDelete).not.toContain("u3");
    const sessions = calls.log.find((entry) => entry.startsWith("session.deleteMany"))!;
    expect(sessions).toContain("ph_1");
    expect(sessions).not.toContain("u3");
    // Une transaction, avec une limite de temps assez large pour une vraie officine.
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.$transaction.mock.calls[0][1]).toMatchObject({ timeout: 120_000 });
  });

  it("garde l'organisation quand elle a d'autres officines", async () => {
    wireStandardPharmacy({ siblings: 1 });
    const result = await deletePharmacy(input);
    expect(result).toMatchObject({ ok: true, organizationDeleted: false });
    expect(prismaMock.organization.delete).not.toHaveBeenCalled();
  });

  it("consigne le geste au journal APRÈS la suppression, avec le nom, le motif et ce qui est parti — sans citer l'officine par clé", async () => {
    wireStandardPharmacy();
    await deletePharmacy(input);
    expect(auditMock.recordAudit).toHaveBeenCalledTimes(1);
    const entry = auditMock.recordAudit.mock.calls[0][0];
    expect(entry).toMatchObject({ action: "platform.pharmacy_deleted", entityType: "Pharmacy", entityId: "ph_1", platformAdminId: "adm_1" });
    expect(entry.pharmacyId).toBeUndefined();
    expect(entry.metadata).toMatchObject({ name: "Pharmacie du Petit Nicolas", reason: "Officine d'essai", usersDeleted: 2, usersKept: 1, organizationDeleted: true });
    expect(entry.metadata.counts).toMatchObject({ patients: 120, prescriptions: 340 });
  });

  it("accepte le nom retapé sans casse ni accents", async () => {
    wireStandardPharmacy({ pharmacy: { name: "Pharmacie de l'Étoile" } });
    expect(await deletePharmacy({ ...input, typedName: "  pharmacie de l'etoile " })).toMatchObject({ ok: true });
  });
});

describe("supprimer un compte", () => {
  const wireUser = (memberships: { pharmacy: { name: string } }[] = [{ pharmacy: { name: "Pharmacie du Port" } }]) =>
    prismaMock.user.findFirst.mockResolvedValue({ id: "u9", firstName: "Camille", lastName: "Durand", memberships });

  it("rend le compte anonyme, libère l'adresse, ferme les sessions et retire les accès", async () => {
    wireUser();
    prismaMock.membership.findMany.mockResolvedValue([]);
    const result = await deleteUserAccount({ userId: "u9", adminId: "adm_1" });
    expect(result).toEqual({ ok: true, name: "Camille Durand", pharmacies: ["Pharmacie du Port"] });
    expect(calls.log.map((entry) => entry.split(" ")[0])).toEqual(["session.deleteMany", "notification.deleteMany", "membership.deleteMany", "user.update"]);
    const update = prismaMock.user.update.mock.calls[0][0];
    expect(update.data).toMatchObject({ status: "DISABLED", email: "supprime-u9@suppression.pharmaboost.invalid", passwordHash: null, passwordResetTokenHash: null, phone: null, rppsNumber: null });
    expect(update.data.deletedAt).toBeInstanceOf(Date);
    // Le nom reste (signature sur l'historique) : il n'est pas dans les champs effacés.
    expect(update.data).not.toHaveProperty("firstName");
    expect(auditMock.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "platform.user_deleted", entityId: "u9", platformAdminId: "adm_1" }));
  });

  it("le journal ne garde pas l'adresse e-mail effacée", async () => {
    wireUser();
    prismaMock.membership.findMany.mockResolvedValue([]);
    await deleteUserAccount({ userId: "u9", adminId: "adm_1" });
    expect(JSON.stringify(auditMock.recordAudit.mock.calls[0][0])).not.toMatch(/@/);
  });

  it("refuse le seul titulaire d'une officine, et ne touche à rien", async () => {
    wireUser();
    prismaMock.membership.findMany.mockResolvedValue([{ pharmacyId: "ph_1", pharmacy: { name: "Pharmacie du Port" } }]);
    prismaMock.membership.count.mockResolvedValue(0);
    const result = await deleteUserAccount({ userId: "u9", adminId: "adm_1" });
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/seul titulaire de « Pharmacie du Port »/) });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("accepte un titulaire qui n'est pas seul", async () => {
    wireUser();
    prismaMock.membership.findMany.mockResolvedValue([{ pharmacyId: "ph_1", pharmacy: { name: "Pharmacie du Port" } }]);
    prismaMock.membership.count.mockResolvedValue(1);
    expect(await deleteUserAccount({ userId: "u9", adminId: "adm_1" })).toMatchObject({ ok: true });
  });

  it("si le compte supprimé était le titulaire principal, le titulaire suivant reprend le rôle", async () => {
    wireUser();
    prismaMock.membership.findMany.mockImplementation(async (args: { where: { userId?: string; pharmacyId?: string } }) =>
      args.where.userId ? [{ pharmacyId: "ph_1", pharmacy: { name: "Pharmacie du Port" } }] : [{ id: "m_sam", isPrincipal: false }],
    );
    prismaMock.membership.count.mockResolvedValue(1); // un autre titulaire existe : la suppression est permise
    await deleteUserAccount({ userId: "u9", adminId: "adm_1" });
    expect(prismaMock.membership.update).toHaveBeenCalledWith({ where: { id: "m_sam" }, data: { isPrincipal: true } });
  });

  it("si un titulaire principal reste, personne d'autre ne le devient", async () => {
    wireUser();
    prismaMock.membership.findMany.mockImplementation(async (args: { where: { userId?: string } }) =>
      args.where.userId ? [{ pharmacyId: "ph_1", pharmacy: { name: "Pharmacie du Port" } }] : [{ id: "m_adam", isPrincipal: true }, { id: "m_sam", isPrincipal: false }],
    );
    prismaMock.membership.count.mockResolvedValue(1);
    await deleteUserAccount({ userId: "u9", adminId: "adm_1" });
    expect(prismaMock.membership.update).not.toHaveBeenCalled();
  });

  it("un compte inconnu ou déjà supprimé ne plante pas", async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    expect(await deleteUserAccount({ userId: "x", adminId: "adm_1" })).toMatchObject({ ok: false, error: expect.stringMatching(/introuvable/) });
    expect(prismaMock.user.findFirst.mock.calls[0][0].where).toMatchObject({ deletedAt: null });
  });
});

describe("retirer un compte d'une officine", () => {
  const membership = (role = "PHARMACIST", isActive = true) => ({ id: "m1", role, isActive, userId: "u9", pharmacy: { name: "Pharmacie du Port" }, user: { firstName: "Camille", lastName: "Durand" } });

  it("un compte qui travaille aussi ailleurs en est seulement retiré : son compte reste", async () => {
    prismaMock.membership.findFirst.mockResolvedValue(membership());
    prismaMock.membership.count.mockResolvedValue(1);
    const result = await removeMemberFromPharmacy({ pharmacyId: "ph_1", membershipId: "m1", adminId: "adm_1" });
    expect(result).toEqual({ ok: true, name: "Camille Durand", accountDeleted: false });
    expect(calls.log.map((entry) => entry.split(" ")[0])).toEqual(["session.deleteMany", "membership.delete"]);
    expect(calls.log[0]).toContain("ph_1"); // seules les sessions de CETTE officine
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(auditMock.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "platform.member_removed", pharmacyId: "ph_1" }));
  });

  it("le seul titulaire de cette officine n'en est pas retiré", async () => {
    prismaMock.membership.findFirst.mockResolvedValue(membership("OWNER"));
    prismaMock.membership.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    const result = await removeMemberFromPharmacy({ pharmacyId: "ph_1", membershipId: "m1", adminId: "adm_1" });
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/seul titulaire/) });
    expect(prismaMock.membership.delete).not.toHaveBeenCalled();
  });

  it("un compte qui n'a que cette officine est supprimé en entier", async () => {
    prismaMock.membership.findFirst.mockResolvedValue(membership());
    prismaMock.membership.count.mockResolvedValue(0);
    prismaMock.user.findFirst.mockResolvedValue({ id: "u9", firstName: "Camille", lastName: "Durand", memberships: [{ pharmacy: { name: "Pharmacie du Port" } }] });
    prismaMock.membership.findMany.mockResolvedValue([]);
    const result = await removeMemberFromPharmacy({ pharmacyId: "ph_1", membershipId: "m1", adminId: "adm_1" });
    expect(result).toEqual({ ok: true, name: "Camille Durand", accountDeleted: true });
    expect(prismaMock.user.update).toHaveBeenCalledTimes(1);
  });

  it("un compte absent de cette officine est refusé", async () => {
    prismaMock.membership.findFirst.mockResolvedValue(null);
    expect(await removeMemberFromPharmacy({ pharmacyId: "ph_1", membershipId: "autre", adminId: "adm_1" })).toMatchObject({ ok: false });
    expect(prismaMock.membership.findFirst.mock.calls[0][0].where).toEqual({ id: "autre", pharmacyId: "ph_1" });
  });
});

describe("la liste des utilisateurs : qui est seul titulaire", () => {
  it("repère les officines où le compte est le seul titulaire actif, en deux requêtes", async () => {
    prismaMock.membership.findMany.mockResolvedValue([
      { userId: "u1", pharmacyId: "ph_a", pharmacy: { name: "Seule" } },
      { userId: "u2", pharmacyId: "ph_b", pharmacy: { name: "Partagée" } },
    ]);
    prismaMock.membership.groupBy.mockResolvedValue([{ pharmacyId: "ph_a", _count: { _all: 1 } }, { pharmacyId: "ph_b", _count: { _all: 2 } }]);
    const map = await soleOwnerPharmaciesByUser(["u1", "u2", "u3"]);
    expect(map.get("u1")).toEqual(["Seule"]);
    expect(map.has("u2")).toBe(false);
    expect(map.has("u3")).toBe(false);
    expect(prismaMock.membership.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.membership.groupBy).toHaveBeenCalledTimes(1);
  });

  it("sans compte, aucune requête", async () => {
    expect((await soleOwnerPharmaciesByUser([])).size).toBe(0);
    expect(prismaMock.membership.findMany).not.toHaveBeenCalled();
  });
});

describe("libérer les adresses des anciens comptes supprimés", () => {
  it("anonymise chacun, et ne touche à rien quand il n'y en a plus", async () => {
    prismaMock.user.findMany.mockResolvedValueOnce([{ id: "old1" }, { id: "old2" }]);
    expect(await releaseDeletedUserEmails()).toEqual({ released: 2 });
    expect(prismaMock.user.update).toHaveBeenCalledTimes(2);
    expect(prismaMock.user.update.mock.calls[0][0].data.email).toBe("supprime-old1@suppression.pharmaboost.invalid");
    // La recherche exclut ce qui est déjà libéré : le geste est répétable.
    expect(prismaMock.user.findMany.mock.calls[0][0].where).toMatchObject({ deletedAt: { not: null } });
    prismaMock.user.findMany.mockResolvedValueOnce([]);
    prismaMock.user.update.mockClear();
    expect(await releaseDeletedUserEmails()).toEqual({ released: 0 });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});
