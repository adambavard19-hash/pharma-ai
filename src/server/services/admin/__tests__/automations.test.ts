import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Le moteur des relances avec une base simulée en mémoire : la clé unique
 * d'`AutomationDispatch` y est respectée comme en vrai (P2002 au doublon).
 * Aucun e-mail ne part : l'envoi est un double.
 */

const db = vi.hoisted(() => {
  type Dispatch = { id: string; dedupeKey: string; status: string; recipient?: string | null; detail?: string | null; emailDispatchId?: string | null; [key: string]: unknown };
  type Email = { templateKey: string; trigger: string; status: string; pharmacyId: string | null; organizationId: string | null; createdAt: Date };
  type EmailWhere = { templateKey: string; trigger: string; status: { in: string[] }; createdAt: { gte: Date }; OR: { pharmacyId?: string; organizationId?: string }[] };
  const state = {
    rules: [] as { key: string; enabled: boolean; offsetDays: number }[],
    dispatches: [] as Dispatch[],
    /** Les e-mails déjà tracés (EmailDispatch), pour la détection d'un envoi manuel. */
    emails: [] as Email[],
    subscriptions: [] as unknown[],
    cancellations: [] as unknown[],
    prospects: [] as unknown[],
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
    subscription: { findMany: vi.fn<(args?: unknown) => Promise<unknown[]>>(async () => state.subscriptions) },
    pharmacy: { findUnique: vi.fn(async () => null), findMany: vi.fn(async () => []) },
    extranetNotification: { count: vi.fn(async () => 0) },
    prospectEvent: { count: vi.fn(async () => 0) },
    emailDispatch: {
      count: vi.fn<(args?: unknown) => Promise<number>>(async () => 0),
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async ({ where }: { where: EmailWhere }) => {
        const matches = state.emails
          .filter((e) => e.templateKey === where.templateKey && e.trigger === where.trigger && where.status.in.includes(e.status) && e.createdAt.getTime() >= where.createdAt.gte.getTime())
          .filter((e) => where.OR.some((c) => (c.pharmacyId !== undefined && c.pharmacyId === e.pharmacyId) || (c.organizationId !== undefined && c.organizationId === e.organizationId)))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return matches[0] ? { createdAt: matches[0].createdAt } : null;
      }),
    },
    cancellationRequest: { findMany: vi.fn(async () => state.cancellations) },
    prospect: { findMany: vi.fn(async () => state.prospects) },
    automationDispatch: {
      count: vi.fn(async () => 0),
      findMany: vi.fn(async ({ where }: { where: { dedupeKey: { in: string[] } } }) => state.dispatches.filter((d) => where.dedupeKey.in.includes(d.dedupeKey)).map((d) => ({ dedupeKey: d.dedupeKey }))),
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
  templateValuesFor: vi.fn(),
  sendTemplatedEmail: vi.fn(),
  notifyAdmins: vi.fn(),
  notifySalesRep: vi.fn(),
  recordAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: db.prisma }));
