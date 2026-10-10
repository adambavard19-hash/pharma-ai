import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    user: { findUnique: fn(), findFirst: fn(), create: fn() },
    membership: { findMany: fn(), findUnique: fn(), findFirst: fn(), create: fn() },
    teamInvitation: { findUnique: fn(), findFirst: fn(), findMany: fn(), create: fn(), update: fn(), updateMany: fn() },
    joinRequest: { findFirst: fn(), findMany: fn(), count: fn(), create: fn(), update: fn(), updateMany: fn() },
    pharmacy: { findUnique: fn(), findFirst: fn(), findMany: fn() },
    audit: fn(),
    notify: fn(),
    dispatch: fn(),
  };
});
vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => {
  const prisma = { user: m.user, membership: m.membership, teamInvitation: m.teamInvitation, joinRequest: m.joinRequest, pharmacy: m.pharmacy, $transaction: async (run: (tx: unknown) => unknown) => run(prisma) };
  return { prisma };
});
vi.mock("@/server/audit/log", () => ({ recordAudit: m.audit }));
vi.mock("@/server/services/notifications", () => ({ createNotification: m.notify }));
vi.mock("@/server/services/email-dispatch", () => ({ recordDispatch: m.dispatch }));
vi.mock("@/server/public-url", () => ({ publicUrl: (path: string) => `https://pharmaboost.test${path}` }));
vi.mock("@/server/ai/registry", () => ({ getMessagingProvider: () => { throw new Error("pas de vrai envoi dans les essais"); } }));
vi.mock("@/server/security/password", () => ({ hashPassword: async (value: string) => `hash(${value})`, verifyPassword: async (value: string, hash: string | null | undefined) => hash === `hash(${value})`, validatePasswordStrength: (value: string) => (value.length >= 12 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /[0-9]/.test(value) ? [] : ["12 caractères minimum"]) }));

const svc = await import("../team-access");
const scope = { pharmacyId: "ph1", organizationId: "org1", userId: "titulaire" } as never;
const sent: { to: string; subject: string; text: string }[] = [];
const deps = { messaging: { info: { id: "test" }, sendEmail: async (mail: { to: string; subject: string; text: string }) => { sent.push(mail); return { status: "SENT", provider: "test", detail: "ok" }; } } as never };
const pharmacy = { id: "ph1", name: "Pharmacie du Port", organizationId: "org1", isDemo: false, isActive: true };

beforeEach(() => {
  vi.clearAllMocks();
  sent.length = 0;
  m.notify.mockResolvedValue(undefined);
  m.dispatch.mockResolvedValue({ id: "d1" });
  m.audit.mockResolvedValue(undefined);
  m.user.findUnique.mockResolvedValue({ firstName: "Anne", lastName: "Roux" });
  m.user.findFirst.mockResolvedValue(null);
  m.user.create.mockResolvedValue({ id: "new-user" });
  m.membership.findMany.mockResolvedValue([]);
  m.membership.findUnique.mockResolvedValue(null);
  m.membership.findFirst.mockResolvedValue({ sortOrder: 3 });
  m.teamInvitation.create.mockImplementation(async ({ data }: { data: { email: string } }) => ({ id: data.email }));
  m.teamInvitation.updateMany.mockResolvedValue({ count: 1 });
  m.teamInvitation.findUnique.mockImplementation(async ({ where }: { where: { id?: string } }) => (where.id ? { id: where.id, pharmacyId: "ph1", email: where.id, role: "TECHNICIAN", firstName: null, lastName: null } : null));
  m.pharmacy.findUnique.mockResolvedValue(pharmacy);
  m.pharmacy.findFirst.mockResolvedValue(pharmacy);
  m.joinRequest.findFirst.mockResolvedValue(null);
  m.joinRequest.count.mockResolvedValue(0);
  m.joinRequest.create.mockResolvedValue({ id: "jr1" });
  m.joinRequest.updateMany.mockResolvedValue({ count: 1 });
});

