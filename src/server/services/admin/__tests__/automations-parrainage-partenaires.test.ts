import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Les deux règles ajoutées au moteur des relances : « filleul inscrit »
 * (e-mail et notification au parrain) et « invitation à référencer sa gamme »
 * (e-mail à un partenaire sans marque). Même base simulée en mémoire que le
 * moteur existant : la clé unique d'`AutomationDispatch` y est respectée comme
 * en vrai (P2002 au doublon). Aucun e-mail ne part : l'envoi est un double.
 */

const db = vi.hoisted(() => {
  type Dispatch = { id: string; ruleKey?: string; dedupeKey: string; status: string; recipient?: string | null; detail?: string | null; emailDispatchId?: string | null; createdAt?: Date; [key: string]: unknown };
  const state = {
    rules: [] as { key: string; enabled: boolean; offsetDays: number }[],
    dispatches: [] as Dispatch[],
    filleuls: [] as unknown[],
    partners: [] as unknown[],
    /** Les officines lues par nom (historique d'une règle). */
    pharmacies: [] as { id: string; name: string }[],
    optedOutHashes: new Set<string>(),
  };
  const prisma = {
    automationRule: {
      findMany: vi.fn(async () => state.rules),
      upsert: vi.fn(async ({ where, update, create }: { where: { key: string }; update: { enabled: boolean; offsetDays: number }; create: { key: string; enabled: boolean; offsetDays: number } }) => {
        const existing = state.rules.find((r) => r.key === where.key);
        if (existing) Object.assign(existing, { enabled: update.enabled, offsetDays: update.offsetDays });
        else state.rules.push({ key: create.key, enabled: create.enabled, offsetDays: create.offsetDays });
        return existing ?? create;
      }),
    },
    subscription: { findMany: vi.fn(async () => []) },
    cancellationRequest: { findMany: vi.fn(async () => []) },
    prospect: { findMany: vi.fn(async () => []) },
    pharmacy: {
      findMany: vi.fn(async ({ where }: { where: { id?: { in: string[] } } }) => (where.id ? state.pharmacies.filter((p) => where.id!.in.includes(p.id)) : state.filleuls)),
    },
    partner: {
      findMany: vi.fn(async ({ where }: { where: { id?: { in: string[] } } }) => (where.id ? (state.partners as { id: string; name: string }[]).filter((p) => where.id!.in.includes(p.id)) : state.partners)),
    },
    marketingOptOut: { findUnique: vi.fn(async ({ where }: { where: { emailHash: string } }) => (state.optedOutHashes.has(where.emailHash) ? { id: "mo_1" } : null)) },
    emailDispatch: { findFirst: vi.fn(async () => null) },
    automationDispatch: {
      findMany: vi.fn(async ({ where }: { where: { dedupeKey?: { in: string[] }; ruleKey?: string } }) => {
        if (where.dedupeKey) return state.dispatches.filter((d) => where.dedupeKey!.in.includes(d.dedupeKey)).map((d) => ({ dedupeKey: d.dedupeKey }));
        return state.dispatches.filter((d) => d.ruleKey === where.ruleKey);
      }),
      create: vi.fn(async ({ data }: { data: { dedupeKey: string; status: string } & Record<string, unknown> }) => {
        if (state.dispatches.some((d) => d.dedupeKey === data.dedupeKey)) throw Object.assign(new Error("Unique constraint failed on the fields: (`dedupeKey`)"), { code: "P2002" });
        const row = { ...data, id: `ad_${state.dispatches.length + 1}` };
        state.dispatches.push(row);
        return { id: row.id };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = state.dispatches.find((d) => d.id === where.id);
        if (!row) throw new Error("introuvable");
        Object.assign(row, data);
        return row;
      }),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        const index = state.dispatches.findIndex((d) => d.id === where.id);
        if (index < 0) throw new Error("introuvable");
        return state.dispatches.splice(index, 1)[0];
      }),
    },
  };
  return { state, prisma };
});

