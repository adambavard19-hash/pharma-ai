import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Chaque chiffre du cockpit se retrouve tel quel dans la liste qu'il ouvre.
 *
 * Pour chaque tuile ou carte : on lit l'adresse dans `COCKPIT_LINKS`, on en
 * tire les paramètres exactement comme la page cible, et l'on compare le
 * chiffre du cockpit au nombre de lignes (et à la pastille) de la liste,
 * calculés à partir des mêmes faits. Ni base ni réseau : Prisma est simulé.
 */

const db = vi.hoisted(() => ({
  subscription: { findMany: vi.fn() },
  billingPayment: { groupBy: vi.fn() },
  subscriptionPriceChange: { findMany: vi.fn() },
  contract: { findMany: vi.fn() },
  cancellationRequest: { findMany: vi.fn(), count: vi.fn() },
  pharmacy: { findMany: vi.fn(), count: vi.fn() },
  prospect: { findMany: vi.fn(), count: vi.fn() },
  salesTask: { findMany: vi.fn(), count: vi.fn() },
  stockConnection: { findMany: vi.fn() },
  counterPost: { count: vi.fn() },
  platformIncident: { findMany: vi.fn() },
  pharmacyInvitation: { count: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: db }));
vi.mock("@/config/env", () => ({ getEnv: () => ({}) }));
vi.mock("@/server/signature/registry", () => ({ getSignatureProvider: vi.fn() }));

const cockpit = await import("../cockpit");
const contractsAdmin = await import("../contracts-admin");
const billing = await import("../billing-admin");
const clients = await import("../clients");
const { COCKPIT_LINKS } = await import("@/app/(admin)/admin/_cockpit/links");
const { PERIODS } = await import("@/components/admin/filters");
const { parsePharmacyStatusFilter } = await import("@/core/admin/clients");
const { technicalErrors } = await import("@/core/admin/metrics");

// Samedi 3 octobre 2026, 10 h à Paris.
const NOW = new Date("2026-10-03T08:00:00Z");
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);
const inDays = (n: number) => new Date(NOW.getTime() + n * DAY);

/** Les paramètres d'une adresse du cockpit, tels que la page cible les lit. */
function paramsOf(link: string): URLSearchParams {
  return new URL(link, "https://console.invalid").searchParams;
}

function periodOf(params: URLSearchParams) {
  const period = PERIODS.find((p) => p.value === params.get("periode"));
  if (!period) throw new Error(`période absente de l'adresse : ${params.toString()}`);
  return period;
}

beforeEach(() => {
  vi.clearAllMocks();
  db.subscription.findMany.mockResolvedValue([]);
  db.billingPayment.groupBy.mockResolvedValue([]);
  db.subscriptionPriceChange.findMany.mockResolvedValue([]);
  db.contract.findMany.mockResolvedValue([]);
  db.cancellationRequest.findMany.mockResolvedValue([]);
  db.cancellationRequest.count.mockResolvedValue(0);
  db.pharmacy.findMany.mockResolvedValue([]);
  db.pharmacy.count.mockResolvedValue(0);
  db.prospect.findMany.mockResolvedValue([]);
  db.prospect.count.mockResolvedValue(0);
  db.salesTask.findMany.mockResolvedValue([]);
  db.salesTask.count.mockResolvedValue(0);
  db.stockConnection.findMany.mockResolvedValue([]);
  db.counterPost.count.mockResolvedValue(0);
  db.platformIncident.findMany.mockResolvedValue([]);
  db.pharmacyInvitation.count.mockResolvedValue(0);
});

// ================================================================ Abonnements

type SubFact = {
  status: string;
  createdAt: Date;
  canceledAt?: Date | null;
  cancelAtPeriodEnd?: boolean;
  contractPriceCents?: number | null;
  trialEndsAt?: Date | null;
};

/**
 * Une seule source de vérité, lue par les deux côtés : chaque officine réelle
 * a sa propre organisation (c'est ainsi que les deux chemins de création
 * fonctionnent).
 */
