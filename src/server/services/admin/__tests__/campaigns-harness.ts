import { vi } from "vitest";

/**
 * Le décor des tests des campagnes : une base en mémoire où les mises à jour
 * conditionnelles et la clé unique des destinataires se comportent comme en
 * vrai, et des doubles pour tout ce qui sortirait (messagerie, journal,
 * notifications). Aucun e-mail ne part, aucune connexion ne s'ouvre.
 *
 * Le double refuse une condition qu'il ne sait pas lire : un test ne peut pas
 * passer parce que le double a ignoré un filtre.
 */

export const NOW = new Date("2026-10-10T08:15:00Z");

type Row = Record<string, unknown>;

export const state = {
  campaigns: [] as Row[],
  recipients: [] as Row[],
  optOuts: [] as Row[],
  offers: [] as Row[],
  tick: 0,
  ids: 0,
};

export const stamp = () => new Date(NOW.getTime() + ++state.tick);
const nextId = (prefix: string) => `${prefix}_${++state.ids}`;
const clone = <T>(value: T): T => structuredClone(value);

function uniqueViolation(fields: string) {
  return Object.assign(new Error(`Unique constraint failed on the fields: (${fields})`), { code: "P2002" });
}

function matches(row: Row, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([key, condition]) => {
    const value = row[key];
    if (condition instanceof Date) return value instanceof Date && value.getTime() === condition.getTime();
    if (condition && typeof condition === "object") {
      const c = condition as Record<string, unknown>;
      if ("in" in c) return (c.in as unknown[]).includes(value);
      if ("notIn" in c) return !(c.notIn as unknown[]).includes(value);
      if ("lte" in c) return value instanceof Date && value.getTime() <= (c.lte as Date).getTime();
      if ("lt" in c) return value instanceof Date && value.getTime() < (c.lt as Date).getTime();
      throw new Error(`Condition non gérée par le double : ${key} ${JSON.stringify(condition)}`);
    }
    return value === condition;
  });
}

type OrderBy = Record<string, "asc" | "desc"> | Record<string, "asc" | "desc">[];

function sorted(rows: Row[], orderBy?: OrderBy): Row[] {
  const keys = (Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []).flatMap((o) => Object.entries(o));
  return [...rows].sort((a, b) => {
    for (const [key, direction] of keys) {
      const left = a[key] instanceof Date ? (a[key] as Date).getTime() : (a[key] as number | string | null);
      const right = b[key] instanceof Date ? (b[key] as Date).getTime() : (b[key] as number | string | null);
      if (left === right) continue;
      const order = (left ?? 0) < (right ?? 0) ? -1 : 1;
      return direction === "desc" ? -order : order;
    }
    return 0;
  });
}

function page(rows: Row[], args: { orderBy?: OrderBy; skip?: number; take?: number }): Row[] {
  const ordered = sorted(rows, args.orderBy).slice(args.skip ?? 0);
  return clone(args.take === undefined ? ordered : ordered.slice(0, args.take));
}

function groups(rows: Row[], by: string) {
  const counts = new Map<unknown, number>();
  for (const row of rows) counts.set(row[by], (counts.get(row[by]) ?? 0) + 1);
  return [...counts].map(([value, count]) => ({ [by]: value, _count: { _all: count } }));
}

function update(rows: Row[], where: Record<string, unknown>, data: Row): number {
  const targets = rows.filter((row) => matches(row, where));
  for (const row of targets) Object.assign(row, data, { updatedAt: stamp() });
  return targets.length;
}