describe("inviter des collaborateurs", () => {
  it("envoie un lien personnel par adresse, au poste choisi, dans l'officine de la session", async () => {
    const result = await svc.inviteCollaborators(scope, { emails: ["Claire@Exemple.fr", "hugo@exemple.fr"], role: "TECHNICIAN" }, deps);
    expect(result).toEqual({ ok: true, results: [{ email: "claire@exemple.fr", status: "SENT" }, { email: "hugo@exemple.fr", status: "SENT" }] });
    expect(m.teamInvitation.create).toHaveBeenCalledTimes(2);
    expect(m.teamInvitation.create.mock.calls[0][0].data).toMatchObject({ pharmacyId: "ph1", email: "claire@exemple.fr", role: "TECHNICIAN", invitedByUserId: "titulaire" });
    expect(sent).toHaveLength(2);
    expect(sent[0].text).toContain("https://pharmaboost.test/invitation/");
    expect(sent[0].subject).toContain("Anne Roux");
  });

  it("n'écrit que le jeton haché : le lien en clair n'est jamais stocké", async () => {
    await svc.inviteCollaborators(scope, { emails: ["claire@exemple.fr"], role: "PHARMACIST" }, deps);
    const link = sent[0].text.match(/invitation\/([\w-]+)/)![1];
    const stored = JSON.stringify([...m.teamInvitation.create.mock.calls, ...m.teamInvitation.update.mock.calls]);
    expect(stored).not.toContain(link);
  });

  it("refuse de nommer un titulaire par invitation, et un poste inconnu", async () => {
    expect(await svc.inviteCollaborators(scope, { emails: ["a@exemple.fr"], role: "OWNER" }, deps)).toMatchObject({ ok: false });
    expect(await svc.inviteCollaborators(scope, { emails: ["a@exemple.fr"], role: "ADMIN" }, deps)).toMatchObject({ ok: false });
    expect(m.teamInvitation.create).not.toHaveBeenCalled();
  });

  it("signale ceux qui sont déjà dans l'équipe, et ne dit rien d'une adresse connue d'une AUTRE organisation (« indisponible »)", async () => {
    m.membership.findMany.mockResolvedValue([{ user: { email: "Lea@exemple.fr" } }]);
    m.user.findFirst.mockImplementation(async ({ where }: { where: { email: { equals: string } } }) => (where.email.equals === "autre@exemple.fr" ? { organizationId: "org-autre" } : null));
    const result = await svc.inviteCollaborators(scope, { emails: ["lea@exemple.fr", "autre@exemple.fr", "neuf@exemple.fr"], role: "STUDENT" }, deps);
    expect(result).toEqual({ ok: true, results: [{ email: "lea@exemple.fr", status: "ALREADY_MEMBER" }, { email: "autre@exemple.fr", status: "UNAVAILABLE" }, { email: "neuf@exemple.fr", status: "SENT" }] });
    expect(sent.map((mail) => mail.to)).toEqual(["neuf@exemple.fr"]);
  });

  it("une nouvelle invitation annule la précédente pour la même adresse, dans la même officine seulement", async () => {
    await svc.inviteCollaborators(scope, { emails: ["claire@exemple.fr"], role: "TECHNICIAN" }, deps);
    expect(m.teamInvitation.updateMany).toHaveBeenCalledWith({ where: { pharmacyId: "ph1", email: "claire@exemple.fr", acceptedAt: null, revokedAt: null }, data: { revokedAt: expect.any(Date) } });
  });

  it("limite le nombre d'adresses à la fois", async () => {
    const many = Array.from({ length: 21 }, (_, index) => `p${index}@exemple.fr`);
    expect(await svc.inviteCollaborators(scope, { emails: many, role: "TECHNICIAN" }, deps)).toMatchObject({ ok: false });
  });

  it("renvoyer ou annuler ne touche qu'une invitation de SON officine", async () => {
    m.teamInvitation.findFirst.mockResolvedValue(null);
    expect(await svc.resendInvitation(scope, "inv-d-une-autre", deps)).toMatchObject({ ok: false });
    expect(await svc.revokeInvitation(scope, "inv-d-une-autre")).toMatchObject({ ok: false });
    expect(m.teamInvitation.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "inv-d-une-autre", pharmacyId: "ph1" }) }));
    expect(m.teamInvitation.update).not.toHaveBeenCalled();
  });
});