const CLIENTS: { key: string; sub: SubFact | null; confirmedAt?: Date }[] = [
  { key: "a", sub: { status: "ACTIVE", createdAt: daysAgo(10), contractPriceCents: 9_900 } },
  // Demande confirmée il y a 20 jours, fin Stripe il y a 5 jours : un seul départ, il y a 20 jours.
  { key: "b", sub: { status: "CANCELED", createdAt: daysAgo(60), canceledAt: daysAgo(5) }, confirmedAt: daysAgo(20) },
  // Fin programmée : hors MRR ; départ confirmé il y a 40 jours.
  { key: "c", sub: { status: "ACTIVE", createdAt: daysAgo(200), cancelAtPeriodEnd: true }, confirmedAt: daysAgo(40) },
  { key: "d", sub: { status: "TRIALING", createdAt: new Date(NOW.getTime() - 3_600_000), trialEndsAt: inDays(14) } },
  // Fin Stripe il y a 100 jours, demande confirmée après coup il y a 2 jours : le départ date de 100 jours.
  { key: "e", sub: { status: "CANCELED", createdAt: daysAgo(300), canceledAt: daysAgo(100) }, confirmedAt: daysAgo(2) },
  { key: "f", sub: null },
  { key: "g", sub: { status: "PAST_DUE", createdAt: daysAgo(400), contractPriceCents: 14_900 } },
];

const PLAN = { id: "plan_1", name: "PharmaBoost", monthlyPriceCents: 12_900 };

function subscriptionRow(key: string, sub: SubFact) {
  return {
    id: `sub_${key}`,
    status: sub.status,
    contractPriceCents: sub.contractPriceCents ?? null,
    trialStartsAt: null,
    trialEndsAt: sub.trialEndsAt ?? null,
    nextInvoiceAt: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd ?? false,
    suspendedAt: null,
    lastPaymentAt: null,
    lastPaymentCents: null,
    lastPaymentFailedAt: null,
    createdAt: sub.createdAt,
    updatedAt: sub.createdAt,
    canceledAt: sub.canceledAt ?? null,
    endedAt: null,
    stripeSubscriptionId: null,
    plan: PLAN,
  };
}

function mockSubscriptionWorld() {
  // Le cockpit : les abonnements des organisations réelles.
  db.subscription.findMany.mockResolvedValue(
    CLIENTS.flatMap((c) => (c.sub ? [{ ...subscriptionRow(c.key, c.sub), organizationId: `org_${c.key}`, organization: { pharmacies: [{ id: `ph_${c.key}`, name: `Pharmacie ${c.key}` }] } }] : [])),
  );
  // Les deux côtés : les demandes de résiliation confirmées (même filtre CONFIRMED_CANCELLATION_WHERE).
  db.cancellationRequest.findMany.mockResolvedValue(CLIENTS.flatMap((c) => (c.confirmedAt ? [{ organizationId: `org_${c.key}`, confirmedAt: c.confirmedAt }] : [])));
  // La liste : les officines réelles et leur abonnement.
  db.pharmacy.findMany.mockResolvedValue(
    CLIENTS.map((c) => ({
      id: `ph_${c.key}`,
      name: `Pharmacie ${c.key}`,
      city: null,
      isActive: true,
      organizationId: `org_${c.key}`,
      organization: { subscription: c.sub ? subscriptionRow(c.key, c.sub) : null },
      contracts: [],
      prospect: null,
      subscriptionInvites: [],
      memberships: [],
      cancellationRequests: [],
    })),
  );
}

/** Ce qu'affiche la liste des abonnements pour une adresse : lignes visibles et pastille active. */
async function subscriptionListFor(link: string) {
  const params = paramsOf(link);
  const filter = billing.resolveSubscriptionFilter(params.get("filtre"));
  if (!filter) throw new Error(`filtre inconnu : ${link}`);
  const period = PERIODS.find((p) => p.value === params.get("periode")) ?? null;
  const rows = await billing.listSubscriptionRows();
  const visible = rows.filter((r) => billing.matchesSubscriptionFilter(filter.key, r.classInput, NOW, period));
  const chip = billing.countSubscriptionFilters(rows.map((r) => r.classInput), NOW, period)[filter.key as keyof ReturnType<typeof billing.countSubscriptionFilters>];
  return { rows, visible: visible.map((r) => r.pharmacyId), chip };
}