export const prisma = {
  campaign: {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => clone(state.campaigns.find((c) => c.id === where.id) ?? null)),
    findMany: vi.fn(async (args: { where?: Record<string, unknown>; orderBy?: OrderBy; skip?: number; take?: number }) => page(state.campaigns.filter((c) => matches(c, args.where)), args)),
    count: vi.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => state.campaigns.filter((c) => matches(c, where)).length),
    groupBy: vi.fn(async ({ by, where }: { by: string[]; where?: Record<string, unknown> }) => groups(state.campaigns.filter((c) => matches(c, where)), by[0])),
    create: vi.fn(async ({ data }: { data: Row }) => {
      const now = stamp();
      const row: Row = {
        id: nextId("camp"),
        buttonLabel: null,
        buttonTarget: null,
        offerAmountCents: null,
        offerEndsAt: null,
        offerConditions: null,
        scheduledFor: null,
        startedAt: null,
        completedAt: null,
        canceledAt: null,
        recipientCount: 0,
        sentCount: 0,
        failedCount: 0,
        skippedCount: 0,
        simulated: false,
        alsoInApp: false,
        createdByAdminId: null,
        ...data,
        createdAt: now,
        updatedAt: now,
      };
      state.campaigns.push(row);
      return { id: row.id };
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Row }) => ({ count: update(state.campaigns, where, data) })),
    deleteMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const doomed = state.campaigns.filter((c) => matches(c, where));
      state.campaigns = state.campaigns.filter((c) => !doomed.includes(c));
      state.recipients = state.recipients.filter((r) => !doomed.some((c) => c.id === r.campaignId));
      return { count: doomed.length };
    }),
  },
  campaignRecipient: {
    findMany: vi.fn(async (args: { where?: Record<string, unknown>; orderBy?: OrderBy; skip?: number; take?: number }) => page(state.recipients.filter((r) => matches(r, args.where)), args)),
    count: vi.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => state.recipients.filter((r) => matches(r, where)).length),
    groupBy: vi.fn(async ({ by, where }: { by: string[]; where?: Record<string, unknown> }) => groups(state.recipients.filter((r) => matches(r, where)), by[0])),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Row }) => ({ count: update(state.recipients, where, data) })),
    // La clé unique (campagne, adresse) : un doublon est ignoré avec skipDuplicates, sinon P2002.
    createMany: vi.fn(async ({ data, skipDuplicates }: { data: Row[]; skipDuplicates?: boolean }) => {
      let count = 0;
      for (const item of data) {
        if (state.recipients.some((r) => r.campaignId === item.campaignId && r.emailKey === item.emailKey)) {
          if (skipDuplicates) continue;
          throw uniqueViolation("campaignId, emailKey");
        }
        const now = stamp();
        state.recipients.push({ detail: null, emailDispatchId: null, sentAt: null, status: "PENDING", ...item, id: nextId("cr"), createdAt: now, updatedAt: now });
        count += 1;
      }
      return { count };
    }),
  },
  marketingOptOut: {
    findMany: vi.fn(async ({ where }: { where?: Record<string, unknown> }) => clone(state.optOuts.filter((o) => matches(o, where)))),
    findUnique: vi.fn(async ({ where }: { where: { emailHash: string } }) => clone(state.optOuts.find((o) => o.emailHash === where.emailHash) ?? null)),
    create: vi.fn(async ({ data }: { data: Row }) => {
      if (state.optOuts.some((o) => o.emailHash === data.emailHash)) throw uniqueViolation("emailHash");
      const row = { emailMasked: null, campaignId: null, ...data, id: nextId("opt"), createdAt: stamp() };
      state.optOuts.push(row);
      return { id: row.id };
    }),
  },
  referralOffer: {
    findUnique: vi.fn(async ({ where }: { where: { campaignId: string } }) => clone(state.offers.find((o) => o.campaignId === where.campaignId) ?? null)),
  },
};

// ---------------------------------------------------------------- Doubles

type Recipient = { targetType: string; targetId: string; pharmacyId: string | null; partnerId: string | null; email: string; name: string | null };

export const audience = {
  recipients: [] as Recipient[],
  optedOut: [] as Recipient[],
  excluded: { optedOut: 0, noEmail: 0, duplicates: 0 },
};

export const provider = { capability: "LIVE" as "LIVE" | "SIMULATED" };

export type SentMessage = { to: string; subject: string; text: string; html: string; fromName?: string; headers?: Record<string, string> };
type Outcome = { status: "SENT" | "SIMULATED" | "FAILED"; provider: string; detail: string; messageId?: string | null };
type NotificationParams = { pharmacyId: string; type: string; severity?: string; title: string; body: string; linkUrl?: string | null; metadata?: Record<string, unknown> };

export const mocks = {
  recordAudit: vi.fn(async () => undefined),
  traceDispatch: vi.fn(async () => ({ id: "ed_1" })),
  createNotification: vi.fn<(params: NotificationParams) => Promise<void>>(async () => undefined),
  notifyAdmins: vi.fn(async () => undefined),
  startReferralOffer: vi.fn(async ({ campaignId }: { campaignId: string | null }) => ({ id: `offer_for_${campaignId}` })),
  endReferralOffer: vi.fn(async () => undefined),
  resolveAudience: vi.fn(async () => clone(audience)),
  recipientValues: vi.fn<(recipient: Recipient, options: { wantsReferralCode: boolean }) => Promise<Record<string, string>>>(async (recipient) => ({
    prenom: "Camille",
    titulaire: "Camille Martin",
    officine: recipient.name ?? "",
    contact: "Contact@pharmaboost.app",
    lien_espace: "https://pharmaboost.test/parametres?onglet=abonnement",
  })),
  sendEmail: vi.fn<(message: SentMessage) => Promise<Outcome>>(async (message) => ({
    status: provider.capability === "LIVE" ? "SENT" : "SIMULATED",
    provider: "test",
    detail: provider.capability === "LIVE" ? "Remis au prestataire." : "Messagerie non configurée : message simulé.",
    messageId: `msg_${message.to}`,
  })),
  platformEmailContext: vi.fn(async () => ({ baseUrl: "https://pharmaboost.test", logoUrl: "https://pharmaboost.test/logo.png", company: { legalName: "PharmaBoost SAS", address: "10 rue de la Santé, 75013 Paris", siren: "123456789", contactEmail: "contact@pharmaboost.app" } })),
};