describe("ouvrir son lien d'invitation", () => {
  const live = { id: "inv1", pharmacyId: "ph1", email: "claire@exemple.fr", role: "TECHNICIAN", firstName: null, lastName: null, acceptedAt: null, revokedAt: null, expiresAt: new Date(Date.now() + 3_600_000), pharmacy };
  const token = "a".repeat(43);

  it("un lien inconnu, périmé, annulé ou déjà utilisé donne le même refus", async () => {
    m.teamInvitation.findUnique.mockResolvedValue(null);
    expect(await svc.previewInvitation(token)).toBeNull();
    expect(await svc.acceptInvitation(token, { firstName: "C", lastName: "M", password: "MotDePasse1234" })).toMatchObject({ ok: false, error: expect.stringContaining("plus valable") });
    m.teamInvitation.findUnique.mockResolvedValue({ ...live, expiresAt: new Date(Date.now() - 1) });
    expect(await svc.previewInvitation(token)).toBeNull();
    m.teamInvitation.findUnique.mockResolvedValue({ ...live, revokedAt: new Date() });
    expect(await svc.previewInvitation(token)).toBeNull();
    expect(await svc.previewInvitation("court")).toBeNull();
  });

  it("crée le compte DANS l'organisation de l'officine, avec le poste prévu, et prévient le titulaire", async () => {
    m.teamInvitation.findUnique.mockResolvedValue(live);
    m.membership.findMany.mockResolvedValue([{ userId: "titulaire" }]);
    const result = await svc.acceptInvitation(token, { firstName: "Claire", lastName: "Martin", password: "MotDePasse1234" });
    expect(result).toEqual({ ok: true, userId: "new-user", pharmacyId: "ph1" });
    expect(m.user.create.mock.calls[0][0].data).toMatchObject({ organizationId: "org1", email: "claire@exemple.fr", firstName: "Claire", passwordHash: "hash(MotDePasse1234)", status: "ACTIVE" });
    expect(m.membership.create.mock.calls[0][0].data).toMatchObject({ pharmacyId: "ph1", userId: "new-user", role: "TECHNICIAN", sortOrder: 4 });
    expect(m.notify).toHaveBeenCalledWith(expect.objectContaining({ pharmacyId: "ph1", userId: "titulaire", title: "Claire Martin a rejoint l'équipe" }));
  });

  it("l'usage est unique : si une autre requête a déjà consommé le lien, rien n'est créé", async () => {
    m.teamInvitation.findUnique.mockResolvedValue(live);
    m.teamInvitation.updateMany.mockResolvedValue({ count: 0 });
    expect(await svc.acceptInvitation(token, { firstName: "Claire", lastName: "Martin", password: "MotDePasse1234" })).toMatchObject({ ok: false, error: "Ce lien a déjà été utilisé." });
    expect(m.user.create).not.toHaveBeenCalled();
    expect(m.membership.create).not.toHaveBeenCalled();
  });

  it("refuse un mot de passe faible avant d'écrire quoi que ce soit", async () => {
    m.teamInvitation.findUnique.mockResolvedValue(live);
    expect(await svc.acceptInvitation(token, { firstName: "Claire", lastName: "Martin", password: "faible" })).toMatchObject({ ok: false });
    expect(m.teamInvitation.updateMany).not.toHaveBeenCalled();
  });

  it("une adresse déjà connue d'une AUTRE organisation ne s'accepte pas — même message qu'un lien périmé", async () => {
    m.teamInvitation.findUnique.mockResolvedValue(live);
    m.user.findFirst.mockResolvedValue({ id: "u-autre", organizationId: "org-autre", passwordHash: "x", status: "ACTIVE" });
    expect(await svc.previewInvitation(token)).toBeNull();
    expect(await svc.acceptInvitation(token, { firstName: "C", lastName: "M", password: "MotDePasse1234" })).toMatchObject({ ok: false, error: expect.stringContaining("plus valable") });
    expect(m.membership.create).not.toHaveBeenCalled();
  });

  it("un compte du même groupe est ajouté à l'officine à condition de prouver son mot de passe, qui ne change pas", async () => {
    m.teamInvitation.findUnique.mockResolvedValue(live);
    m.user.findFirst.mockResolvedValue({ id: "u-groupe", organizationId: "org1", passwordHash: "hash(SonMotDePasse12)", status: "ACTIVE" });
    expect(await svc.acceptInvitation(token, { firstName: "", lastName: "", password: "mauvais" })).toMatchObject({ ok: false, error: "Mot de passe incorrect." });
    const ok = await svc.acceptInvitation(token, { firstName: "", lastName: "", password: "SonMotDePasse12" });
    expect(ok).toEqual({ ok: true, userId: "u-groupe", pharmacyId: "ph1" });
    expect(m.user.create).not.toHaveBeenCalled();
    expect(m.membership.create.mock.calls[0][0].data).toMatchObject({ userId: "u-groupe", pharmacyId: "ph1", role: "TECHNICIAN" });
  });
});