describe("tuiles de période → liste des abonnements filtrée par période", () => {
  const expected: Record<string, { created: string[]; departed: string[] }> = {
    "30j": { created: ["ph_a", "ph_d"], departed: ["ph_b"] },
    "3m": { created: ["ph_a", "ph_b", "ph_d"], departed: ["ph_b", "ph_c"] },
    "12m": { created: ["ph_a", "ph_b", "ph_c", "ph_d", "ph_e"], departed: ["ph_b", "ph_c", "ph_e"] },
  };

  for (const period of PERIODS) {
    it(`« Nouveaux abonnements » sur ${period.label} : même nombre, mêmes officines`, async () => {
      mockSubscriptionWorld();
      const link = COCKPIT_LINKS.newSubscriptions(period.value);
      expect(paramsOf(link).get("filtre")).toBe("nouveaux");
      expect(periodOf(paramsOf(link))).toEqual(period);

      const kpis = await cockpit.loadKpis(period, NOW);
      const list = await subscriptionListFor(link);
      expect(kpis.newSubscriptions).toBe(expected[period.value].created.length);
      expect(list.visible.sort()).toEqual(expected[period.value].created);
      expect(list.chip).toBe(kpis.newSubscriptions);
    });

    it(`« Résiliations » sur ${period.label} : une fois par officine, à la première date, sans double compte`, async () => {
      mockSubscriptionWorld();
      const link = COCKPIT_LINKS.cancellations(period.value);
      expect(paramsOf(link).get("filtre")).toBe("resilies");
      expect(periodOf(paramsOf(link))).toEqual(period);

      const kpis = await cockpit.loadKpis(period, NOW);
      const list = await subscriptionListFor(link);
      expect(kpis.cancellations).toBe(expected[period.value].departed.length);
      expect(list.visible.sort()).toEqual(expected[period.value].departed);
      expect(list.chip).toBe(kpis.cancellations);
    });
  }

  it("sans période, « Résiliés » garde son sens historique (abonnements terminés)", async () => {
    mockSubscriptionWorld();
    const list = await subscriptionListFor("/admin/abonnements?filtre=resilies");
    expect(list.visible.sort()).toEqual(["ph_b", "ph_e"]);
  });

  it("parc : essais, actifs et MRR se retrouvent dans la liste des abonnements", async () => {
    mockSubscriptionWorld();
    const kpis = await cockpit.loadKpis(PERIODS[0], NOW);

    const trials = await subscriptionListFor(COCKPIT_LINKS.trials);
    expect(trials.visible).toEqual(["ph_d"]);
    expect(trials.visible.length).toBe(kpis.trials);

    const actives = await subscriptionListFor(COCKPIT_LINKS.activeSubscriptions);
    expect(actives.visible.sort()).toEqual(["ph_a", "ph_c"]);
    expect(actives.visible.length).toBe(kpis.activeSubscriptions);

    // Le MRR ouvre la liste complète, qui affiche en tête le même MRR contractuel.
    expect(paramsOf(COCKPIT_LINKS.mrr).toString()).toBe("");
    const rows = await billing.listSubscriptionRows();
    expect(kpis.mrrCents).toBe(9_900 + 14_900);
    expect(billing.subscriptionListMrrCents(rows)).toBe(kpis.mrrCents);
  });
});

// ================================================================ Contrats

function contractRow(over: { id: string; prospectId: string; version: number; status: string; escalatedAt?: Date | null; expiresAt?: Date | null }) {
  return {
    pharmacyId: null,
    reference: null,
    monthlyPriceCents: 12_900,
    pharmacySignerName: "Signataire",
    pharmacySignerEmail: "signataire@exemple.invalid",
    sentAt: null,
    openedAt: null,
    pharmacySignedAt: null,
    companySignedAt: null,
    finalizedAt: null,
    refusedAt: null,
    reminderCount: 0,
    lastReminderAt: null,
    createdAt: daysAgo(30 - over.version),
    prospect: { name: `Dossier ${over.prospectId}`, legalName: null, blockedAt: null, updatedAt: daysAgo(40) },
    pharmacy: null,
    escalatedAt: null,
    expiresAt: inDays(20),
    ...over,
  };
}

const CONTRACTS = [
  // Brouillon remplacé par une v2 envoyée : seule la v2 compte (à signer).
  contractRow({ id: "p1v1", prospectId: "p1", version: 1, status: "DRAFT" }),
  contractRow({ id: "p1v2", prospectId: "p1", version: 2, status: "SENT" }),
  // Signé d'abord par la société : à contresigner.
  contractRow({ id: "p2v1", prospectId: "p2", version: 1, status: "SIGNED_COMPANY" }),
  contractRow({ id: "p3v1", prospectId: "p3", version: 1, status: "DRAFT" }),
  contractRow({ id: "p4v1", prospectId: "p4", version: 1, status: "FINALIZED" }),
  // Consulté et signalé par les relances : à signer et à relancer.
  contractRow({ id: "p5v1", prospectId: "p5", version: 1, status: "OPENED", escalatedAt: daysAgo(1) }),
  contractRow({ id: "p6v1", prospectId: "p6", version: 1, status: "SIGNED_PHARMACY" }),
  // Brouillon remplacé par une v2 expirée : plus rien en attente.
  contractRow({ id: "p7v1", prospectId: "p7", version: 1, status: "DRAFT" }),
  contractRow({ id: "p7v2", prospectId: "p7", version: 2, status: "EXPIRED" }),
];