vi.mock("@/server/audit/log", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@/server/services/sales/notifications", () => ({ notifyAdmins: mocks.notifyAdmins, notifySalesRep: mocks.notifySalesRep }));
vi.mock("@/server/services/admin/outbound-email", () => ({ pharmacyRecipient: mocks.pharmacyRecipient, templateValuesFor: mocks.templateValuesFor, sendTemplatedEmail: mocks.sendTemplatedEmail }));
vi.mock("@/server/services/admin/contracts-admin", () => ({ contractCounters: vi.fn(async () => ({ "a-signer": 3 })) }));

const { runAutomations, saveRule, previewRule, anchorWindowStart, loadRelancesOverview, relancesTileHref, RELANCES_TILES } = await import("../automations");
const { parseCommunicationFilters } = await import("../communications");
const { GET } = await import("@/app/api/cron/automatisations/route");

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-10T08:15:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

const RECIPIENT = { email: "titulaire@officine.fr", firstName: "Camille", fullName: "Camille Martin", pharmacyId: "ph_1", organizationId: "org_1", prospectId: null, pharmacyName: "Pharmacie du Port" };

function subscriptionRow(overrides: Record<string, unknown> = {}) {
  return { id: "sub_1", organizationId: "org_1", status: "TRIALING", trialStartsAt: daysAgo(1), trialEndsAt: new Date(NOW.getTime() + 29 * DAY), lastPaymentAt: null, lastPaymentFailedAt: null, suspendedAt: null, payments: [], organization: { pharmacies: [{ id: "ph_1", name: "Pharmacie du Port" }] }, ...overrides };
}

beforeEach(() => {
  db.state.rules = [];
  db.state.dispatches = [];
  db.state.emails = [];
  db.state.subscriptions = [];
  db.state.cancellations = [];
  db.state.prospects = [];
  vi.clearAllMocks();
  mocks.pharmacyRecipient.mockResolvedValue(RECIPIENT);
  mocks.templateValuesFor.mockImplementation(async (_recipient: unknown, extra: Record<string, string | null> = {}) => ({ prenom: "Camille", officine: "Pharmacie du Port", ...extra }));
  mocks.sendTemplatedEmail.mockResolvedValue({ outcome: { status: "SENT", provider: "test", detail: "Remis au prestataire." }, subject: "Bienvenue", dispatchId: "ed_1" });
});

describe("relances automatiques : sûres par défaut", () => {
  it("aucune règle activée : rien n'est lu, rien ne part", async () => {
    db.state.subscriptions = [subscriptionRow()];
    const report = await runAutomations({ now: NOW, dryRun: false });
    expect(report).toMatchObject({ enabledRules: 0, planned: 0, sent: 0 });
    expect(db.prisma.subscription.findMany).not.toHaveBeenCalled();
    expect(db.prisma.automationDispatch.create).not.toHaveBeenCalled();
    expect(mocks.sendTemplatedEmail).not.toHaveBeenCalled();
  });

  it("une règle désactivée n'envoie rien, même avec une cible due", async () => {
    db.state.rules = [{ key: "trial.welcome", enabled: false, offsetDays: 1 }];
    db.state.subscriptions = [subscriptionRow()];
    const report = await runAutomations({ now: NOW, dryRun: false });
    expect(report.sent).toBe(0);
    expect(mocks.sendTemplatedEmail).not.toHaveBeenCalled();
    expect(db.state.dispatches).toHaveLength(0);
  });
});

describe("relances automatiques : une seule fois", () => {
  beforeEach(() => {
    db.state.rules = [{ key: "trial.welcome", enabled: true, offsetDays: 1 }];
    db.state.subscriptions = [subscriptionRow()];
  });

  it("deux passages successifs n'envoient qu'une fois", async () => {
    const first = await runAutomations({ now: NOW, dryRun: false });
    expect(first).toMatchObject({ planned: 1, sent: 1, alreadyDone: 0 });
    expect(mocks.sendTemplatedEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendTemplatedEmail.mock.calls[0][0]).toMatchObject({ templateKey: "trial.welcome", trigger: "AUTOMATIC", ruleKey: "trial.welcome" });
    expect(db.state.dispatches).toHaveLength(1);
    expect(db.state.dispatches[0]).toMatchObject({ dedupeKey: "trial.welcome:sub_1:2026-10-09", status: "SENT", recipient: "titulaire@officine.fr", emailDispatchId: "ed_1" });

    const second = await runAutomations({ now: new Date(NOW.getTime() + 60 * 60 * 1000), dryRun: false });
    expect(second).toMatchObject({ planned: 0, sent: 0, alreadyDone: 1 });
    expect(mocks.sendTemplatedEmail).toHaveBeenCalledTimes(1);
    expect(db.state.dispatches).toHaveLength(1);
  });

  it("passage simultané : la clé déjà prise à l'insertion (P2002) bloque l'envoi", async () => {
    // L'autre passage a inséré la clé entre la lecture et l'insertion.
    db.state.dispatches = [{ id: "ad_autre", dedupeKey: "trial.welcome:sub_1:2026-10-09", status: "SENDING" }];
    db.prisma.automationDispatch.findMany.mockResolvedValueOnce([]);
    const report = await runAutomations({ now: NOW, dryRun: false });
    expect(report).toMatchObject({ sent: 0, alreadyDone: 1, errors: [] });
    expect(report.items[0].status).toBe("ALREADY_DONE");
    expect(mocks.sendTemplatedEmail).not.toHaveBeenCalled();
    expect(db.state.dispatches).toHaveLength(1);
  });

  it("l'insertion de la clé précède toujours l'envoi", async () => {
    const order: string[] = [];
    db.prisma.automationDispatch.create.mockImplementationOnce(async ({ data }: { data: { dedupeKey: string; status: string } }) => {
      order.push(`insert:${data.status}`);
      db.state.dispatches.push({ id: "ad_1", ...data });
      return { id: "ad_1" };
    });
    mocks.sendTemplatedEmail.mockImplementationOnce(async () => {
      order.push("send");
      return { outcome: { status: "SENT", provider: "test", detail: "ok" }, subject: "S", dispatchId: "ed_9" };
    });
    await runAutomations({ now: NOW, dryRun: false });
    expect(order).toEqual(["insert:SENDING", "send"]);
  });

  it("dryRun n'écrit rien et n'envoie rien, mais résout le destinataire", async () => {
    const report = await runAutomations({ now: NOW, dryRun: true });
    expect(report.dryRun).toBe(true);
    expect(report.items).toHaveLength(1);
    expect(report.items[0]).toMatchObject({ ruleKey: "trial.welcome", targetLabel: "Pharmacie du Port", recipient: "titulaire@officine.fr", templateKey: "trial.welcome", status: "PREVIEW" });
    expect(db.prisma.automationDispatch.create).not.toHaveBeenCalled();
    expect(db.prisma.automationDispatch.update).not.toHaveBeenCalled();
    expect(mocks.sendTemplatedEmail).not.toHaveBeenCalled();
    expect(mocks.notifyAdmins).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("messagerie non configurée : la ligne est tracée SIMULATED", async () => {
    mocks.sendTemplatedEmail.mockResolvedValueOnce({ outcome: { status: "SIMULATED", provider: "aucun", detail: "Aucun service d'envoi configuré." }, subject: "S", dispatchId: "ed_2" });
    const report = await runAutomations({ now: NOW, dryRun: false });
    expect(report).toMatchObject({ sent: 0, simulated: 1 });
    expect(db.state.dispatches[0].status).toBe("SIMULATED");
  });

  it("lancement manuel : tracé au journal d'audit", async () => {
    await runAutomations({ now: NOW, dryRun: false, adminId: "adm_1" });
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "platform.automation_run", platformAdminId: "adm_1", metadata: expect.objectContaining({ sent: 1 }) }));
    expect(mocks.sendTemplatedEmail.mock.calls[0][0]).toMatchObject({ adminId: "adm_1" });
  });
});

