import { beforeEach, describe, expect, it, vi } from "vitest";

/** L'historique des communications : mise en forme, fusion, filtres, sans base réelle. */

const db = vi.hoisted(() => ({
  prisma: {
    pharmacy: { findUnique: vi.fn(), findMany: vi.fn(async () => []) },
    emailDispatch: { findMany: vi.fn(async () => []), count: vi.fn(async () => 0) },
    extranetNotification: { findMany: vi.fn(async () => []), count: vi.fn(async () => 0) },
    automationDispatch: { findMany: vi.fn(async () => []), count: vi.fn(async () => 0) },
    prospectEvent: { findMany: vi.fn(async () => []), count: vi.fn(async () => 0) },
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: db.prisma }));

const com = await import("../communications");
type Entry = import("../communications").CommunicationEntry;

const at = (iso: string) => new Date(iso);
const names = new Map([["ph_1", "Pharmacie du Port"]]);

const email = com.emailEntry(
  { id: "e1", kind: "TEMPLATE", recipient: "titulaire@officine.fr", status: "FAILED", detail: "Adresse refusée", subject: "Bienvenue sur PharmaBoost", templateKey: "trial.welcome", trigger: "AUTOMATIC", ruleKey: "trial.welcome", pharmacyId: "ph_1", prospectId: null, createdAt: at("2026-10-03T09:00:00Z") },
  names,
);
const systemEmail = com.emailEntry({ id: "e2", kind: "PAYMENT_FAILED", recipient: "autre@officine.fr", status: "SENT", detail: null, subject: null, templateKey: null, trigger: null, ruleKey: null, pharmacyId: null, prospectId: "pr_9", createdAt: at("2026-10-01T09:00:00Z") }, names);
const notification = com.notificationEntry({ id: "n1", type: "CONTRACT_STALLED", severity: "WARNING", title: "Dossier à relancer — Pharmacie des Lilas", body: "Contrat non signé.", linkUrl: "/admin/dossiers/pr_1", readAt: null, createdAt: at("2026-10-02T09:00:00Z") });
const relance = com.automationEntry({ id: "a1", ruleKey: "prospect.followup_overdue", status: "INTERNAL", recipient: "Équipe PharmaBoost", detail: "Relance commerciale dépassée — Pharmacie des Lilas", pharmacyId: null, targetType: "Prospect", targetId: "pr_1", createdAt: at("2026-10-02T10:00:00Z") }, names);
const skipped = com.automationEntry({ id: "a2", ruleKey: "trial.welcome", status: "SKIPPED", recipient: null, detail: "Aucune adresse e-mail connue", pharmacyId: "ph_1", targetType: "Subscription", targetId: "sub_1", createdAt: at("2026-09-30T10:00:00Z") }, names);
const commercial = com.prospectEventEntry({ id: "p1", type: "CONTRACT_SIGNED", summary: "Contrat signé par l'officine.", actorLabel: "Signataire", prospectId: "pr_2", createdAt: at("2026-10-02T11:00:00Z"), prospect: { name: "Pharmacie du Port", pharmacyId: "ph_1" } }, names);

describe("mise en forme des sources", () => {
  it("un e-mail de modèle : objet, modèle, déclencheur, règle, officine, statut", () => {
    expect(email).toMatchObject({
      id: "email:e1",
      type: "email",
      title: "Bienvenue sur PharmaBoost",
      detail: "Essai — bienvenue",
      trigger: "Automatique",
      ruleLabel: "Bienvenue",
      pharmacyName: "Pharmacie du Port",
      href: "/admin/pharmacies/ph_1?onglet=communication",
      status: { code: "FAILED", label: "Échec d'envoi", tone: "danger" },
    });
  });

  it("un e-mail système sans objet prend le libellé de son type et mène au dossier", () => {
    expect(systemEmail).toMatchObject({ title: "Paiement échoué", trigger: "Système", href: "/admin/dossiers/pr_9", pharmacyId: null });
  });

  it("la cadence des contrats a un libellé lisible", () => {
    expect(com.ruleLabelOf("contract.reminders")).toBe("Relances de contrat");
    expect(com.ruleLabelOf("payment.reminder_1")).toBe("Première relance");
  });

  describe("e-mails de campagne", () => {
    const campaignMail = (templateKey: string | null, overrides: Partial<Parameters<typeof com.emailEntry>[0]> = {}) =>
      com.emailEntry({ id: "c1", kind: "CAMPAIGN", recipient: "titulaire@officine.fr", status: "SENT", detail: null, subject: "Un bonus pour votre officine", templateKey, trigger: "MANUAL", ruleKey: null, pharmacyId: "ph_1", prospectId: null, createdAt: at("2026-10-04T09:00:00Z"), ...overrides }, names);

    it("renvoie vers la campagne, et garde l'officine atteignable par sa colonne", () => {
      const entry = campaignMail("campaign:ckx1234abcd5678efgh9012ij");
      expect(entry).toMatchObject({ type: "email", title: "Un bonus pour votre officine", detail: "Campagne", trigger: "Manuel", ruleLabel: null, pharmacyId: "ph_1", pharmacyName: "Pharmacie du Port", href: "/admin/campagnes/ckx1234abcd5678efgh9012ij" });
    });

    it("sans identifiant de campagne (essai, trace ancienne, autre modèle), aucun lien vers une campagne inexistante", () => {
      expect(campaignMail("campaign:test").href).toBe("/admin/pharmacies/ph_1?onglet=communication");
      expect(campaignMail(null).href).toBe("/admin/pharmacies/ph_1?onglet=communication");
      expect(campaignMail("campaign:").href).toBe("/admin/pharmacies/ph_1?onglet=communication");
      expect(campaignMail("campaign:../../admin/equipe").href).toBe("/admin/pharmacies/ph_1?onglet=communication");
      expect(campaignMail("campaign:ckx1234abcd", { pharmacyId: null }).href).toBe("/admin/campagnes/ckx1234abcd");
      expect(campaignMail("campaign:test", { pharmacyId: null }).href).toBeNull();
    });

    it("un autre type d'e-mail n'est jamais pris pour une campagne, même avec une clé qui y ressemble", () => {
      const other = com.emailEntry({ id: "c2", kind: "TEMPLATE", recipient: "a@b.fr", status: "SENT", detail: null, subject: "Objet", templateKey: "campaign:ckx1234abcd", trigger: "MANUAL", ruleKey: null, pharmacyId: "ph_1", prospectId: null, createdAt: at("2026-10-04T09:00:00Z") }, names);
      expect(other.href).toBe("/admin/pharmacies/ph_1?onglet=communication");
    });

    it("extrait l'identifiant d'une clé « campaign:<id> », rien d'autre", () => {
      expect(com.campaignIdOf("campaign:ckx1234abcd")).toBe("ckx1234abcd");
      expect(com.campaignIdOf("campaign:test")).toBeNull();
      expect(com.campaignIdOf("campaign:ckx1234abcd/extra")).toBeNull();
      expect(com.campaignIdOf("trial.welcome")).toBeNull();
      expect(com.campaignIdOf(null)).toBeNull();
    });
  });

  describe("relances automatiques selon leur cible", () => {
    const entryFor = (targetType: string, pharmacyId: string | null = null) => com.automationEntry({ id: "a9", ruleKey: "partner.range_invitation", status: "SENT", recipient: "contact@labo.fr", detail: null, pharmacyId, targetType, targetId: "cible_1", createdAt: at("2026-10-02T10:00:00Z") }, names);

    it("la cible « Partner » renvoie vers la fiche du partenaire", () => {
      expect(entryFor("Partner").href).toBe("/admin/partenaires/liste/cible_1");
    });

    it("les autres cibles gardent leur lien : officine, dossier, sinon le centre des relances", () => {
      expect(entryFor("Pharmacy", "ph_1").href).toBe("/admin/pharmacies/ph_1?onglet=communication");
      expect(entryFor("Prospect").href).toBe("/admin/dossiers/cible_1");
      expect(entryFor("Subscription").href).toBe("/admin/relances");
    });
  });

  it("une notification non lue garde sa sévérité ; lue, elle l'indique", () => {
    expect(notification).toMatchObject({ type: "notification", status: { code: "UNREAD", label: "À voir" }, href: "/admin/dossiers/pr_1" });
    const read = com.notificationEntry({ id: "n2", type: "X", severity: "CRITICAL", title: "t", body: "", linkUrl: null, readAt: at("2026-10-02T12:00:00Z"), createdAt: at("2026-10-02T09:00:00Z") });
    expect(read).toMatchObject({ status: { code: "READ", label: "Lue" }, href: "/admin/notifications", detail: null });
  });

  it("une relance interne sur un dossier mène au dossier ; sur une officine, à sa fiche", () => {
    expect(relance).toMatchObject({ type: "relance", title: "Relance automatique — Relance commerciale dépassée", prospectId: "pr_1", href: "/admin/dossiers/pr_1", status: { code: "INTERNAL" } });
    expect(skipped).toMatchObject({ href: "/admin/pharmacies/ph_1?onglet=communication", status: { code: "SKIPPED", label: "Ignorée" } });
  });

  it("une action commerciale mène au dossier et garde son auteur", () => {
    expect(commercial).toMatchObject({ type: "commercial", title: "Contrat signé par l'officine.", actor: "Signataire", href: "/admin/dossiers/pr_2", status: { code: "CONTRACT_SIGNED", tone: "success" } });
  });

  it("les e-mails des dossiers ne sont pas repris dans les actions commerciales (pas de doublon)", () => {
    expect(com.COMMERCIAL_EVENT_TYPES).not.toContain("EMAIL_SENT");
    expect(com.COMMERCIAL_EVENT_TYPES).not.toContain("CONTRACT_REMINDER");
    expect(com.COMMERCIAL_EVENT_TYPES).not.toContain("CONTRACT_SENT");
  });
});

describe("fusion et filtres", () => {
  const all: Entry[][] = [[email, systemEmail], [notification], [relance, skipped], [commercial]];

  it("fusion : du plus récent au plus ancien, sans doublon", () => {
    const merged = com.mergeCommunications([...all, [email]]);
    expect(merged.map((e) => e.id)).toEqual(["email:e1", "commercial:p1", "relance:a1", "notification:n1", "email:e2", "relance:a2"]);
  });

  it("fusion : une date invalide est écartée, la limite est respectée", () => {
    const broken = { ...email, id: "email:cassé", at: new Date("invalide") };
    expect(com.mergeCommunications([[broken, systemEmail]]).map((e) => e.id)).toEqual(["email:e2"]);
    expect(com.mergeCommunications(all, 2)).toHaveLength(2);
  });

  it("filtre par type", () => {
    const merged = com.mergeCommunications(all);
    expect(com.filterCommunications(merged, { type: "relance", statut: null, q: null }).map((e) => e.id)).toEqual(["relance:a1", "relance:a2"]);
  });

  it("filtre par statut : chaque source selon ses propres codes", () => {
    const merged = com.mergeCommunications(all);
    expect(com.filterCommunications(merged, { type: null, statut: "echec", q: null }).map((e) => e.id)).toEqual(["email:e1"]);
    expect(com.filterCommunications(merged, { type: null, statut: "non-lue", q: null }).map((e) => e.id)).toEqual(["notification:n1"]);
    expect(com.filterCommunications(merged, { type: null, statut: "ignoree", q: null }).map((e) => e.id)).toEqual(["relance:a2"]);
    // Les actions commerciales n'ont pas de statut d'envoi.
    expect(com.filterCommunications(merged, { type: "commercial", statut: "envoye", q: null })).toEqual([]);
  });

  it("recherche : destinataire, objet, officine, sans tenir compte de la casse", () => {
    const merged = com.mergeCommunications(all);
    expect(com.filterCommunications(merged, { type: null, statut: null, q: "AUTRE@" }).map((e) => e.id)).toEqual(["email:e2"]);
    expect(com.filterCommunications(merged, { type: null, statut: null, q: "lilas" }).map((e) => e.id)).toEqual(["relance:a1", "notification:n1"]);
  });

  it("filtre par officine : sa fiche, son dossier, et les liens qui la désignent", () => {
    const merged = com.mergeCommunications(all);
    expect(com.filterCommunications(merged, { type: null, statut: null, q: null, officine: "ph_1", prospectId: "pr_2" }).map((e) => e.id)).toEqual(["email:e1", "commercial:p1", "relance:a2"]);
  });

  it("filtre par période", () => {
    const merged = com.mergeCommunications(all);
    expect(com.filterCommunications(merged, { type: null, statut: null, q: null, since: at("2026-10-02T10:30:00Z") }).map((e) => e.id)).toEqual(["email:e1", "commercial:p1"]);
  });

  it("pagination", () => {
    const merged = com.mergeCommunications(all);
    expect(com.paginateCommunications(merged, 1, 4)).toMatchObject({ page: 1, hasMore: true });
    expect(com.paginateCommunications(merged, 2, 4).rows.map((e) => e.id)).toEqual(["email:e2", "relance:a2"]);
    expect(com.paginateCommunications(merged, 2, 4).hasMore).toBe(false);
    expect(com.paginateCommunications(merged, 0, 4).page).toBe(1);
  });

  it("les filtres de statut proposés dépendent du type", () => {
    expect(com.statusFiltersFor("notification")).toEqual(["non-lue", "lue"]);
    expect(com.statusFiltersFor("commercial")).toEqual([]);
    // Les alertes internes du moteur se lisent dans les notifications, plus dans les relances.
    expect(com.statusFiltersFor("relance")).toEqual(["echec", "ignoree"]);
    expect(com.statusFiltersFor(null)).toHaveLength(Object.keys(com.COMMUNICATION_STATUS_FILTERS).length);
  });
});

describe("filtres de l'adresse", () => {
  it("valeurs par défaut et valeurs inconnues", () => {
    expect(com.parseCommunicationFilters({})).toEqual({ type: null, statut: null, declencheur: null, nature: null, periode: "30j", days: 30, officine: null, q: null, page: 1 });
    expect(com.parseCommunicationFilters({ type: "fax", statut: "interne", declencheur: "manuel", nature: "tout", periode: "5ans", page: "abc", officine: "x' OR 1=1" })).toMatchObject({ type: null, statut: null, declencheur: null, nature: null, periode: "30j", page: 1, officine: null });
  });

  it("valeurs du contrat d'adresses", () => {
    expect(com.parseCommunicationFilters({ type: "relance", statut: "ignoree", periode: "3m", officine: "cmabc123def", q: "  port  ", page: "3" })).toEqual({ type: "relance", statut: "ignoree", declencheur: null, nature: null, periode: "3m", days: 91, officine: "cmabc123def", q: "port", page: 3 });
    expect(com.parseCommunicationFilters({ declencheur: "automatique", nature: "relance-contrat" })).toMatchObject({ declencheur: "automatique", nature: "relance-contrat" });
    expect(com.parseCommunicationFilters({ periode: "12m", page: "999" })).toMatchObject({ days: 365, page: com.MAX_COMMUNICATION_PAGES });
    expect(com.parseCommunicationFilters({ type: ["email", "relance"] }).type).toBe("email");
  });

  it("sévérités des notifications", () => {
    expect(com.severityFromParam("a-voir")).toBe("WARNING");
    expect(com.severityFromParam("urgent")).toBe("CRITICAL");
    expect(com.severityFromParam("n'importe")).toBeNull();
  });
});

describe("lecture en base", () => {
  beforeEach(() => vi.clearAllMocks());

  it("une officine inconnue est signalée et le filtre ignoré", async () => {
    db.prisma.pharmacy.findUnique.mockResolvedValueOnce(null);
    const page = await com.loadCommunications(com.parseCommunicationFilters({ officine: "cminconnue01" }), at("2026-10-10T08:00:00Z"));
    expect(page).toMatchObject({ officine: null, officineUnknown: true, rows: [] });
    const where = (db.prisma.emailDispatch.findMany.mock.calls as unknown as [{ where: unknown }][])[0]?.[0];
    expect(JSON.stringify(where?.where)).not.toContain("cminconnue01");
  });

  it("les actions commerciales lues sont limitées aux types retenus ; un filtre de statut les écarte", async () => {
    await com.loadCommunications(com.parseCommunicationFilters({}), at("2026-10-10T08:00:00Z"));
    const call = (db.prisma.prospectEvent.findMany.mock.calls as unknown as [{ where: { AND: { type?: { in: string[] } }[] } }][])[0][0];
    expect(call.where.AND.find((c) => c.type)?.type?.in).toEqual([...com.COMMERCIAL_EVENT_TYPES]);

    vi.clearAllMocks();
    await com.loadCommunications(com.parseCommunicationFilters({ statut: "echec" }), at("2026-10-10T08:00:00Z"));
    expect(db.prisma.prospectEvent.findMany).not.toHaveBeenCalled();
    expect(db.prisma.extranetNotification.findMany).not.toHaveBeenCalled();
    expect(db.prisma.emailDispatch.findMany).toHaveBeenCalled();
  });

  type AndWhere = { AND: Record<string, unknown>[] };
  const whereOf = (mock: { mock: { calls: unknown[][] } }) => (mock.mock.calls[0]?.[0] as { where: AndWhere } | undefined)?.where;

  it("une alerte interne du moteur n'apparaît qu'une fois : sa notification, pas en plus sa ligne de relance", async () => {
    await com.loadCommunications(com.parseCommunicationFilters({}), at("2026-10-10T08:00:00Z"));
    const relance = JSON.stringify(whereOf(db.prisma.automationDispatch.findMany));
    expect(relance).toContain("SKIPPED");
    expect(relance).not.toContain("INTERNAL");
    const notification = JSON.stringify(whereOf(db.prisma.extranetNotification.findMany));
    expect(notification).not.toContain("AUTOMATION_");
  });

  it("?declencheur=automatique : e-mails automatiques, alertes du moteur, relances du moteur ; pas d'actions commerciales", async () => {
    await com.loadCommunications(com.parseCommunicationFilters({ declencheur: "automatique" }), at("2026-10-10T08:00:00Z"));
    expect(whereOf(db.prisma.emailDispatch.findMany)?.AND).toContainEqual({ trigger: "AUTOMATIC" });
    expect(whereOf(db.prisma.extranetNotification.findMany)?.AND).toContainEqual({ type: { startsWith: com.ENGINE_NOTIFICATION_TYPE_PREFIX } });
    expect(db.prisma.automationDispatch.findMany).toHaveBeenCalled();
    expect(db.prisma.prospectEvent.findMany).not.toHaveBeenCalled();
  });

  it("?nature=relance-contrat : seulement les e-mails de relance de contrat", async () => {
    await com.loadCommunications(com.parseCommunicationFilters({ nature: "relance-contrat", statut: "envoye" }), at("2026-10-10T08:00:00Z"));
    expect(whereOf(db.prisma.emailDispatch.findMany)?.AND).toContainEqual({ kind: { in: ["CONTRACT_REMINDER"] } });
    expect(db.prisma.extranetNotification.findMany).not.toHaveBeenCalled();
    expect(db.prisma.automationDispatch.findMany).not.toHaveBeenCalled();
    expect(db.prisma.prospectEvent.findMany).not.toHaveBeenCalled();
  });

  it("?nature=campagne : seulement les e-mails de campagne, les autres sources n'ont rien à montrer", async () => {
    expect(com.parseCommunicationFilters({ nature: "campagne" }).nature).toBe("campagne");
    expect(com.COMMUNICATION_NATURES.campagne.label).toBe("Campagnes");
    await com.loadCommunications(com.parseCommunicationFilters({ nature: "campagne" }), at("2026-10-10T08:00:00Z"));
    expect(whereOf(db.prisma.emailDispatch.findMany)?.AND).toContainEqual({ kind: { in: ["CAMPAIGN"] } });
    expect(db.prisma.extranetNotification.findMany).not.toHaveBeenCalled();
    expect(db.prisma.automationDispatch.findMany).not.toHaveBeenCalled();
    expect(db.prisma.prospectEvent.findMany).not.toHaveBeenCalled();
  });

  it("les compteurs se calculent avec les mêmes conditions que la liste : un lien filtré affiche le chiffre annoncé", async () => {
    const filters = com.parseCommunicationFilters({ declencheur: "automatique", statut: "echec", periode: "30j" });
    const now = at("2026-10-10T08:00:00Z");
    db.prisma.emailDispatch.count.mockResolvedValueOnce(2);
    db.prisma.automationDispatch.count.mockResolvedValueOnce(1);
    const counts = await com.countCommunications(filters, now);
    expect(counts).toEqual({ email: 2, notification: 0, relance: 1, commercial: 0 });
    expect(com.shownCount(counts, null)).toBe(3);
    expect(com.shownCount(counts, "email")).toBe(2);
    const counted = { email: whereOf(db.prisma.emailDispatch.count), relance: whereOf(db.prisma.automationDispatch.count) };
    vi.clearAllMocks();
    await com.loadCommunications(filters, now);
    expect(whereOf(db.prisma.emailDispatch.findMany)).toEqual(counted.email);
    expect(whereOf(db.prisma.automationDispatch.findMany)).toEqual(counted.relance);
    expect(db.prisma.extranetNotification.count).not.toHaveBeenCalled();
  });

  it("fusion réelle : quatre sources, une page triée", async () => {
    db.prisma.emailDispatch.findMany.mockResolvedValueOnce([{ id: "e1", kind: "TEMPLATE", recipient: "a@b.fr", status: "SENT", detail: null, subject: "Objet", templateKey: "trial.welcome", trigger: "MANUAL", ruleKey: null, pharmacyId: "ph_1", prospectId: null, createdAt: at("2026-10-05T09:00:00Z") }] as never);
    db.prisma.extranetNotification.findMany.mockResolvedValueOnce([{ id: "n1", type: "X", severity: "INFO", title: "Info", body: "", linkUrl: null, readAt: null, createdAt: at("2026-10-06T09:00:00Z") }] as never);
    db.prisma.pharmacy.findMany.mockResolvedValueOnce([{ id: "ph_1", name: "Pharmacie du Port" }] as never);
    db.prisma.emailDispatch.count.mockResolvedValueOnce(1);
    db.prisma.extranetNotification.count.mockResolvedValueOnce(1);
    const page = await com.loadCommunications(com.parseCommunicationFilters({}), at("2026-10-10T08:00:00Z"));
    expect(page.rows.map((r) => r.id)).toEqual(["notification:n1", "email:e1"]);
    expect(page.rows[1].pharmacyName).toBe("Pharmacie du Port");
    expect(page.counts).toEqual({ email: 1, notification: 1, relance: 0, commercial: 0 });
    expect(page.hasMore).toBe(false);
  });
});