async function contractListFor(link: string) {
  const params = paramsOf(link);
  const statut = contractsAdmin.resolveContractFilter({ statut: params.get("statut"), vue: params.get("vue") });
  // La page lit « derniere » par défaut : l'adresse du cockpit ne précise pas de version.
  expect(params.get("versions")).toBeNull();
  const list = await contractsAdmin.listContractsForAdmin({ statut, q: null, versions: "derniere" }, NOW);
  return { statut, ids: list.rows.map((r) => r.id).sort(), chip: statut ? list.counters[statut] : list.counters.tous };
}

describe("tuile « Contrats en attente » → /admin/contrats?statut=en-attente", () => {
  it("dernière version de chaque dossier : un brouillon v1 remplacé par une v2 envoyée compte une fois, à signer", async () => {
    db.contract.findMany.mockResolvedValue([contractRow({ id: "v1", prospectId: "p1", version: 1, status: "DRAFT" }), contractRow({ id: "v2", prospectId: "p1", version: 2, status: "SENT" })]);
    const kpis = await cockpit.loadKpis(PERIODS[0], NOW);
    expect(kpis.contracts).toEqual({ pending: 1, drafts: 0, toSign: 1, toCountersign: 0 });
  });

  it("brouillons + à signer + à contresigner (signé société compris), et la liste montre exactement ces contrats", async () => {
    db.contract.findMany.mockResolvedValue(CONTRACTS);
    const kpis = await cockpit.loadKpis(PERIODS[0], NOW);
    expect(kpis.contracts).toEqual({ pending: 5, drafts: 1, toSign: 2, toCountersign: 2 });
    expect(kpis.contracts.pending).toBe(kpis.contracts.drafts + kpis.contracts.toSign + kpis.contracts.toCountersign);

    const list = await contractListFor(COCKPIT_LINKS.pendingContracts);
    expect(list.statut).toBe("en-attente");
    expect(list.ids).toEqual(["p1v2", "p2v1", "p3v1", "p5v1", "p6v1"]);
    expect(list.ids.length).toBe(kpis.contracts.pending);
    expect(list.chip).toBe(kpis.contracts.pending);
  });

  it("les cartes « À traiter » des contrats comptent comme leurs listes", async () => {
    db.contract.findMany.mockResolvedValue(CONTRACTS);
    const attention = await cockpit.loadAttention(NOW);
    const toSign = await contractListFor(COCKPIT_LINKS.contractsToSign);
    const toCountersign = await contractListFor(COCKPIT_LINKS.contractsToCountersign);
    const toRemind = await contractListFor(COCKPIT_LINKS.contractsToRemind);
    expect(toSign.ids).toEqual(["p1v2", "p5v1"]);
    expect(attention.contractsToSign).toBe(toSign.ids.length);
    expect(toCountersign.ids).toEqual(["p2v1", "p6v1"]);
    expect(attention.contractsToCountersign).toBe(toCountersign.ids.length);
    expect(toRemind.ids).toEqual(["p5v1"]);
    expect(attention.contractsToRemind).toBe(toRemind.ids.length);
  });

  it("le centre des contrats et le cockpit excluent les officines de démonstration, par le même filtre", async () => {
    await cockpit.loadKpis(PERIODS[0], NOW);
    await contractsAdmin.listContractsForAdmin({ statut: null }, NOW);
    expect(db.contract.findMany).toHaveBeenCalledTimes(2);
    for (const [args] of db.contract.findMany.mock.calls) expect(args.where).toEqual(contractsAdmin.REAL_CONTRACT);
    // Ni le contrat ni son dossier ne sont rattachés à une démonstration.
    expect(contractsAdmin.REAL_CONTRACT).toEqual({
      AND: [{ OR: [{ pharmacyId: null }, { pharmacy: { isDemo: false } }] }, { prospect: { OR: [{ pharmacyId: null }, { pharmacy: { isDemo: false } }] } }],
    });
  });
});

// ================================================================ Officines