describe("relances automatiques : cas particuliers", () => {
  it("destinataire absent : SKIPPED avec le motif, sans envoi", async () => {
    db.state.rules = [{ key: "trial.welcome", enabled: true, offsetDays: 1 }];
    db.state.subscriptions = [subscriptionRow()];
    mocks.pharmacyRecipient.mockResolvedValue(null);
    const report = await runAutomations({ now: NOW, dryRun: false });
    expect(report).toMatchObject({ sent: 0, skipped: 1 });
    expect(mocks.sendTemplatedEmail).not.toHaveBeenCalled();
    expect(db.state.dispatches[0]).toMatchObject({ status: "SKIPPED" });
    expect(db.state.dispatches[0].detail).toMatch(/Aucune adresse e-mail/);
  });

  it("dryRun sans destinataire : annoncé comme ne partant pas", async () => {
    db.state.rules = [{ key: "trial.welcome", enabled: true, offsetDays: 1 }];
    db.state.subscriptions = [subscriptionRow()];
    mocks.pharmacyRecipient.mockResolvedValue(null);
    const report = await runAutomations({ now: NOW, dryRun: true });
    expect(report.items[0].status).toBe("PREVIEW_SKIPPED");
    expect(report.skipped).toBe(1);
    expect(db.state.dispatches).toHaveLength(0);
  });

  it("une organisation sans officine réelle (démonstration) n'est jamais relancée", async () => {
    db.state.rules = [{ key: "trial.welcome", enabled: true, offsetDays: 1 }];
    db.state.subscriptions = [subscriptionRow({ organization: { pharmacies: [] } })];
    const report = await runAutomations({ now: NOW, dryRun: false });
    expect(report.planned).toBe(0);
    expect(db.state.dispatches).toHaveLength(0);
  });

  it("alerte interne : l'équipe et le commercial du dossier sont prévenus, statut INTERNAL", async () => {
    db.state.rules = [{ key: "prospect.followup_overdue", enabled: true, offsetDays: 1 }];
    db.state.prospects = [{ id: "pr_1", name: "Pharmacie des Lilas", status: "CONTACTED", nextActionAt: daysAgo(1), nextActionLabel: "Rappeler", blockedAt: null, salesRepId: "rep_1" }];
    const report = await runAutomations({ now: NOW, dryRun: false });
    expect(report).toMatchObject({ internal: 1, sent: 0 });
    expect(mocks.notifyAdmins).toHaveBeenCalledWith(expect.objectContaining({ linkUrl: "/admin/dossiers/pr_1", severity: "WARNING" }));
    expect(mocks.notifySalesRep).toHaveBeenCalledWith(expect.objectContaining({ salesRepId: "rep_1", linkUrl: "/extranet/dossiers/pr_1" }));
    expect(mocks.sendTemplatedEmail).not.toHaveBeenCalled();
    expect(db.state.dispatches[0]).toMatchObject({ status: "INTERNAL", targetType: "Prospect", targetId: "pr_1" });
  });

  it("résiliation confirmée : la date de fin prévue est passée au modèle", async () => {
    db.state.rules = [{ key: "cancellation.confirmation", enabled: true, offsetDays: 0 }];
    db.state.cancellations = [{ id: "cr_1", pharmacyId: "ph_1", status: "CONFIRMED", requestedAt: daysAgo(5), confirmedAt: daysAgo(0.5), plannedEndAt: new Date("2026-12-31T12:00:00Z"), pharmacy: { name: "Pharmacie du Port" }, subscription: null }];
    const report = await runAutomations({ now: NOW, dryRun: false });
    expect(report.sent).toBe(1);
    expect(mocks.templateValuesFor).toHaveBeenCalledWith(RECIPIENT, expect.objectContaining({ date_fin_prevue: "31/12/2026", date_demande: "05/10/2026" }));
    expect(mocks.sendTemplatedEmail.mock.calls[0][0]).toMatchObject({ templateKey: "cancellation.confirmed", ruleKey: "cancellation.confirmation" });
  });

  it("résiliation confirmée sans date de fin connue : ignorée avec le motif, plutôt qu'une phrase vide", async () => {
    db.state.rules = [{ key: "cancellation.confirmation", enabled: true, offsetDays: 0 }];
    db.state.cancellations = [{ id: "cr_1", pharmacyId: "ph_1", status: "CONFIRMED", requestedAt: daysAgo(5), confirmedAt: daysAgo(0.5), plannedEndAt: null, pharmacy: { name: "Pharmacie du Port" }, subscription: null }];
    const report = await runAutomations({ now: NOW, dryRun: false });
    expect(report).toMatchObject({ sent: 0, skipped: 1 });
    expect(db.state.dispatches[0].detail).toMatch(/Date de fin prévue inconnue/);
  });

  it("une erreur pendant l'envoi garde la clé consommée et remonte dans le rapport", async () => {
    db.state.rules = [{ key: "trial.welcome", enabled: true, offsetDays: 1 }];
    db.state.subscriptions = [subscriptionRow()];
    mocks.sendTemplatedEmail.mockRejectedValueOnce(new Error("prestataire injoignable"));
    const report = await runAutomations({ now: NOW, dryRun: false });
    expect(report.errors).toHaveLength(1);
    expect(db.state.dispatches[0]).toMatchObject({ status: "FAILED", detail: "prestataire injoignable" });
    const again = await runAutomations({ now: NOW, dryRun: false });
    expect(again).toMatchObject({ planned: 0, alreadyDone: 1 });
    expect(mocks.sendTemplatedEmail).toHaveBeenCalledTimes(1);
  });

  it("une erreur AVANT l'envoi (valeurs illisibles) libère la clé : le passage suivant réessaie", async () => {
    db.state.rules = [{ key: "trial.welcome", enabled: true, offsetDays: 1 }];
    db.state.subscriptions = [subscriptionRow()];
    mocks.templateValuesFor.mockRejectedValueOnce(new Error("base indisponible"));
    const report = await runAutomations({ now: NOW, dryRun: false });
    expect(report.errors).toHaveLength(1);
    expect(report.items[0]).toMatchObject({ status: "ERROR" });
    expect(report.items[0].detail).toMatch(/rien n'est parti/);
    expect(mocks.sendTemplatedEmail).not.toHaveBeenCalled();
    expect(db.state.dispatches).toHaveLength(0);
    const again = await runAutomations({ now: new Date(NOW.getTime() + 60 * 60 * 1000), dryRun: false });
    expect(again).toMatchObject({ planned: 1, sent: 1, alreadyDone: 0 });
    expect(db.state.dispatches).toEqual([expect.objectContaining({ dedupeKey: "trial.welcome:sub_1:2026-10-09", status: "SENT" })]);
  });

  it("un destinataire illisible n'est pas gardé en mémoire : la relance suivante de la même officine le relit", async () => {
    // Bienvenue (J+1) et rappel de fin d'essai (J-5) dus le même jour pour la même officine.
    db.state.rules = [
      { key: "trial.welcome", enabled: true, offsetDays: 1 },
      { key: "trial.ending_soon", enabled: true, offsetDays: -5 },
    ];
    db.state.subscriptions = [subscriptionRow({ trialEndsAt: new Date("2026-10-15T12:00:00Z") })];
    mocks.pharmacyRecipient.mockRejectedValueOnce(new Error("connexion perdue"));
    const report = await runAutomations({ now: NOW, dryRun: false });
    expect(mocks.pharmacyRecipient).toHaveBeenCalledTimes(2);
    expect(report).toMatchObject({ sent: 1 });
    expect(report.errors).toHaveLength(1);
    // La relance en erreur a rendu sa clé ; celle qui est partie garde la sienne.
    expect(db.state.dispatches).toHaveLength(1);
    expect(db.state.dispatches[0].status).toBe("SENT");
  });

  it("les candidats ne sont lus que dans la fenêtre utile", () => {
    // Plus long délai (30 j) + rattrapage (2 j) + 1 jour de marge.
    expect(anchorWindowStart(NOW).toISOString()).toBe(daysAgo(33).toISOString());
  });
});

describe("relances automatiques : paiement, envois manuels, valeurs", () => {
  it("relance de paiement : ancrée sur la plus ancienne facture due, pas sur la dernière tentative de Stripe", async () => {
    db.state.rules = [{ key: "payment.reminder_1", enabled: true, offsetDays: 2 }];
    // Première facture en échec le 8 octobre ; Stripe a retenté hier soir.
    const row = subscriptionRow({ status: "PAST_DUE", trialStartsAt: null, trialEndsAt: null, lastPaymentAt: daysAgo(40), lastPaymentFailedAt: daysAgo(0.5), payments: [{ status: "FAILED", createdAt: daysAgo(2) }] });
    db.state.subscriptions = [row];
    const report = await runAutomations({ now: NOW, dryRun: false });
    expect(report.sent).toBe(1);
    expect(db.state.dispatches[0]).toMatchObject({ dedupeKey: "payment.reminder_1:sub_1:2026-10-08", status: "SENT" });
    const select = (db.prisma.subscription.findMany.mock.calls[0][0] as { select: { payments: { where: { status: { in: string[] } } } } }).select;
    expect(select.payments.where.status.in).toEqual(["FAILED", "OPEN"]);
    // Nouvelle tentative de Stripe le lendemain : même série, rien ne repart.
    db.state.subscriptions = [{ ...row, lastPaymentFailedAt: new Date(NOW.getTime() + 0.5 * DAY) }];
    const nextDay = await runAutomations({ now: new Date(NOW.getTime() + DAY), dryRun: false });
    expect(nextDay).toMatchObject({ planned: 0, sent: 0, alreadyDone: 1 });
    expect(mocks.sendTemplatedEmail).toHaveBeenCalledTimes(1);
  });

  it("alerte d'impayé : datée du début de la série", async () => {
    db.state.rules = [{ key: "payment.internal_alert", enabled: true, offsetDays: 3 }];
    db.state.subscriptions = [subscriptionRow({ status: "PAST_DUE", trialStartsAt: null, trialEndsAt: null, lastPaymentAt: daysAgo(40), lastPaymentFailedAt: daysAgo(0.5), payments: [{ status: "OPEN", createdAt: daysAgo(3) }] })];
    const report = await runAutomations({ now: NOW, dryRun: false });
    expect(report.internal).toBe(1);
    expect(mocks.notifyAdmins).toHaveBeenCalledWith(expect.objectContaining({ type: "AUTOMATION_PAYMENT_ALERT", body: expect.stringContaining("depuis le 07/10/2026") }));
  });

  it("le même modèle déjà envoyé à la main depuis l'événement : la relance automatique est ignorée, avec le motif", async () => {
    db.state.rules = [{ key: "cancellation.acknowledgement", enabled: true, offsetDays: 0 }];
    db.state.cancellations = [{ id: "cr_1", pharmacyId: "ph_1", status: "RECEIVED", requestedAt: daysAgo(1), confirmedAt: null, plannedEndAt: null, pharmacy: { name: "Pharmacie du Port" }, subscription: null }];
    db.state.emails = [{ templateKey: "cancellation.received", trigger: "MANUAL", status: "SENT", pharmacyId: "ph_1", organizationId: "org_1", createdAt: new Date(daysAgo(1).getTime() + 5 * 60 * 1000) }];
    const preview = await runAutomations({ now: NOW, dryRun: true });
    expect(preview.items[0]).toMatchObject({ status: "PREVIEW_SKIPPED", detail: expect.stringMatching(/^Déjà envoyé manuellement le 09\/10\/2026/) });
    const report = await runAutomations({ now: NOW, dryRun: false });
    expect(report).toMatchObject({ sent: 0, skipped: 1 });
    expect(mocks.sendTemplatedEmail).not.toHaveBeenCalled();
    expect(db.state.dispatches[0]).toMatchObject({ status: "SKIPPED", recipient: "titulaire@officine.fr", detail: expect.stringMatching(/^Déjà envoyé manuellement le 09\/10\/2026/) });
  });

  it("un autre modèle, un envoi non remis, antérieur à l'événement ou à une autre officine ne compte pas", async () => {
    db.state.rules = [{ key: "cancellation.acknowledgement", enabled: true, offsetDays: 0 }];
    db.state.cancellations = [{ id: "cr_1", pharmacyId: "ph_1", status: "RECEIVED", requestedAt: daysAgo(1), confirmedAt: null, plannedEndAt: null, pharmacy: { name: "Pharmacie du Port" }, subscription: null }];
    const at = daysAgo(0.5);
    db.state.emails = [
      { templateKey: "generic.message", trigger: "MANUAL", status: "SENT", pharmacyId: "ph_1", organizationId: "org_1", createdAt: at },
      { templateKey: "cancellation.received", trigger: "MANUAL", status: "SIMULATED", pharmacyId: "ph_1", organizationId: "org_1", createdAt: at },
      { templateKey: "cancellation.received", trigger: "AUTOMATIC", status: "SENT", pharmacyId: "ph_1", organizationId: "org_1", createdAt: at },
      { templateKey: "cancellation.received", trigger: "MANUAL", status: "SENT", pharmacyId: "ph_1", organizationId: "org_1", createdAt: daysAgo(3) },
      { templateKey: "cancellation.received", trigger: "MANUAL", status: "SENT", pharmacyId: "ph_9", organizationId: "org_9", createdAt: at },
    ];
    const report = await runAutomations({ now: NOW, dryRun: false });
    expect(report).toMatchObject({ sent: 1, skipped: 0 });
  });

  it("rappel de fin d'essai : un envoi manuel quelques jours plus tôt, depuis une autre officine de l'organisation, suffit", async () => {
    db.state.rules = [{ key: "trial.ending_soon", enabled: true, offsetDays: -5 }];
    db.state.subscriptions = [subscriptionRow({ trialEndsAt: new Date("2026-10-15T12:00:00Z") })];
    // Envoyé à la main à J-6, depuis la fiche d'une autre officine du même titulaire.
    db.state.emails = [{ templateKey: "trial.ending_soon", trigger: "MANUAL", status: "DELIVERED", pharmacyId: "ph_2", organizationId: "org_1", createdAt: daysAgo(1) }];
    const report = await runAutomations({ now: NOW, dryRun: false });
    expect(report).toMatchObject({ sent: 0, skipped: 1 });
    expect(db.state.dispatches[0].detail).toMatch(/^Déjà envoyé manuellement le 09\/10\/2026/);
  });

  it("{{jours_restants}} : compté en jours calendaires de Paris, et transmis au modèle", async () => {
    db.state.rules = [{ key: "trial.ending_soon", enabled: true, offsetDays: -5 }];
    // Fin d'essai le 15 à 22 h (Paris) : le 10, il reste 5 jours (et non ⌈5,5⌉ = 6).
    db.state.subscriptions = [subscriptionRow({ trialEndsAt: new Date("2026-10-15T20:00:00Z") })];
    const report = await runAutomations({ now: NOW, dryRun: false });
    expect(report.sent).toBe(1);
    expect(mocks.templateValuesFor).toHaveBeenCalledWith(RECIPIENT, expect.objectContaining({ jours_restants: "5" }));
  });

  it("relance commerciale : un contact noté après la date prévue, aucune alerte", async () => {
    db.state.rules = [{ key: "prospect.followup_overdue", enabled: true, offsetDays: 1 }];
    db.state.prospects = [{ id: "pr_1", name: "Pharmacie des Lilas", status: "CONTRACT_SENT", nextActionAt: daysAgo(1), nextActionLabel: "Envoyer le contrat", lastContactAt: daysAgo(0.9), blockedAt: null, salesRepId: "rep_1" }];
    const report = await runAutomations({ now: NOW, dryRun: false });
    expect(report).toMatchObject({ planned: 0, internal: 0 });
    expect(mocks.notifyAdmins).not.toHaveBeenCalled();
  });
});

describe("réglage d'une règle", () => {
  it("un délai qui ferait partir la deuxième relance avant ou avec la première est refusé, sans écriture", async () => {
    db.state.rules = [{ key: "payment.reminder_1", enabled: true, offsetDays: 5 }];
    const refused = await saveRule("payment.reminder_2", { enabled: true, offsetDays: 5 }, "adm_1");
    expect(refused).toMatchObject({ ok: false, error: expect.stringMatching(/« Deuxième relance » doit partir après « Première relance »/) });
    expect(db.prisma.automationRule.upsert).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
    expect(await saveRule("payment.reminder_2", { enabled: true, offsetDays: 6 }, "adm_1")).toMatchObject({ ok: true, rule: { offsetDays: 6 } });
    // L'alerte, au plus tôt le jour de la dernière relance.
    expect(await saveRule("payment.internal_alert", { enabled: true, offsetDays: 5 }, "adm_1")).toMatchObject({ ok: false });
    expect(await saveRule("payment.internal_alert", { enabled: true, offsetDays: 6 }, "adm_1")).toMatchObject({ ok: true });
  });

  it("le délai est ramené dans ses bornes, l'avant et l'après vont au journal", async () => {
    const result = await saveRule("trial.ending_soon", { enabled: true, offsetDays: -40 }, "adm_1");
    expect(result).toMatchObject({ ok: true, rule: { enabled: true, offsetDays: -14 } });
    expect(db.prisma.automationRule.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { key: "trial.ending_soon" }, update: expect.objectContaining({ enabled: true, offsetDays: -14, updatedByAdminId: "adm_1" }) }));
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "platform.automation_updated", entityId: "trial.ending_soon", metadata: { before: { enabled: false, offsetDays: -5 }, after: { enabled: true, offsetDays: -14 } } }));
  });

  it("une règle inconnue est refusée sans écriture", async () => {
    expect(await saveRule("inconnue", { enabled: true, offsetDays: 1 }, "adm_1")).toEqual({ ok: false, error: "Règle inconnue." });
    expect(db.prisma.automationRule.upsert).not.toHaveBeenCalled();
  });

  it("l'aperçu d'une règle désactivée montre ce qu'elle enverrait, sans rien écrire", async () => {
    db.state.subscriptions = [subscriptionRow()];
    const items = await previewRule("trial.welcome", 1, NOW);
    expect(items).toHaveLength(1);
    expect(items?.[0]).toMatchObject({ recipient: "titulaire@officine.fr", status: "PREVIEW" });
    expect(db.prisma.automationDispatch.create).not.toHaveBeenCalled();
    expect(db.prisma.automationRule.upsert).not.toHaveBeenCalled();
  });
});