export const messagingProvider = () => ({ info: { id: "test", label: "Test", capability: provider.capability, description: "double de test" }, sendEmail: mocks.sendEmail });

export const publicUrl = (path: string) => `https://pharmaboost.test${path.startsWith("/") ? path : `/${path}`}`;

// ---------------------------------------------------------------- Aides

export function reset() {
  vi.resetAllMocks();
  state.campaigns = [];
  state.recipients = [];
  state.optOuts = [];
  state.offers = [];
  state.tick = 0;
  state.ids = 0;
  audience.recipients = [];
  audience.optedOut = [];
  audience.excluded = { optedOut: 0, noEmail: 0, duplicates: 0 };
  provider.capability = "LIVE";
}

/** Une campagne en brouillon, valide : une annonce aux officines. */
export function seedCampaign(overrides: Row = {}): string {
  const now = stamp();
  const row: Row = {
    id: nextId("camp"),
    kind: "ANNOUNCEMENT",
    name: "Annonce d'octobre",
    status: "DRAFT",
    subject: "Une information de l'équipe PharmaBoost",
    title: "Une information pour {{officine}}",
    body: "Bonjour {{prenom}},\n\nUne information pour {{officine}}.",
    buttonLabel: "Ouvrir mon espace",
    buttonTarget: "espace",
    audience: "pharmacies.all_active",
    audienceParams: {},
    alsoInApp: false,
    offerAmountCents: null,
    offerEndsAt: null,
    offerConditions: null,
    scheduledFor: null,
    startedAt: null,
    completedAt: null,
    canceledAt: null,
    recipientCount: 0,
    sentCount: 0,
    failedCount: 0,
    skippedCount: 0,
    simulated: false,
    createdByAdminId: "adm_1",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
  state.campaigns.push(row);
  return row.id as string;
}

/** Une offre de parrainage de 20 € par filleul et par mois, jusqu'au 31 octobre. */
export function seedReferral(overrides: Row = {}): string {
  return seedCampaign({
    kind: "REFERRAL_OFFER",
    name: "Parrainage d'automne",
    subject: "Parrainage : {{montant_offre}} par filleul et par mois",
    title: "Parrainez, {{montant_offre}} par mois",
    body: "Bonjour {{prenom}},\n\nChaque filleul vous rapporte {{montant_offre}} par mois.\n\nVotre code : {{code_parrainage}}",
    buttonLabel: "Voir mon code",
    buttonTarget: "parrainage",
    offerAmountCents: 2000,
    offerEndsAt: new Date("2026-10-31T22:59:59.999Z"),
    ...overrides,
  });
}

export const recipientsOf = (count: number, from = 1): Recipient[] =>
  Array.from({ length: count }, (_, i) => ({ targetType: "PHARMACY", targetId: `ph_${from + i}`, pharmacyId: `ph_${from + i}`, partnerId: null, email: `titulaire${from + i}@officine.fr`, name: `Pharmacie ${from + i}` }));

export function setAudience(recipients: Recipient[], optedOut: Recipient[] = []) {
  audience.recipients = recipients;
  audience.optedOut = optedOut;
  audience.excluded = { optedOut: optedOut.length, noEmail: 0, duplicates: 0 };
}

/** Un destinataire déjà figé, dans l'état voulu. */
export function seedRecipient(campaignId: string, email: string, status: string, extra: Row = {}) {
  const now = stamp();
  state.recipients.push({ id: nextId("cr"), campaignId, targetType: "PHARMACY", targetId: `ph_${email}`, pharmacyId: `ph_${email}`, partnerId: null, emailKey: email, email, name: `Pharmacie ${email}`, status, detail: null, emailDispatchId: null, sentAt: null, createdAt: now, updatedAt: now, ...extra });
}

export const campaignRow = (id: string) => state.campaigns.find((c) => c.id === id) as Row;
export const recipientRows = (id: string) => state.recipients.filter((r) => r.campaignId === id);
export const statusCounts = (id: string) => recipientRows(id).reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.status as string]: (acc[r.status as string] ?? 0) + 1 }), {});
/** Les adresses auxquelles un message est parti, dans l'ordre. */
export const sentTo = () => mocks.sendEmail.mock.calls.map((call) => call[0].to);
export const auditActions = () => (mocks.recordAudit.mock.calls as unknown as [{ action: string; metadata?: Record<string, unknown> }][]).map(([call]) => call);