describe("tuile « Officines clientes » → /admin/pharmacies?statut=actives", () => {
  it("actives hors démonstration, des deux côtés", async () => {
    const pharmacies = [
      { id: "ph_1", isActive: true, isDemo: false },
      { id: "ph_2", isActive: true, isDemo: false },
      { id: "ph_3", isActive: false, isDemo: false },
      { id: "ph_4", isActive: true, isDemo: true },
      { id: "ph_5", isActive: false, isDemo: true },
    ];
    // Le cockpit compte en base : on applique son filtre champ par champ.
    db.pharmacy.count.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => pharmacies.filter((p) => Object.entries(where).every(([field, value]) => p[field as keyof typeof p] === value)).length);
    db.pharmacy.findMany.mockResolvedValue(
      pharmacies.map((p) => ({ ...p, name: p.id, city: null, siret: null, email: null, createdAt: daysAgo(10), stockConnection: null, memberships: [], organization: { subscription: null } })),
    );

    const kpis = await cockpit.loadKpis(PERIODS[0], NOW);
    const statut = parsePharmacyStatusFilter(paramsOf(COCKPIT_LINKS.activePharmacies).get("statut"));
    expect(statut).toBe("actives");
    const list = await clients.listClientPharmacies({ q: null, statut, tri: "recent", now: NOW });

    expect(kpis.activePharmacies).toBe(2);
    expect(list.rows.map((r) => r.id).sort()).toEqual(["ph_1", "ph_2"]);
    expect(list.counts.actives).toBe(kpis.activePharmacies);
  });
});

// ================================================================ État technique

describe("carte « Alertes techniques » → /admin/technique?filtre=erreurs", () => {
  it("les incidents des officines de démonstration ne comptent ni au cockpit ni dans « Erreurs »", async () => {
    const incidents = [
      { id: "i1", pharmacyId: "ph_real" },
      { id: "i2", pharmacyId: null },
      { id: "i3", pharmacyId: "ph_demo" },
    ];
    db.platformIncident.findMany.mockResolvedValue(incidents);
    db.pharmacy.findMany.mockResolvedValue([{ id: "ph_demo" }]);

    const attention = await cockpit.loadAttention(NOW);
    expect(paramsOf(COCKPIT_LINKS.technical).get("filtre")).toBe("erreurs");
    const errors = technicalErrors({ connectors: [], counterPosts: [], incidents }, await cockpit.loadDemoPharmacyIds());

    expect(attention.technical.incidents).toBe(2);
    expect(errors.incidents.map((i) => i.id)).toEqual(["i1", "i2"]);
    expect(errors.total).toBe(attention.technical.total);
  });
});

// ================================================================ Aujourd'hui

describe("bloc « Aujourd'hui » : une démonstration n'apparaît qu'une fois", () => {
  it("ni la tâche « Démonstration » de l'agenda ni la prochaine action qui la reprend ne s'ajoutent en relance", async () => {
    const at1 = new Date("2026-10-03T12:30:00Z");
    const at2 = new Date("2026-10-03T14:00:00Z");
    db.prospect.findMany.mockImplementation(async ({ where }: { where: unknown }) => {
      // Les démonstrations du jour se lisent par `demoAt` ; les prochaines actions, par `nextActionAt`.
      if (JSON.stringify(where).includes("demoAt")) {
        return [
          { id: "pr_1", name: "Pharmacie du Port", city: "Brest", demoAt: at1, demoDoneAt: null, salesRep: { firstName: "Léa", lastName: "Martin" } },
          { id: "pr_2", name: "Pharmacie de la Gare", city: null, demoAt: at2, demoDoneAt: null, salesRep: null },
        ];
      }
      return [
        // Dossier console : la démo a posé sa prochaine action.
        { id: "pr_2", name: "Pharmacie de la Gare", nextActionAt: at2, nextActionLabel: "Démonstration", salesRep: null },
        { id: "pr_4", name: "Pharmacie du Marché", nextActionAt: new Date("2026-10-03T15:00:00Z"), nextActionLabel: "Envoyer la plaquette", salesRep: null },
      ];
    });
    db.salesTask.findMany.mockResolvedValue([
      { id: "t1", label: "Démonstration", dueAt: at1, prospect: { id: "pr_1", name: "Pharmacie du Port" }, salesRep: { firstName: "Léa", lastName: "Martin" } },
      { id: "t3", label: "Rappeler le titulaire", dueAt: new Date("2026-10-03T09:00:00Z"), prospect: { id: "pr_3", name: "Pharmacie Centrale" }, salesRep: null },
      // Sans démonstration du jour pour ce dossier, la tâche reste une relance.
      { id: "t5", label: "Démonstration", dueAt: new Date("2026-10-03T16:00:00Z"), prospect: { id: "pr_5", name: "Pharmacie des Halles" }, salesRep: null },
    ]);

    const items = await cockpit.loadToday(NOW);
    expect(items.map((item) => item.id)).toEqual(["task-t3", "demo-pr_1", "demo-pr_2", "action-pr_4", "task-t5"]);
    expect(items.filter((item) => item.kind === "demo")).toHaveLength(2);
  });
});