describe("centre des relances : tuiles", () => {
  it("chaque tuile ouvre l'historique avec exactement les filtres qui la comptent (aucun filtre ignoré)", () => {
    for (const tile of Object.keys(RELANCES_TILES) as (keyof typeof RELANCES_TILES)[]) {
      const href = relancesTileHref(tile);
      expect(href.startsWith("/admin/communications?")).toBe(true);
      const parsed = parseCommunicationFilters(Object.fromEntries(new URL(href, "http://localhost").searchParams));
      for (const [key, value] of Object.entries(RELANCES_TILES[tile])) expect(parsed[key as keyof typeof parsed]).toBe(value);
    }
  });

  it("les chiffres sont ceux que l'historique affichera ; les contrats à signer, ceux du centre des contrats", async () => {
    db.prisma.emailDispatch.count.mockResolvedValue(4);
    db.prisma.automationDispatch.count.mockResolvedValue(2);
    db.prisma.extranetNotification.count.mockResolvedValue(1);
    const overview = await loadRelancesOverview(NOW);
    expect(overview).toMatchObject({ automaticEmailsSent: 4, internalAlerts: 1, skipped: 2, automaticFailures: 4 + 2, contractRemindersSent: 4, contractsAwaitingSignature: 3 });
    const emailWheres = db.prisma.emailDispatch.count.mock.calls.map((c) => JSON.stringify((c[0] as { where: unknown }).where));
    expect(emailWheres.some((w) => w.includes('"trigger":"AUTOMATIC"') && w.includes('"SENT"'))).toBe(true);
    expect(emailWheres.some((w) => w.includes('"CONTRACT_REMINDER"'))).toBe(true);
    db.prisma.emailDispatch.count.mockResolvedValue(0);
    db.prisma.automationDispatch.count.mockResolvedValue(0);
    db.prisma.extranetNotification.count.mockResolvedValue(0);
  });
});

describe("tâche planifiée /api/cron/automatisations", () => {
  const request = (authorization?: string) => new Request("http://localhost/api/cron/automatisations", { headers: authorization ? { authorization } : {} });

  it("503 sans CRON_SECRET : la route n'est jamais ouverte", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const response = await GET(request("Bearer x"));
    expect(response.status).toBe(503);
    expect(db.prisma.automationRule.findMany).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("401 avec un mauvais jeton", async () => {
    vi.stubEnv("CRON_SECRET", "secret-de-test");
    expect((await GET(request("Bearer mauvais"))).status).toBe(401);
    expect((await GET(request())).status).toBe(401);
    expect(db.prisma.automationRule.findMany).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("200 avec le bon jeton : passage réel, sans règle active rien ne part", async () => {
    vi.stubEnv("CRON_SECRET", "secret-de-test");
    db.state.subscriptions = [subscriptionRow()];
    const response = await GET(request("Bearer secret-de-test"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ dryRun: false, enabledRules: 0, sent: 0 });
    expect(body.items).toBeUndefined();
    expect(mocks.sendTemplatedEmail).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});