describe("« Rejoindre mon officine »", () => {
  const join = { pharmacyId: "ph1", firstName: "Camille", lastName: "Martin", email: "Camille@Exemple.fr", password: "MotDePasse1234", role: "TECHNICIAN" };

  it("la recherche exige trois caractères, ne montre que nom et commune, et jamais une officine de démonstration ou inactive", async () => {
    expect(await svc.searchPharmacies("ab")).toEqual([]);
    expect(m.pharmacy.findMany).not.toHaveBeenCalled();
    m.pharmacy.findMany.mockResolvedValue([{ id: "ph1", name: "Pharmacie du Port", postalCode: "06000", city: "Nice" }]);
    expect(await svc.searchPharmacies("Port")).toEqual([{ id: "ph1", label: "Pharmacie du Port · 06000 Nice" }]);
    const query = m.pharmacy.findMany.mock.calls[0][0];
    expect(query.where).toMatchObject({ isActive: true, isDemo: false });
    expect(query.take).toBe(6);
    expect(Object.keys(query.select).sort()).toEqual(["city", "id", "name", "postalCode"]);
  });

  it("enregistre la demande SANS créer de compte, et prévient les titulaires (notification + e-mail)", async () => {
    m.membership.findMany.mockResolvedValue([{ user: { id: "titulaire", firstName: "Anne", email: "anne@exemple.fr" } }]);
    expect(await svc.requestToJoin(join, deps)).toEqual({ ok: true, pharmacyName: "Pharmacie du Port" });
    expect(m.user.create).not.toHaveBeenCalled();
    expect(m.membership.create).not.toHaveBeenCalled();
    expect(m.joinRequest.create.mock.calls[0][0].data).toMatchObject({ pharmacyId: "ph1", email: "camille@exemple.fr", suggestedRole: "TECHNICIAN", passwordHash: "hash(MotDePasse1234)" });
    expect(m.notify).toHaveBeenCalledWith(expect.objectContaining({ pharmacyId: "ph1", userId: "titulaire", linkUrl: "/equipe" }));
    expect(sent.map((mail) => mail.to)).toEqual(["anne@exemple.fr"]);
    expect(sent[0].text).toContain("n'a accès à rien");
  });

  it("une officine de démonstration, inactive ou inconnue ne reçoit pas de demande", async () => {
    m.pharmacy.findFirst.mockResolvedValue(null);
    expect(await svc.requestToJoin(join, deps)).toMatchObject({ ok: false });
    expect(m.pharmacy.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "ph1", isActive: true, isDemo: false } }));
    expect(m.joinRequest.create).not.toHaveBeenCalled();
  });

  it("une adresse qui a déjà un compte reçoit la MÊME réponse à l'écran, et l'information par e-mail seulement", async () => {
    m.user.findFirst.mockResolvedValue({ id: "u-existant" });
    expect(await svc.requestToJoin(join, deps)).toEqual({ ok: true, pharmacyName: "Pharmacie du Port" });
    expect(m.joinRequest.create).not.toHaveBeenCalled();
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("camille@exemple.fr");
    expect(sent[0].text).toContain("déjà un compte");
    expect(m.notify).not.toHaveBeenCalled();
  });

  it("une demande déjà en attente est mise à jour sans re-prévenir le titulaire ; au-delà du plafond, plus de demandes", async () => {
    m.joinRequest.findFirst.mockResolvedValue({ id: "jr-existante" });
    expect(await svc.requestToJoin(join, deps)).toMatchObject({ ok: true });
    expect(m.joinRequest.update).toHaveBeenCalled();
    expect(m.joinRequest.create).not.toHaveBeenCalled();
    expect(sent).toHaveLength(0);
    m.joinRequest.findFirst.mockResolvedValue(null);
    m.joinRequest.count.mockResolvedValue(25);
    expect(await svc.requestToJoin(join, deps)).toMatchObject({ ok: false });
  });

  it("refuse un poste de titulaire, un mot de passe faible, une adresse invalide", async () => {
    expect(await svc.requestToJoin({ ...join, role: "OWNER" }, deps)).toMatchObject({ ok: false });
    expect(await svc.requestToJoin({ ...join, password: "faible" }, deps)).toMatchObject({ ok: false });
    expect(await svc.requestToJoin({ ...join, email: "pas-une-adresse" }, deps)).toMatchObject({ ok: false });
    expect(m.joinRequest.create).not.toHaveBeenCalled();
  });

  it("les demandes listées sont celles de CETTE officine, en attente", async () => {
    m.joinRequest.findMany.mockResolvedValue([]);
    await svc.listJoinRequests("ph1");
    expect(m.joinRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { pharmacyId: "ph1", status: "PENDING" } }));
  });
});