const mocks = vi.hoisted(() => ({
  pharmacyRecipient: vi.fn(),
  partnerRecipient: vi.fn(),
  templateValuesFor: vi.fn(),
  sendTemplatedEmail: vi.fn(),
  createNotification: vi.fn(),
  notifyAdmins: vi.fn(),
  notifySalesRep: vi.fn(),
  recordAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: db.prisma }));
vi.mock("@/server/audit/log", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@/server/security/tokens", () => ({ hashEmail: (email: string) => `hash:${email.trim().toLowerCase()}` }));
vi.mock("@/server/services/notifications", () => ({ createNotification: mocks.createNotification }));
vi.mock("@/server/services/sales/notifications", () => ({ notifyAdmins: mocks.notifyAdmins, notifySalesRep: mocks.notifySalesRep }));
vi.mock("@/server/services/admin/outbound-email", () => ({ pharmacyRecipient: mocks.pharmacyRecipient, partnerRecipient: mocks.partnerRecipient, templateValuesFor: mocks.templateValuesFor, sendTemplatedEmail: mocks.sendTemplatedEmail }));
vi.mock("@/server/services/admin/contracts-admin", () => ({ contractCounters: vi.fn(async () => ({ "a-signer": 0 })) }));

const { runAutomations, saveRule, previewRule, anchorWindowStart, recentDispatchesByRule } = await import("../automations");
const { AUTOMATION_RULES, CATCH_UP_DAYS } = await import("@/core/admin/automations");

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-10T08:15:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

const PARRAIN = { email: "titulaire@parrain.fr", firstName: "Camille", fullName: "Camille Martin", pharmacyId: "ph_parrain", organizationId: "org_parrain", prospectId: null, pharmacyName: "Pharmacie du Port" };
const PARTNER = { email: "claire.durand@labo-exemple.fr", firstName: "Claire", fullName: "Claire Durand", pharmacyId: null, organizationId: null, prospectId: null, pharmacyName: "Laboratoires Exemple" };

function filleulRow(overrides: Record<string, unknown> = {}) {
  return { id: "ph_filleul", name: "Pharmacie du Marché", isDemo: false, createdAt: daysAgo(1), referredById: "ph_parrain", referralAmountCents: null, referredBy: { name: "Pharmacie du Port" }, ...overrides };
}
function partnerRow(overrides: Record<string, unknown> = {}) {
  return { id: "pa_1", name: "Laboratoires Exemple", status: "ACTIVE", createdAt: daysAgo(5), _count: { brands: 0 }, ...overrides };
}
const sentOutcome = (status = "SENT") => ({ outcome: { status, provider: "test", detail: status === "SENT" ? "Remis au prestataire." : "Aucun service d'envoi configuré." }, subject: "Objet", dispatchId: "ed_1" });

beforeEach(() => {
  db.state.rules = [];
  db.state.dispatches = [];
  db.state.filleuls = [];
  db.state.partners = [];
  db.state.pharmacies = [];
  db.state.optedOutHashes = new Set();
  vi.clearAllMocks();
  mocks.pharmacyRecipient.mockResolvedValue(PARRAIN);
  mocks.partnerRecipient.mockResolvedValue(PARTNER);
  mocks.templateValuesFor.mockImplementation(async (_recipient: unknown, extra: Record<string, string | null> = {}) => ({ prenom: "Camille", ...extra }));
  mocks.sendTemplatedEmail.mockResolvedValue(sentOutcome());
  mocks.createNotification.mockResolvedValue(undefined);
});

describe("parrainage et partenaires : désactivés par défaut", () => {
  it("aucune règle activée : ni filleul ni partenaire n'est lu, rien ne part", async () => {
    db.state.filleuls = [filleulRow()];
    db.state.partners = [partnerRow()];
    const report = await runAutomations({ now: NOW, dryRun: false });
    expect(report).toMatchObject({ enabledRules: 0, planned: 0, sent: 0 });
    expect(db.prisma.pharmacy.findMany).not.toHaveBeenCalled();
    expect(db.prisma.partner.findMany).not.toHaveBeenCalled();
    expect(db.state.dispatches).toHaveLength(0);
    expect(mocks.sendTemplatedEmail).not.toHaveBeenCalled();
    expect(mocks.createNotification).not.toHaveBeenCalled();
  });

  it("une règle activée ne lit que ses propres candidats : une autre règle active ne déclenche ni leur lecture ni leur envoi", async () => {
    db.state.rules = [{ key: "trial.welcome", enabled: true, offsetDays: 1 }];
    db.state.filleuls = [filleulRow()];
    db.state.partners = [partnerRow()];
    await runAutomations({ now: NOW, dryRun: false });
    expect(db.prisma.pharmacy.findMany).not.toHaveBeenCalled();
    expect(db.prisma.partner.findMany).not.toHaveBeenCalled();

    db.state.rules = [{ key: "referral.filleul_joined", enabled: true, offsetDays: 0 }];
    await runAutomations({ now: NOW, dryRun: true });
    expect(db.prisma.pharmacy.findMany).toHaveBeenCalledTimes(1);
    expect(db.prisma.partner.findMany).not.toHaveBeenCalled();
  });

  it("une règle désactivée explicitement n'envoie rien, même avec une cible due", async () => {
    db.state.rules = [
      { key: "referral.filleul_joined", enabled: false, offsetDays: 0 },
      { key: "partner.range_invitation", enabled: false, offsetDays: 5 },
    ];
    db.state.filleuls = [filleulRow()];
    db.state.partners = [partnerRow()];
    const report = await runAutomations({ now: NOW, dryRun: false });
    expect(report.sent).toBe(0);
    expect(mocks.sendTemplatedEmail).not.toHaveBeenCalled();
    expect(mocks.createNotification).not.toHaveBeenCalled();
  });
});

describe("règle « filleul inscrit »", () => {
  beforeEach(() => {
    db.state.rules = [{ key: "referral.filleul_joined", enabled: true, offsetDays: 0 }];
    db.state.filleuls = [filleulRow()];
  });

  it("l'e-mail part au titulaire du PARRAIN, avec le nom de l'officine du filleul et la remise : 20 % de moins", async () => {
    const report = await runAutomations({ now: NOW, dryRun: false });
    expect(report).toMatchObject({ planned: 1, sent: 1, errors: [] });
    expect(mocks.pharmacyRecipient).toHaveBeenCalledWith("ph_parrain");
    expect(mocks.pharmacyRecipient).not.toHaveBeenCalledWith("ph_filleul");
    expect(mocks.templateValuesFor).toHaveBeenCalledWith(PARRAIN, { filleul: "Pharmacie du Marché", montant_remise: "20 %" });
    expect(mocks.sendTemplatedEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendTemplatedEmail.mock.calls[0][0]).toMatchObject({ templateKey: "referral.filleul_joined", recipient: PARRAIN, trigger: "AUTOMATIC", ruleKey: "referral.filleul_joined" });
  });

  it("le déclenchement cible le filleul, est rattaché à l'officine du parrain, et porte une clé par filleul", async () => {
    await runAutomations({ now: NOW, dryRun: false });
    expect(db.state.dispatches).toHaveLength(1);
    expect(db.state.dispatches[0]).toMatchObject({ ruleKey: "referral.filleul_joined", dedupeKey: "referral.filleul_joined:ph_filleul:2026-10-09", targetType: "Pharmacy", targetId: "ph_filleul", pharmacyId: "ph_parrain", status: "SENT", recipient: "titulaire@parrain.fr", emailDispatchId: "ed_1" });
  });

  it("une notification SYSTEM part dans l'application du parrain, vers l'onglet abonnement, sans autre donnée que le nom et la remise", async () => {
    await runAutomations({ now: NOW, dryRun: false });
    expect(mocks.createNotification).toHaveBeenCalledTimes(1);
    const notification = mocks.createNotification.mock.calls[0][0] as { pharmacyId: string; type: string; title: string; body: string; linkUrl: string; userId?: string };
    expect(notification).toMatchObject({ pharmacyId: "ph_parrain", type: "SYSTEM", linkUrl: "/parametres?onglet=abonnement" });
    expect(notification.title).toBe("Nouveau filleul : Pharmacie du Marché");
    expect(notification.body).toContain("Pharmacie du Marché");
    expect(notification.body).toContain("Votre abonnement passe à 20 % de moins par mois");
    expect(notification.body).toContain("appliquée par l'équipe PharmaBoost");
    // Plus aucun montant fixe par filleul.
    expect(notification.body).not.toMatch(/10\s?€/);
    // Pas de nom de personne, pas d'adresse : ni celle du parrain, ni celle du titulaire du filleul.
    const everything = JSON.stringify([notification, mocks.recordAudit.mock.calls, mocks.templateValuesFor.mock.calls[0][1]]);
    for (const secret of ["titulaire@parrain.fr", "Camille", "Martin"]) expect(everything).not.toContain(secret);
  });

  it("la remise annoncée est celle de la règle pour TOUS les filleuls : une offre figée sur la fiche d'un filleul ne change ni l'e-mail ni la notification", async () => {
    db.state.filleuls = [
      filleulRow({ id: "ph_avant", name: "Pharmacie d'Avant", referralAmountCents: null }),
      filleulRow({ id: "ph_offre", name: "Pharmacie de l'Offre", referralAmountCents: 2550 }),
    ];
    await runAutomations({ now: NOW, dryRun: false });
    const extras = mocks.templateValuesFor.mock.calls.map((c) => c[1]);
    expect(extras).toEqual(expect.arrayContaining([{ filleul: "Pharmacie d'Avant", montant_remise: "20 %" }, { filleul: "Pharmacie de l'Offre", montant_remise: "20 %" }]));
    const bodies = mocks.createNotification.mock.calls.map((c) => (c[0] as { body: string }).body);
    expect(bodies.some((b) => b.includes("Pharmacie d'Avant") && b.includes("20 % de moins"))).toBe(true);
    expect(bodies.some((b) => b.includes("Pharmacie de l'Offre") && b.includes("20 % de moins"))).toBe(true);
    // Le montant d'une offre n'est jamais annoncé : il sort de l'écran du titulaire, calculé avec le plus avantageux.
    expect(JSON.stringify([extras, bodies])).not.toContain("25,50");
  });

  it("deux passages n'envoient qu'une fois, et ne notifient qu'une fois", async () => {
    await runAutomations({ now: NOW, dryRun: false });
    const second = await runAutomations({ now: new Date(NOW.getTime() + 60 * 60 * 1000), dryRun: false });
    expect(second).toMatchObject({ planned: 0, sent: 0, alreadyDone: 1 });
    expect(mocks.sendTemplatedEmail).toHaveBeenCalledTimes(1);
    expect(mocks.createNotification).toHaveBeenCalledTimes(1);
  });

  it("passage simultané : la clé déjà prise à l'insertion (P2002) bloque l'e-mail ET la notification", async () => {
    db.state.dispatches = [{ id: "ad_autre", dedupeKey: "referral.filleul_joined:ph_filleul:2026-10-09", status: "SENDING" }];
    db.prisma.automationDispatch.findMany.mockResolvedValueOnce([]);
    const report = await runAutomations({ now: NOW, dryRun: false });
    expect(report).toMatchObject({ sent: 0, alreadyDone: 1, errors: [] });
    expect(report.items[0].status).toBe("ALREADY_DONE");
    expect(mocks.sendTemplatedEmail).not.toHaveBeenCalled();
    expect(mocks.createNotification).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
    expect(db.state.dispatches).toHaveLength(1);
  });

  it("la clé est insérée AVANT l'e-mail, et l'e-mail précède la notification", async () => {
    const order: string[] = [];
    db.prisma.automationDispatch.create.mockImplementationOnce(async ({ data }: { data: { dedupeKey: string; status: string } }) => {
      order.push(`clé:${data.status}`);
      db.state.dispatches.push({ id: "ad_1", ...data });
      return { id: "ad_1" };
    });
    mocks.sendTemplatedEmail.mockImplementationOnce(async () => {
      order.push("e-mail");
      return sentOutcome();
    });
    mocks.createNotification.mockImplementationOnce(async () => {
      order.push("notification");
    });
    await runAutomations({ now: NOW, dryRun: false });
    expect(order).toEqual(["clé:SENDING", "e-mail", "notification"]);
  });

  it("l'aperçu n'écrit rien, ne notifie personne, et dit qui est prévenu de quoi", async () => {
    db.state.pharmacies = [];
    const report = await runAutomations({ now: NOW, dryRun: true });
    expect(report.items).toHaveLength(1);
    expect(report.items[0]).toMatchObject({ ruleKey: "referral.filleul_joined", targetType: "Pharmacy", targetId: "ph_filleul", targetLabel: "Pharmacie du Marché (filleul de Pharmacie du Port)", recipient: "titulaire@parrain.fr", templateKey: "referral.filleul_joined", status: "PREVIEW" });
    expect(db.prisma.automationDispatch.create).not.toHaveBeenCalled();
    expect(db.prisma.automationDispatch.update).not.toHaveBeenCalled();
    expect(mocks.sendTemplatedEmail).not.toHaveBeenCalled();
    expect(mocks.createNotification).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("l'aperçu d'une règle désactivée montre ce qu'elle enverrait, sans rien écrire", async () => {
    db.state.rules = [];
    const items = await previewRule("referral.filleul_joined", 0, NOW);
    expect(items).toHaveLength(1);
    expect(items?.[0]).toMatchObject({ recipient: "titulaire@parrain.fr", status: "PREVIEW" });
    expect(db.prisma.automationDispatch.create).not.toHaveBeenCalled();
    expect(mocks.createNotification).not.toHaveBeenCalled();
  });

  it("rattrapage : seulement l'échu des derniers jours, jamais tous les filleuls des derniers mois", async () => {
    db.state.filleuls = [
      filleulRow({ id: "ph_hier", createdAt: daysAgo(1) }),
      filleulRow({ id: "ph_limite", createdAt: daysAgo(CATCH_UP_DAYS) }),
      filleulRow({ id: "ph_trop_tard", createdAt: daysAgo(CATCH_UP_DAYS + 1) }),
      filleulRow({ id: "ph_ancien", createdAt: daysAgo(60) }),
    ];
    const report = await runAutomations({ now: NOW, dryRun: false });
    expect(report.items.map((i) => i.targetId).sort()).toEqual(["ph_hier", "ph_limite"]);
  });

  it("la lecture est bornée : fenêtre de dates, ni démonstration (filleul ou parrain), seulement des filleuls", async () => {
    await runAutomations({ now: NOW, dryRun: true });
    const where = (db.prisma.pharmacy.findMany.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    expect(where).toMatchObject({ isDemo: false, referredById: { not: null }, referredBy: { isDemo: false }, createdAt: { gte: anchorWindowStart(NOW) } });
  });

  it("une officine de démonstration, ou sans parrain, qui passerait la lecture n'écrit à personne", async () => {
    db.state.filleuls = [filleulRow({ id: "ph_demo", isDemo: true }), filleulRow({ id: "ph_orphelin", referredById: null, referredBy: null })];
    const report = await runAutomations({ now: NOW, dryRun: false });
    expect(report.planned).toBe(0);
    expect(mocks.sendTemplatedEmail).not.toHaveBeenCalled();
  });

  it("parrain sans adresse connue : ignoré avec le motif, ni e-mail ni notification", async () => {
    mocks.pharmacyRecipient.mockResolvedValue(null);
    const report = await runAutomations({ now: NOW, dryRun: false });
    expect(report).toMatchObject({ sent: 0, skipped: 1 });
    expect(db.state.dispatches[0]).toMatchObject({ status: "SKIPPED", detail: expect.stringMatching(/Aucune adresse e-mail connue pour cette officine/) });
    expect(mocks.sendTemplatedEmail).not.toHaveBeenCalled();
    expect(mocks.createNotification).not.toHaveBeenCalled();
  });

  it("une notification impossible ne change pas l'issue de l'e-mail : elle est dite dans le détail", async () => {
    mocks.createNotification.mockRejectedValueOnce(new Error("base indisponible"));
    const report = await runAutomations({ now: NOW, dryRun: false });
    expect(report).toMatchObject({ sent: 1, errors: [] });
    expect(db.state.dispatches[0].status).toBe("SENT");
    expect(db.state.dispatches[0].detail).toMatch(/notification dans l'application n'a pas pu être créée : base indisponible/);
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "referral.filleul_notified", metadata: expect.objectContaining({ inApp: false }) }));
  });

  it("messagerie non configurée : la ligne est SIMULATED, et l'application du parrain est tout de même prévenue (la clé est consommée)", async () => {
    mocks.sendTemplatedEmail.mockResolvedValueOnce(sentOutcome("SIMULATED"));
    const report = await runAutomations({ now: NOW, dryRun: false });
    expect(report).toMatchObject({ sent: 0, simulated: 1 });
    expect(db.state.dispatches[0].status).toBe("SIMULATED");
    expect(mocks.createNotification).toHaveBeenCalledTimes(1);
  });

  it("l'envoi est tracé au journal d'audit sans adresse ni nom de personne", async () => {
    await runAutomations({ now: NOW, dryRun: false, adminId: "adm_1" });
    expect(mocks.recordAudit).toHaveBeenCalledWith({ action: "referral.filleul_notified", entityType: "Pharmacy", entityId: "ph_filleul", pharmacyId: "ph_parrain", platformAdminId: "adm_1", metadata: { ruleKey: "referral.filleul_joined", discountPercent: 20, emailStatus: "SENT", inApp: true } });
  });
});

describe("règle « invitation à référencer sa gamme »", () => {
  beforeEach(() => {
    db.state.rules = [{ key: "partner.range_invitation", enabled: true, offsetDays: 5 }];
    db.state.partners = [partnerRow()];
  });

  it("l'e-mail part au contact du PARTENAIRE, jamais à une officine, avec le nom du partenaire", async () => {
    const report = await runAutomations({ now: NOW, dryRun: false });
    expect(report).toMatchObject({ planned: 1, sent: 1, errors: [] });
    expect(mocks.partnerRecipient).toHaveBeenCalledWith("pa_1");
    expect(mocks.pharmacyRecipient).not.toHaveBeenCalled();
    expect(mocks.templateValuesFor).toHaveBeenCalledWith(PARTNER, { nom_partenaire: "Laboratoires Exemple" });
    expect(mocks.sendTemplatedEmail.mock.calls[0][0]).toMatchObject({ templateKey: "partner.range_invitation", trigger: "AUTOMATIC", ruleKey: "partner.range_invitation" });
  });

  it("l'e-mail n'est rattaché à aucune officine, organisation ni dossier ; le lien avec le partenaire est porté par le déclenchement", async () => {
    await runAutomations({ now: NOW, dryRun: false });
    const sentTo = mocks.sendTemplatedEmail.mock.calls[0][0].recipient;
    expect(sentTo).toMatchObject({ pharmacyId: null, organizationId: null, prospectId: null });
    expect(db.state.dispatches[0]).toMatchObject({ ruleKey: "partner.range_invitation", dedupeKey: "partner.range_invitation:pa_1:2026-10-05", targetType: "Partner", targetId: "pa_1", pharmacyId: null, status: "SENT", recipient: "claire.durand@labo-exemple.fr" });
  });

  it("aucune notification dans une application d'officine, et une trace d'audit sans adresse", async () => {
    await runAutomations({ now: NOW, dryRun: false });
    expect(mocks.createNotification).not.toHaveBeenCalled();
    expect(mocks.recordAudit).toHaveBeenCalledWith({ action: "partner.invitation_sent", entityType: "Partner", entityId: "pa_1", platformAdminId: null, metadata: { ruleKey: "partner.range_invitation", emailStatus: "SENT" } });
    expect(JSON.stringify(mocks.recordAudit.mock.calls)).not.toContain("labo-exemple.fr");
  });

  it("une seule invitation par fiche : un second passage, même simultané, n'écrit pas deux fois", async () => {
    await runAutomations({ now: NOW, dryRun: false });
    const second = await runAutomations({ now: new Date(NOW.getTime() + 60 * 60 * 1000), dryRun: false });
    expect(second).toMatchObject({ planned: 0, alreadyDone: 1 });
    expect(mocks.sendTemplatedEmail).toHaveBeenCalledTimes(1);

    db.state.dispatches = [{ id: "ad_autre", dedupeKey: "partner.range_invitation:pa_1:2026-10-05", status: "SENDING" }];
    db.prisma.automationDispatch.findMany.mockResolvedValueOnce([]);
    const concurrent = await runAutomations({ now: NOW, dryRun: false });
    expect(concurrent).toMatchObject({ sent: 0, alreadyDone: 1 });
    expect(mocks.sendTemplatedEmail).toHaveBeenCalledTimes(1);
  });

  it("la lecture ne retient que les partenaires publiables, dans la fenêtre ; l'invitation ne part qu'aux fiches sans marque", async () => {
    db.state.partners = [
      partnerRow({ id: "pa_marque", _count: { brands: 2 } }),
      partnerRow({ id: "pa_suspendu", status: "SUSPENDED" }),
      partnerRow({ id: "pa_archive", status: "ARCHIVED" }),
      partnerRow({ id: "pa_sans_marque" }),
    ];
    const report = await runAutomations({ now: NOW, dryRun: false });
    expect(report.items.map((i) => i.targetId)).toEqual(["pa_sans_marque"]);
    const where = (db.prisma.partner.findMany.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    expect(where).toMatchObject({ status: { in: ["DRAFT", "TEST", "ACTIVE"] }, createdAt: { gte: anchorWindowStart(NOW) } });
  });

  it("pas avant le délai, rattrapage de quelques jours, pas au-delà", async () => {
    db.state.partners = [partnerRow({ id: "pa_trop_tot", createdAt: daysAgo(4) }), partnerRow({ id: "pa_limite", createdAt: daysAgo(5 + CATCH_UP_DAYS) }), partnerRow({ id: "pa_trop_tard", createdAt: daysAgo(5 + CATCH_UP_DAYS + 1) })];
    const report = await runAutomations({ now: NOW, dryRun: false });
    expect(report.items.map((i) => i.targetId)).toEqual(["pa_limite"]);
  });

  it("partenaire sans aucune adresse : ignoré avec un motif propre aux partenaires", async () => {
    mocks.partnerRecipient.mockResolvedValue(null);
    const report = await runAutomations({ now: NOW, dryRun: false });
    expect(report).toMatchObject({ sent: 0, skipped: 1 });
    expect(db.state.dispatches[0]).toMatchObject({ status: "SKIPPED", detail: expect.stringMatching(/Aucune adresse e-mail connue pour ce partenaire/) });
    expect(mocks.sendTemplatedEmail).not.toHaveBeenCalled();
  });

  it("une adresse désinscrite des offres n'est jamais contactée : ignorée à l'envoi comme à l'aperçu", async () => {
    db.state.optedOutHashes = new Set(["hash:claire.durand@labo-exemple.fr"]);
    const preview = await runAutomations({ now: NOW, dryRun: true });
    expect(preview.items[0]).toMatchObject({ status: "PREVIEW_SKIPPED", detail: expect.stringMatching(/désinscrite des offres/) });
    const report = await runAutomations({ now: NOW, dryRun: false });
    expect(report).toMatchObject({ sent: 0, skipped: 1 });
    expect(db.state.dispatches[0]).toMatchObject({ status: "SKIPPED", detail: expect.stringMatching(/désinscrite des offres/) });
    expect(mocks.sendTemplatedEmail).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("la liste de désinscription ne concerne que les partenaires : le message de parrainage au titulaire part toujours", async () => {
    db.state.rules = [{ key: "referral.filleul_joined", enabled: true, offsetDays: 0 }];
    db.state.filleuls = [filleulRow()];
    db.state.optedOutHashes = new Set(["hash:titulaire@parrain.fr"]);
    const report = await runAutomations({ now: NOW, dryRun: false });
    expect(report.sent).toBe(1);
    expect(db.prisma.marketingOptOut.findUnique).not.toHaveBeenCalled();
  });

  it("l'aperçu écrit et envoie zéro, et nomme le partenaire", async () => {
    const report = await runAutomations({ now: NOW, dryRun: true });
    expect(report.items[0]).toMatchObject({ targetType: "Partner", targetLabel: "Laboratoires Exemple", recipient: "claire.durand@labo-exemple.fr", templateKey: "partner.range_invitation", status: "PREVIEW" });
    expect(db.prisma.automationDispatch.create).not.toHaveBeenCalled();
    expect(mocks.sendTemplatedEmail).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("l'aperçu d'une seule règle ne lit que les partenaires", async () => {
    db.state.rules = [];
    const items = await previewRule("partner.range_invitation", 5, NOW);
    expect(items).toHaveLength(1);
    expect(db.prisma.partner.findMany).toHaveBeenCalledTimes(1);
    expect(db.prisma.pharmacy.findMany).not.toHaveBeenCalled();
  });

  it("une lecture du destinataire en erreur avant l'envoi libère la clé : le passage suivant réessaie", async () => {
    mocks.partnerRecipient.mockRejectedValueOnce(new Error("base indisponible"));
    const report = await runAutomations({ now: NOW, dryRun: false });
    expect(report.errors).toHaveLength(1);
    expect(db.state.dispatches).toHaveLength(0);
    const again = await runAutomations({ now: new Date(NOW.getTime() + 60 * 60 * 1000), dryRun: false });
    expect(again).toMatchObject({ planned: 1, sent: 1 });
  });
});

describe("règles de parrainage et de partenaires : réglage et lecture", () => {
  it("la fenêtre de lecture couvre le plus long délai de toutes les règles, rattrapage compris", () => {
    for (const rule of AUTOMATION_RULES) {
      const lastUsefulAnchor = new Date(NOW.getTime() - (rule.maxOffsetDays + CATCH_UP_DAYS) * DAY);
      expect(anchorWindowStart(NOW).getTime()).toBeLessThanOrEqual(lastUsefulAnchor.getTime());
    }
  });

  it("activer une règle est audité avec l'avant (désactivée) et l'après ; le délai est ramené dans ses bornes", async () => {
    const result = await saveRule("partner.range_invitation", { enabled: true, offsetDays: 90 }, "adm_1");
    expect(result).toMatchObject({ ok: true, rule: { enabled: true, offsetDays: 30 } });
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "platform.automation_updated", entityId: "partner.range_invitation", metadata: { before: { enabled: false, offsetDays: 5 }, after: { enabled: true, offsetDays: 30 } } }));
    const filleul = await saveRule("referral.filleul_joined", { enabled: true, offsetDays: 9 }, "adm_1");
    expect(filleul).toMatchObject({ ok: true, rule: { offsetDays: 3 } });
    expect(await saveRule("partner.range_invitation", { enabled: true, offsetDays: 0 }, "adm_1")).toMatchObject({ ok: true, rule: { offsetDays: 1 } });
  });

  it("l'historique d'une règle de partenaires nomme le partenaire ; celui d'un parrainage, l'officine prévenue", async () => {
    db.state.partners = [{ id: "pa_1", name: "Laboratoires Exemple" }];
    db.state.pharmacies = [{ id: "ph_parrain", name: "Pharmacie du Port" }];
    db.state.dispatches = [
      { id: "ad_1", ruleKey: "partner.range_invitation", dedupeKey: "k1", status: "SENT", recipient: "claire@labo.fr", targetType: "Partner", targetId: "pa_1", pharmacyId: null, createdAt: NOW },
      { id: "ad_2", ruleKey: "referral.filleul_joined", dedupeKey: "k2", status: "SENT", recipient: "titulaire@parrain.fr", targetType: "Pharmacy", targetId: "ph_filleul", pharmacyId: "ph_parrain", createdAt: NOW },
    ];
    const recent = await recentDispatchesByRule(5);
    expect(recent.get("partner.range_invitation")?.[0]).toMatchObject({ targetType: "Partner", targetId: "pa_1", targetLabel: "Laboratoires Exemple" });
    expect(recent.get("referral.filleul_joined")?.[0]).toMatchObject({ targetType: "Pharmacy", pharmacyId: "ph_parrain", targetLabel: "Pharmacie du Port" });
  });
});