describe("le titulaire décide", () => {
  const request = { id: "jr1", pharmacyId: "ph1", email: "camille@exemple.fr", firstName: "Camille", lastName: "Martin", passwordHash: "hash(MotDePasse1234)", status: "PENDING" };

  it("approuver crée le compte avec le poste CHOISI par le titulaire, dans son officine, et prévient la personne ; le mot de passe de la demande est effacé", async () => {
    m.joinRequest.findFirst.mockResolvedValue(request);
    expect(await svc.approveJoinRequest(scope, "jr1", "PHARMACIST", deps)).toEqual({ ok: true, name: "Camille Martin" });
    expect(m.joinRequest.findFirst).toHaveBeenCalledWith({ where: { id: "jr1", pharmacyId: "ph1", status: "PENDING" } });
    expect(m.joinRequest.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: "jr1", pharmacyId: "ph1", status: "PENDING" }, data: { status: "APPROVED", grantedRole: "PHARMACIST", passwordHash: null, decidedByUserId: "titulaire" } });
    expect(m.user.create.mock.calls[0][0].data).toMatchObject({ organizationId: "org1", email: "camille@exemple.fr", passwordHash: "hash(MotDePasse1234)" });
    expect(m.membership.create.mock.calls[0][0].data).toMatchObject({ pharmacyId: "ph1", role: "PHARMACIST" });
    expect(sent[0].to).toBe("camille@exemple.fr");
    expect(sent[0].text).toContain("approuvé");
  });

  it("jamais titulaire par approbation ; une demande d'une autre officine ou déjà traitée est introuvable", async () => {
    m.joinRequest.findFirst.mockResolvedValue(request);
    expect(await svc.approveJoinRequest(scope, "jr1", "OWNER", deps)).toMatchObject({ ok: false });
    m.joinRequest.findFirst.mockResolvedValue(null);
    expect(await svc.approveJoinRequest(scope, "jr-autre", "TECHNICIAN", deps)).toMatchObject({ ok: false });
    expect(await svc.refuseJoinRequest(scope, "jr-autre", deps)).toMatchObject({ ok: false });
    expect(m.user.create).not.toHaveBeenCalled();
  });

  it("deux clics simultanés n'ouvrent qu'un compte", async () => {
    m.joinRequest.findFirst.mockResolvedValue(request);
    m.joinRequest.updateMany.mockResolvedValue({ count: 0 });
    expect(await svc.approveJoinRequest(scope, "jr1", "TECHNICIAN", deps)).toMatchObject({ ok: false });
    expect(m.user.create).not.toHaveBeenCalled();
  });

  it("si l'adresse a reçu un compte entre-temps, l'approbation s'arrête (le titulaire invite plutôt)", async () => {
    m.joinRequest.findFirst.mockResolvedValue(request);
    m.user.findFirst.mockResolvedValue({ id: "u-entre-temps" });
    expect(await svc.approveJoinRequest(scope, "jr1", "TECHNICIAN", deps)).toMatchObject({ ok: false, error: expect.stringContaining("invitez") });
    expect(m.membership.create).not.toHaveBeenCalled();
  });

  it("refuser efface le mot de passe de la demande, ne crée rien, et répond poliment", async () => {
    m.joinRequest.findFirst.mockResolvedValue(request);
    expect(await svc.refuseJoinRequest(scope, "jr1", deps)).toEqual({ ok: true, name: "Camille Martin" });
    expect(m.joinRequest.updateMany.mock.calls[0][0]).toMatchObject({ data: { status: "REFUSED", passwordHash: null } });
    expect(m.user.create).not.toHaveBeenCalled();
    expect(sent[0].text).toContain("n'a pas donné suite");
  });
});
