import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Les nouveautés pour les patients, sans base ni réseau : un Prisma en mémoire
 * qui respecte les clés uniques (P2002), et un fournisseur de messagerie
 * simulé. Le chiffrement et les jetons sont les vrais.
 */

type Row = Record<string, unknown>;

const provider = vi.hoisted(() => ({ capability: "LIVE" as string, sendEmail: vi.fn() }));
const audit = vi.hoisted(() => ({ recordAudit: vi.fn() }));

const db = vi.hoisted(() => {
  type R = Record<string, unknown>;
  const state = {
    pharmacies: [] as R[],
    subs: [] as R[],
    announcements: [] as R[],
    deliveries: [] as R[],
    ranges: [] as R[],
    counters: {} as Record<string, number>,
    writes: [] as string[],
    log: [] as string[],
    /** Appelé juste après l'inscription d'une réservation : permet de simuler une course. */
    afterDeliveryCreate: null as ((row: R) => void) | null,
    /** Une panne de base pour les réservations d'une annonce donnée. */
    failDeliveriesOf: null as string | null,
  };

  const num = (value: unknown): number => (value instanceof Date ? value.getTime() : (value as number));

  function matchesValue(actual: unknown, condition: unknown): boolean {
    if (condition !== null && typeof condition === "object" && !(condition instanceof Date)) {
      return Object.entries(condition as R).every(([operator, expected]) => {
        switch (operator) {
          case "not": return num(actual) !== num(expected);
          case "lt": return num(actual) < num(expected);
          case "lte": return num(actual) <= num(expected);
          case "gt": return num(actual) > num(expected);
          case "gte": return num(actual) >= num(expected);
          case "in": return (expected as unknown[]).includes(actual);
          default: throw new Error(`opérateur non géré par le faux Prisma : ${operator}`);
        }
      });
    }
    return num(actual) === num(condition);
  }

  function matches(row: R, where: R = {}): boolean {
    return Object.entries(where).every(([key, condition]) => {
      if (key === "deliveries") {
        const none = (condition as { none: R }).none;
        return !state.deliveries.some((delivery) => delivery.subscriptionId === row.id && matches(delivery, none));
      }
      if (key === "pharmacyId_emailHash") {
        const pair = condition as { pharmacyId: string; emailHash: string };
        return row.pharmacyId === pair.pharmacyId && row.emailHash === pair.emailHash;
      }
      return matchesValue(row[key], condition);
    });
  }

  function sorted(rows: R[], orderBy: R | R[] | undefined): R[] {
    const keys = ([] as R[]).concat(orderBy ?? []).flatMap((order) => Object.entries(order) as [string, string][]);
    return [...rows].sort((a, b) => {
      for (const [key, direction] of keys) {
        const x = num(a[key]);
        const y = num(b[key]);
        if (x < y) return direction === "asc" ? -1 : 1;
        if (x > y) return direction === "asc" ? 1 : -1;
      }
      return 0;
    });
  }

  function view(row: R, select?: R): R {
    const full: R = { ...row };
    if (row.emailHash !== undefined && row.pharmacyId !== undefined) full.pharmacy = { name: state.pharmacies.find((p) => p.id === row.pharmacyId)?.name };
    if (!select) return full;
    return Object.fromEntries(Object.keys(select).filter((key) => select[key]).map((key) => [key, full[key]]));
  }

  function model(name: string, rows: () => R[], options: { prefix: string; defaults: (data: R) => R; duplicate?: (a: R, b: R) => boolean; replace?: (next: R[]) => void }) {
    return {
      create: vi.fn(async ({ data, select }: { data: R; select?: R }) => {
        state.writes.push(`${name}.create`);
        const row: R = { ...options.defaults(data), ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) };
        if (options.duplicate && rows().some((existing) => options.duplicate!(existing, row))) {
          throw Object.assign(new Error("Unique constraint failed on the fields"), { code: "P2002" });
        }
        state.counters[name] = (state.counters[name] ?? 0) + 1;
        row.id ??= `${options.prefix}_${String(state.counters[name]).padStart(3, "0")}`;
        rows().push(row);
        return view(row, select);
      }),
      findUnique: vi.fn(async ({ where, select }: { where: R; select?: R }) => {
        const row = rows().find((candidate) => matches(candidate, where));
        return row ? view(row, select) : null;
      }),
      findFirst: vi.fn(async ({ where, orderBy, select }: { where?: R; orderBy?: R | R[]; select?: R }) => {
        const row = sorted(rows().filter((candidate) => matches(candidate, where)), orderBy)[0];
        return row ? view(row, select) : null;
      }),
      findMany: vi.fn(async ({ where, orderBy, take, select }: { where?: R; orderBy?: R | R[]; take?: number; select?: R } = {}) =>
        sorted(rows().filter((candidate) => matches(candidate, where)), orderBy).slice(0, take).map((row) => view(row, select)),
      ),
      count: vi.fn(async ({ where }: { where?: R } = {}) => rows().filter((candidate) => matches(candidate, where)).length),
      update: vi.fn(async ({ where, data }: { where: R; data: R }) => {
        state.writes.push(`${name}.update`);
        const row = rows().find((candidate) => matches(candidate, where));
        if (!row) throw new Error("enregistrement introuvable");
        Object.assign(row, data);
        return { ...row };
      }),
      updateMany: vi.fn(async ({ where, data }: { where?: R; data: R }) => {
        const hit = rows().filter((candidate) => matches(candidate, where));
        if (hit.length > 0) state.writes.push(`${name}.updateMany`);
        for (const row of hit) Object.assign(row, data);
        return { count: hit.length };
      }),
      deleteMany: vi.fn(async ({ where }: { where?: R } = {}) => {
        const hit = rows().filter((candidate) => matches(candidate, where));
        if (hit.length > 0) state.writes.push(`${name}.deleteMany`);
        options.replace?.(rows().filter((row) => !hit.includes(row)));
        return { count: hit.length };
      }),
    };
  }

  const subscription = model("subscription", () => state.subs, {
    prefix: "sub",
    defaults: () => ({ status: "ACTIVE", consentSource: "PLAN_EMAIL", noticeVersion: "v1", unsubscribedAt: null, lastNewsAt: null, emailCipher: null, emailMasked: null, createdAt: new Date() }),
    duplicate: (a, b) => a.pharmacyId === b.pharmacyId && a.emailHash === b.emailHash,
    replace: (next) => { state.subs = next; },
  });

  const baseDelivery = model("delivery", () => state.deliveries, {
    prefix: "del",
    defaults: () => ({ status: "CLAIMED", detail: null, createdAt: new Date() }),
    duplicate: (a, b) => a.announcementId === b.announcementId && a.subscriptionId === b.subscriptionId,
  });
  const delivery = {
    ...baseDelivery,
    create: vi.fn(async (args: { data: R; select?: R }) => {
      if (state.failDeliveriesOf === args.data.announcementId) throw new Error("panne de base de données");
      state.log.push(`réserve:${String(args.data.subscriptionId)}`);
      const created = await baseDelivery.create(args);
      // La ligne telle qu'elle est stockée, pas la projection rendue à l'appelant.
      state.afterDeliveryCreate?.(state.deliveries.find((row) => row.id === created.id)!);
      return created;
    }),
    groupBy: vi.fn(async ({ where }: { where: R }) => {
      const groups = new Map<string, number>();
      for (const row of state.deliveries.filter((candidate) => matches(candidate, where))) groups.set(row.status as string, (groups.get(row.status as string) ?? 0) + 1);
      return [...groups].map(([status, count]) => ({ status, _count: { _all: count } }));
    }),
  };

  const announcement = model("announcement", () => state.announcements, {
    prefix: "ann",
    defaults: () => ({ status: "SENDING", recipientCount: 0, sentCount: 0, failedCount: 0, simulated: false, createdByUserId: null, createdAt: new Date(), completedAt: null }),
    replace: (next) => { state.announcements = next; },
  });

  const prisma = {
    pharmacy: {
      findUnique: vi.fn(async ({ where, select }: { where: R; select?: R }) => {
        const row = state.pharmacies.find((candidate) => matches(candidate, where));
        return row ? view(row, select) : null;
      }),
      updateMany: vi.fn(async ({ where, data }: { where?: R; data: R }) => {
        const hit = state.pharmacies.filter((candidate) => matches(candidate, where));
        if (hit.length > 0) state.writes.push("pharmacy.updateMany");
        for (const row of hit) Object.assign(row, data);
        return { count: hit.length };
      }),
    },
    patientNewsSubscription: subscription,
    patientNewsDelivery: delivery,
    patientNewsAnnouncement: announcement,
    preferredRange: { findMany: vi.fn(async ({ where, orderBy, take, select }: { where?: R; orderBy?: R | R[]; take?: number; select?: R }) => sorted(state.ranges.filter((candidate) => matches(candidate, where)), orderBy).slice(0, take).map((row) => view(row, select))) },
  };

  return { state, prisma };
});

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: db.prisma }));
vi.mock("@/server/audit/log", () => audit);
vi.mock("@/server/ai/registry", () => ({ getMessagingProvider: () => ({ info: { capability: provider.capability }, sendEmail: provider.sendEmail }) }));
vi.mock("@/server/public-url", () => ({ publicUrl: (path: string) => `https://pharma.example${path}` }));
vi.mock("@/config/env", () => ({ getEnv: () => ({ AUTH_SESSION_SECRET: "secret-de-session-pour-les-tests-0123456789", DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") }) }));

const svc = await import("../patient-news");
const { hashEmail, openToken, sealToken, signPayload } = await import("@/server/security/tokens");
const { decryptField, encryptField } = await import("@/server/security/encryption");

const NOW = new Date("2026-10-14T10:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const MARIE = "marie.dupont@example.org";

const PHARMACY_A = { id: "ph_a", name: "Pharmacie Saint-Michel", phone: "01 23 45 67 89", brandColor: "#0F766E", isActive: true, patientNewsEnabled: true };
const PHARMACY_B = { id: "ph_b", name: "Pharmacie du Port", phone: null, brandColor: "#1D4ED8", isActive: true, patientNewsEnabled: true };
const SCOPE_A = { pharmacyId: "ph_a", organizationId: "org_1", userId: "user_a" };
const SCOPE_B = { pharmacyId: "ph_b", organizationId: "org_2", userId: "user_b" };
const ANNOUNCEMENT = { title: "Une nouvelle gamme est arrivée", rangeLabel: "Gamme Solaire", message: "Découvrez notre nouvelle gamme de soins solaires." };

let subCounter = 0;

/** Un abonné tel que l'application le conserve : empreinte, adresse chiffrée, forme masquée. */
function subscriber(pharmacyId: string, email: string, overrides: Row = {}): Row {
  subCounter += 1;
  const row: Row = {
    id: `sub_${String(subCounter).padStart(3, "0")}`,
    pharmacyId,
    emailHash: hashEmail(email),
    emailCipher: encryptField(email),
    emailMasked: `${email[0]}***@${email.split("@")[1]}`,
    status: "ACTIVE",
    consentSource: "PLAN_EMAIL",
    consentAt: new Date(NOW.getTime() - 30 * DAY),
    noticeVersion: "v1",
    unsubscribedAt: null,
    lastNewsAt: null,
    createdAt: new Date(NOW.getTime() - 30 * DAY),
    ...overrides,
  };
  db.state.subs.push(row);
  return row;
}

const addressOf = (n: number, domain = "example.org") => `patient${n}@${domain}`;

function seedSubscribers(pharmacyId: string, count: number, domain = "example.org"): Row[] {
  return Array.from({ length: count }, (_, index) => subscriber(pharmacyId, addressOf(index + 1, domain)));
}

function announcementRow(overrides: Row = {}): Row {
  const row: Row = { id: `ann_seed_${db.state.announcements.length + 1}`, pharmacyId: "ph_a", ...ANNOUNCEMENT, status: "SENT", recipientCount: 3, sentCount: 3, failedCount: 0, simulated: false, createdByUserId: "user_a", createdAt: new Date(NOW.getTime() - 20 * DAY), completedAt: null, ...overrides };
  db.state.announcements.push(row);
  return row;
}

const sentTo = (): string[] => provider.sendEmail.mock.calls.map(([message]) => (message as { to: string }).to);
const sentMessages = () => provider.sendEmail.mock.calls.map(([message]) => message as { to: string; fromName: string; subject: string; text: string; html: string; headers?: Record<string, string> });
const auditActions = (): string[] => audit.recordAudit.mock.calls.map(([entry]) => (entry as { action: string }).action);
const optInToken = (pharmacyId: string, email: string, ttl = 90 * DAY) => sealToken("news-optin", { p: pharmacyId, e: email }, ttl);
const unsubscribeTokenIn = (text: string): string => /nouveautes\/desinscription\/(\S+)/.exec(text)![1];
const noWrites = () => expect(db.state.writes).toEqual([]);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  subCounter = 0;
  Object.assign(db.state, { pharmacies: [{ ...PHARMACY_A }, { ...PHARMACY_B }], subs: [], announcements: [], deliveries: [], ranges: [], counters: {}, writes: [], log: [], afterDeliveryCreate: null, failDeliveriesOf: null });
  vi.clearAllMocks();
  provider.capability = "LIVE";
  provider.sendEmail.mockReset();
  provider.sendEmail.mockImplementation(async (message: { to: string }) => {
    db.state.log.push(`envoie:${message.to}`);
    return { status: "SENT", provider: "test", detail: "Remis au prestataire." };
  });
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------

describe("le lien d'abonnement de l'e-mail du plan", () => {
  it("porte l'adresse dans un jeton chiffré : elle n'apparaît nulle part dans le lien, et rien n'est écrit", async () => {
    const url = await svc.newsOptInUrlFor("ph_a", MARIE);
    expect(url).toMatch(/^https:\/\/pharma\.example\/nouveautes\/abonnement\/[A-Za-z0-9_-]+$/);
    const token = url!.split("/").pop()!;
    expect(openToken("news-optin", token)).toMatchObject({ p: "ph_a", e: MARIE });
    for (const form of [MARIE, encodeURIComponent(MARIE), Buffer.from(MARIE).toString("base64"), Buffer.from(MARIE).toString("base64url"), "dupont"]) {
      expect(url).not.toContain(form);
    }
    noWrites();
  });

  it("est valable 90 jours, comme le plan", async () => {
    const token = (await svc.newsOptInUrlFor("ph_a", MARIE))!.split("/").pop()!;
    vi.setSystemTime(new Date(NOW.getTime() + 89 * DAY));
    expect(openToken("news-optin", token)).not.toBeNull();
    vi.setSystemTime(new Date(NOW.getTime() + 91 * DAY));
    expect(openToken("news-optin", token)).toBeNull();
  });

  it("n'existe pas quand l'officine a coupé la fonction, est désactivée ou inconnue : le plan part sans le bloc", async () => {
    db.state.pharmacies[0].patientNewsEnabled = false;
    expect(await svc.newsOptInUrlFor("ph_a", MARIE)).toBeNull();
    db.state.pharmacies[0].patientNewsEnabled = true;
    db.state.pharmacies[0].isActive = false;
    expect(await svc.newsOptInUrlFor("ph_a", MARIE)).toBeNull();
    expect(await svc.newsOptInUrlFor("ph_inconnue", MARIE)).toBeNull();
  });

  it("n'existe pas pour une adresse qui n'en est pas une", async () => {
    for (const address of ["", "pas-une-adresse", "a@b", "a b@c.fr", `${"x".repeat(250)}@example.org`]) expect(await svc.newsOptInUrlFor("ph_a", address)).toBeNull();
  });
});

describe("peekNewsOptIn : la page s'affiche sans rien écrire", () => {
  it("donne le nom et la couleur de l'officine ; aucune écriture, aucun e-mail, aucun audit", async () => {
    const state = await svc.peekNewsOptIn(optInToken("ph_a", MARIE));
    expect(state).toEqual({ pharmacyName: "Pharmacie Saint-Michel", brandColor: "#0F766E", alreadySubscribed: false });
    noWrites();
    expect(db.state.subs).toEqual([]);
    expect(provider.sendEmail).not.toHaveBeenCalled();
    expect(audit.recordAudit).not.toHaveBeenCalled();
  });

  it("dit si l'adresse est déjà abonnée (et seulement active), sans l'écrire", async () => {
    subscriber("ph_a", MARIE);
    expect(await svc.peekNewsOptIn(optInToken("ph_a", MARIE))).toMatchObject({ alreadySubscribed: true });
    db.state.subs[0].status = "UNSUBSCRIBED";
    expect(await svc.peekNewsOptIn(optInToken("ph_a", MARIE))).toMatchObject({ alreadySubscribed: false });
    noWrites();
  });

  it("refuse un jeton expiré, falsifié, d'un autre usage, incomplet ou démesuré", async () => {
    const good = optInToken("ph_a", MARIE);
    const tampered = `${good.slice(0, 40)}${good[40] === "A" ? "B" : "A"}${good.slice(41)}`;
    const refused = [
      "n'importe quoi",
      "",
      optInToken("ph_a", MARIE, -1000),
      tampered,
      sealToken("autre-usage", { p: "ph_a", e: MARIE }, DAY),
      sealToken("news-optin", { p: "ph_a" }, DAY),
      sealToken("news-optin", { e: MARIE }, DAY),
      sealToken("news-optin", { p: "ph_a", e: "pas-une-adresse" }, DAY),
      sealToken("news-optin", { p: 12, e: MARIE }, DAY),
      "a".repeat(5000),
    ];
    for (const token of refused) expect(await svc.peekNewsOptIn(token)).toBeNull();
    expect(await svc.peekNewsOptIn(good)).not.toBeNull();
    noWrites();
  });

  it("refuse quand l'officine n'existe plus, est désactivée ou a coupé la fonction", async () => {
    const token = optInToken("ph_a", MARIE);
    db.state.pharmacies[0].patientNewsEnabled = false;
    expect(await svc.peekNewsOptIn(token)).toBeNull();
    db.state.pharmacies[0].patientNewsEnabled = true;
    db.state.pharmacies[0].isActive = false;
    expect(await svc.peekNewsOptIn(token)).toBeNull();
    expect(await svc.peekNewsOptIn(optInToken("ph_inconnue", MARIE))).toBeNull();
  });
});

describe("confirmNewsOptIn : le geste du patient", () => {
  it("enregistre l'abonnement : empreinte, adresse chiffrée, forme masquée, date et version du texte", async () => {
    const result = await svc.confirmNewsOptIn(optInToken("ph_a", MARIE));
    expect(result).toEqual({ ok: true, pharmacyName: "Pharmacie Saint-Michel", welcomeSent: true });
    expect(db.state.subs).toHaveLength(1);
    const row = db.state.subs[0];
    expect(row).toMatchObject({ pharmacyId: "ph_a", emailHash: hashEmail(MARIE), emailMasked: "m***@example.org", status: "ACTIVE", consentSource: "PLAN_EMAIL", consentAt: NOW, noticeVersion: "v1" });
    expect(decryptField(row.emailCipher as string)).toBe(MARIE);
    expect(row.emailCipher).not.toContain(MARIE);
  });

  it("ne rattache l'adresse à rien : ni ordonnance, ni plan, ni produit, ni nom", async () => {
    await svc.confirmNewsOptIn(optInToken("ph_a", MARIE));
    expect(Object.keys(db.state.subs[0]).sort()).toEqual(["consentAt", "consentSource", "createdAt", "emailCipher", "emailHash", "emailMasked", "id", "lastNewsAt", "noticeVersion", "pharmacyId", "status", "unsubscribedAt"]);
  });

  it("l'audit ne porte aucune adresse, pas même masquée", async () => {
    await svc.confirmNewsOptIn(optInToken("ph_a", MARIE));
    expect(audit.recordAudit).toHaveBeenCalledTimes(1);
    expect(audit.recordAudit.mock.calls[0][0]).toMatchObject({ action: "patient_news.subscribed", pharmacyId: "ph_a", metadata: { source: "PLAN_EMAIL", reactivated: false, noticeVersion: "v1" } });
    const journal = JSON.stringify(audit.recordAudit.mock.calls);
    expect(journal).not.toContain("marie");
    expect(journal).not.toContain("example.org");
    expect(journal).not.toContain("***");
  });

  it("envoie un message de bienvenue au nom de la pharmacie, avec le moyen de se désinscrire", async () => {
    await svc.confirmNewsOptIn(optInToken("ph_a", MARIE));
    const [welcome] = sentMessages();
    expect(welcome).toMatchObject({ to: MARIE, fromName: "Pharmacie Saint-Michel", subject: "Vous serez prévenu(e) des nouveautés — Pharmacie Saint-Michel" });
    expect(welcome.text).toContain("votre accord est enregistré");
    expect(welcome.headers).toEqual({ "List-Unsubscribe": expect.stringMatching(/^<https:\/\/pharma\.example\/nouveautes\/desinscription\/.+>$/) });
    expect(`${welcome.text}${welcome.html}`).not.toMatch(/pharmaboost/i);
  });

  it("est idempotent : un lien rouvert ne crée rien de plus et n'envoie pas un second message", async () => {
    const token = optInToken("ph_a", MARIE);
    await svc.confirmNewsOptIn(token);
    const second = await svc.confirmNewsOptIn(token);
    expect(second).toEqual({ ok: true, pharmacyName: "Pharmacie Saint-Michel", welcomeSent: false });
    expect(db.state.subs).toHaveLength(1);
    expect(provider.sendEmail).toHaveBeenCalledTimes(1);
    expect(auditActions()).toEqual(["patient_news.subscribed"]);
  });

  it("double clic simultané : une seule ligne, un seul message de bienvenue (la clé unique départage)", async () => {
    const token = optInToken("ph_a", MARIE);
    const [first, second] = await Promise.all([svc.confirmNewsOptIn(token), svc.confirmNewsOptIn(token)]);
    expect(first.ok && second.ok).toBe(true);
    expect(db.state.subs).toHaveLength(1);
    expect(provider.sendEmail).toHaveBeenCalledTimes(1);
    expect(auditActions()).toEqual(["patient_news.subscribed"]);
    expect([first, second].filter((result) => result.ok && result.welcomeSent)).toHaveLength(1);
  });

  it("la casse de l'adresse ne crée pas un second abonné", async () => {
    await svc.confirmNewsOptIn(optInToken("ph_a", "Marie.Dupont@Example.org"));
    await svc.confirmNewsOptIn(optInToken("ph_a", MARIE));
    expect(db.state.subs).toHaveLength(1);
  });

  it("un désinscrit qui reclique est réactivé, avec un nouveau consentement", async () => {
    subscriber("ph_a", MARIE, { status: "UNSUBSCRIBED", emailCipher: null, emailMasked: null, unsubscribedAt: new Date(NOW.getTime() - 5 * DAY), consentAt: new Date(NOW.getTime() - 400 * DAY) });
    const result = await svc.confirmNewsOptIn(optInToken("ph_a", MARIE));
    expect(result).toMatchObject({ ok: true, welcomeSent: true });
    expect(db.state.subs).toHaveLength(1);
    const row = db.state.subs[0];
    expect(row).toMatchObject({ status: "ACTIVE", consentAt: NOW, unsubscribedAt: null, emailMasked: "m***@example.org" });
    expect(decryptField(row.emailCipher as string)).toBe(MARIE);
    expect(audit.recordAudit.mock.calls[0][0]).toMatchObject({ action: "patient_news.subscribed", metadata: { reactivated: true } });
  });

  it("un abonné déjà actif ne voit pas sa date de consentement changer", async () => {
    subscriber("ph_a", MARIE, { consentAt: new Date(NOW.getTime() - 100 * DAY) });
    await svc.confirmNewsOptIn(optInToken("ph_a", MARIE));
    expect(db.state.subs[0].consentAt).toEqual(new Date(NOW.getTime() - 100 * DAY));
  });

  it("l'échec du message de bienvenue n'annule pas l'abonnement", async () => {
    provider.sendEmail.mockRejectedValueOnce(new Error("messagerie en panne"));
    const refused = await svc.confirmNewsOptIn(optInToken("ph_a", MARIE));
    expect(refused).toEqual({ ok: true, pharmacyName: "Pharmacie Saint-Michel", welcomeSent: false });
    expect(db.state.subs).toHaveLength(1);

    db.state.subs.length = 0;
    provider.sendEmail.mockResolvedValueOnce({ status: "FAILED", provider: "test", detail: "refusé" });
    expect(await svc.confirmNewsOptIn(optInToken("ph_a", MARIE))).toMatchObject({ ok: true, welcomeSent: false });
    expect(db.state.subs).toHaveLength(1);
  });

  it("un envoi simulé n'est pas présenté comme un message de bienvenue envoyé", async () => {
    provider.sendEmail.mockResolvedValueOnce({ status: "SIMULATED", provider: "none", detail: "non configuré" });
    expect(await svc.confirmNewsOptIn(optInToken("ph_a", MARIE))).toMatchObject({ ok: true, welcomeSent: false });
    expect(db.state.subs).toHaveLength(1);
  });

  it("refuse, sans rien écrire, un jeton invalide ou une officine qui a coupé la fonction — avec un message clair, sans détail technique", async () => {
    const results = [
      await svc.confirmNewsOptIn("n'importe quoi"),
      await svc.confirmNewsOptIn(optInToken("ph_a", MARIE, -1000)),
      await svc.confirmNewsOptIn(sealToken("autre-usage", { p: "ph_a", e: MARIE }, DAY)),
      await svc.confirmNewsOptIn(optInToken("ph_inconnue", MARIE)),
    ];
    db.state.pharmacies[0].patientNewsEnabled = false;
    results.push(await svc.confirmNewsOptIn(optInToken("ph_a", MARIE)));
    db.state.pharmacies[0].patientNewsEnabled = true;
    db.state.pharmacies[0].isActive = false;
    results.push(await svc.confirmNewsOptIn(optInToken("ph_a", MARIE)));

    for (const result of results) {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).not.toMatch(/token|jeton|prisma|P2002|undefined|exception|error|null/i);
    }
    expect(db.state.subs).toEqual([]);
    expect(provider.sendEmail).not.toHaveBeenCalled();
    expect(audit.recordAudit).not.toHaveBeenCalled();
  });

  it("un jeton d'une autre officine ne peut abonner qu'à celle-là", async () => {
    await svc.confirmNewsOptIn(optInToken("ph_b", MARIE));
    expect(db.state.subs.map((row) => row.pharmacyId)).toEqual(["ph_b"]);
    expect(sentMessages()[0].fromName).toBe("Pharmacie du Port");
  });

  it("une erreur de base autre qu'un doublon remonte : on ne prétend pas avoir enregistré", async () => {
    db.prisma.patientNewsSubscription.create.mockRejectedValueOnce(new Error("connexion perdue"));
    await expect(svc.confirmNewsOptIn(optInToken("ph_a", MARIE))).rejects.toThrow("connexion perdue");
    expect(provider.sendEmail).not.toHaveBeenCalled();
  });
});

describe("la désinscription", () => {
  /** Abonne MARIE par le vrai parcours et rend le jeton de désinscription du message de bienvenue. */
  async function subscribed(): Promise<string> {
    await svc.confirmNewsOptIn(optInToken("ph_a", MARIE));
    const token = unsubscribeTokenIn(sentMessages()[0].text);
    provider.sendEmail.mockClear();
    audit.recordAudit.mockClear();
    db.state.writes.length = 0;
    return token;
  }

  it("la page s'affiche sans rien écrire", async () => {
    const token = await subscribed();
    expect(await svc.peekNewsUnsubscribe(token)).toEqual({ pharmacyName: "Pharmacie Saint-Michel", alreadyUnsubscribed: false });
    noWrites();
    expect(db.state.subs[0].status).toBe("ACTIVE");
  });

  it("efface l'adresse chiffrée et la forme masquée ; garde l'empreinte, le statut et les dates", async () => {
    const token = await subscribed();
    const before = { ...db.state.subs[0] };
    expect(await svc.confirmNewsUnsubscribe(token)).toEqual({ ok: true, pharmacyName: "Pharmacie Saint-Michel" });
    const row = db.state.subs[0];
    expect(row).toMatchObject({ status: "UNSUBSCRIBED", emailCipher: null, emailMasked: null, unsubscribedAt: NOW, emailHash: before.emailHash, consentAt: before.consentAt, pharmacyId: "ph_a" });
    expect(JSON.stringify(db.state.subs)).not.toContain("marie");
  });

  it("est idempotent et sûr sous double clic : un seul effacement, un seul audit", async () => {
    const token = await subscribed();
    await Promise.all([svc.confirmNewsUnsubscribe(token), svc.confirmNewsUnsubscribe(token)]);
    expect(await svc.confirmNewsUnsubscribe(token)).toMatchObject({ ok: true });
    expect(auditActions()).toEqual(["patient_news.unsubscribed"]);
    expect(JSON.stringify(audit.recordAudit.mock.calls)).not.toMatch(/marie|example\.org|\*\*\*/);
    expect(await svc.peekNewsUnsubscribe(token)).toMatchObject({ alreadyUnsubscribed: true });
  });

  it("n'est plus abonné ensuite : la page d'abonnement le sait", async () => {
    const token = await subscribed();
    await svc.confirmNewsUnsubscribe(token);
    expect(await svc.peekNewsOptIn(optInToken("ph_a", MARIE))).toMatchObject({ alreadySubscribed: false });
  });

  it("reste possible quand l'officine a coupé la fonction ou est désactivée : un patient doit toujours pouvoir partir", async () => {
    const token = await subscribed();
    db.state.pharmacies[0].patientNewsEnabled = false;
    db.state.pharmacies[0].isActive = false;
    expect(await svc.peekNewsUnsubscribe(token)).not.toBeNull();
    expect(await svc.confirmNewsUnsubscribe(token)).toMatchObject({ ok: true });
    expect(db.state.subs[0].status).toBe("UNSUBSCRIBED");
  });

  it("refuse un jeton falsifié, expiré, d'un autre usage ou d'un abonné inconnu", async () => {
    const good = await subscribed();
    const tampered = `${good.slice(0, 10)}${good[10] === "a" ? "b" : "a"}${good.slice(11)}`;
    const refused = [
      "n'importe quoi",
      tampered,
      signPayload({ p: "ph_a", h: hashEmail(MARIE), t: "news-unsubscribe" }, -1000),
      signPayload({ p: "ph_a", h: hashEmail(MARIE), t: "offers-optout" }, DAY),
      signPayload({ p: "ph_a", h: hashEmail(MARIE) }, DAY),
      signPayload({ p: "ph_a", h: hashEmail("inconnu@example.org"), t: "news-unsubscribe" }, DAY),
      signPayload({ p: "ph_b", h: hashEmail(MARIE), t: "news-unsubscribe" }, DAY),
      optInToken("ph_a", MARIE),
      "a".repeat(5000),
    ];
    for (const token of refused) {
      expect(await svc.peekNewsUnsubscribe(token)).toBeNull();
      const result = await svc.confirmNewsUnsubscribe(token);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).not.toMatch(/token|jeton|prisma|undefined|error/i);
    }
    noWrites();
    expect(db.state.subs[0].status).toBe("ACTIVE");
    expect(await svc.confirmNewsUnsubscribe(good)).toMatchObject({ ok: true });
  });

  it("le lien d'un abonné ne touche pas à l'abonné d'une autre officine ayant la même adresse", async () => {
    await svc.confirmNewsOptIn(optInToken("ph_a", MARIE));
    const token = unsubscribeTokenIn(sentMessages()[0].text);
    await svc.confirmNewsOptIn(optInToken("ph_b", MARIE));
    await svc.confirmNewsUnsubscribe(token);
    expect(db.state.subs.map((row) => [row.pharmacyId, row.status])).toEqual([["ph_a", "UNSUBSCRIBED"], ["ph_b", "ACTIVE"]]);
  });
});

describe("sendAnnouncement : les règles avant tout envoi", () => {
  beforeEach(() => {
    seedSubscribers("ph_a", 3);
    seedSubscribers("ph_b", 2, "autre.org");
  });

  it("refuse un nombre d'abonnés confirmé qui n'est pas le vrai : rien n'est créé, rien ne part", async () => {
    const result = await svc.sendAnnouncement(SCOPE_A, ANNOUNCEMENT, 5);
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error).toContain("3 au lieu de 5");
    expect(db.state.announcements).toEqual([]);
    expect(provider.sendEmail).not.toHaveBeenCalled();
  });

  it("le nombre confirmé se compare aux abonnés ACTIFS de l'officine de la session, pas à ceux des autres", async () => {
    subscriber("ph_a", "parti@example.org", { status: "UNSUBSCRIBED", emailCipher: null, emailMasked: null });
    expect((await svc.sendAnnouncement(SCOPE_A, ANNOUNCEMENT, 5)).ok).toBe(false);
    expect((await svc.sendAnnouncement(SCOPE_A, ANNOUNCEMENT, 4)).ok).toBe(false);
    expect((await svc.sendAnnouncement(SCOPE_A, ANNOUNCEMENT, 3)).ok).toBe(true);
  });

  it("refuse quand personne n'est abonné", async () => {
    db.state.subs = db.state.subs.filter((row) => row.pharmacyId === "ph_b");
    expect(await svc.sendAnnouncement(SCOPE_A, ANNOUNCEMENT, 0)).toEqual({ ok: false, error: "Aucun patient n'est abonné : il n'y a personne à qui écrire." });
  });

  it("rejoue les règles du contenu, même si l'appelant ne l'a pas fait", async () => {
    for (const bad of [{ ...ANNOUNCEMENT, message: "Voir https://exemple.fr" }, { ...ANNOUNCEMENT, title: "" }, { ...ANNOUNCEMENT, message: "Sur ordonnance uniquement" }, { ...ANNOUNCEMENT, message: "Bonjour {{prenom}}" }]) {
      expect((await svc.sendAnnouncement(SCOPE_A, bad, 3)).ok).toBe(false);
    }
    expect(db.state.announcements).toEqual([]);
    expect(provider.sendEmail).not.toHaveBeenCalled();
  });

  it("refuse quand l'officine a coupé la fonction, est désactivée ou inconnue", async () => {
    db.state.pharmacies[0].patientNewsEnabled = false;
    expect(await svc.sendAnnouncement(SCOPE_A, ANNOUNCEMENT, 3)).toMatchObject({ ok: false });
    db.state.pharmacies[0].patientNewsEnabled = true;
    db.state.pharmacies[0].isActive = false;
    expect(await svc.sendAnnouncement(SCOPE_A, ANNOUNCEMENT, 3)).toMatchObject({ ok: false });
    expect(await svc.sendAnnouncement({ ...SCOPE_A, pharmacyId: "ph_inconnue" }, ANNOUNCEMENT, 3)).toMatchObject({ ok: false });
    expect(provider.sendEmail).not.toHaveBeenCalled();
  });

  describe("une annonce tous les 7 jours au plus, côté serveur", () => {
    it("refuse trois jours après la précédente et dit quand ce sera possible", async () => {
      announcementRow({ createdAt: new Date(NOW.getTime() - 3 * DAY), status: "SENT" });
      const result = await svc.sendAnnouncement(SCOPE_A, ANNOUNCEMENT, 3);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain("18 octobre 2026");
      expect(provider.sendEmail).not.toHaveBeenCalled();
      expect(db.state.announcements).toHaveLength(1);
    });

    it("accepte exactement 7 jours après", async () => {
      announcementRow({ createdAt: new Date(NOW.getTime() - 7 * DAY), status: "SENT" });
      expect((await svc.sendAnnouncement(SCOPE_A, ANNOUNCEMENT, 3)).ok).toBe(true);
    });

    it("compte une annonce partielle ou en cours, pas un échec complet ni un envoi simulé", async () => {
      announcementRow({ createdAt: new Date(NOW.getTime() - 1 * DAY), status: "PARTIAL" });
      expect((await svc.sendAnnouncement(SCOPE_A, ANNOUNCEMENT, 3)).ok).toBe(false);
      db.state.announcements.length = 0;
      announcementRow({ createdAt: new Date(NOW.getTime() - 1 * DAY), status: "SENDING" });
      expect((await svc.sendAnnouncement(SCOPE_A, ANNOUNCEMENT, 3)).ok).toBe(false);
      db.state.announcements.length = 0;
      announcementRow({ createdAt: new Date(NOW.getTime() - 1 * DAY), status: "FAILED", sentCount: 0 });
      announcementRow({ createdAt: new Date(NOW.getTime() - 1 * DAY), status: "SENT", simulated: true });
      expect((await svc.sendAnnouncement(SCOPE_A, ANNOUNCEMENT, 3)).ok).toBe(true);
    });

    it("l'annonce d'une autre officine ne bloque pas celle-ci", async () => {
      announcementRow({ pharmacyId: "ph_b", createdAt: new Date(NOW.getTime() - 1 * DAY), status: "SENT" });
      expect((await svc.sendAnnouncement(SCOPE_A, ANNOUNCEMENT, 3)).ok).toBe(true);
    });
  });
});

describe("sendAnnouncement : l'envoi", () => {
  it("écrit aux abonnés ACTIFS de l'officine de la session, et à eux seuls", async () => {
    seedSubscribers("ph_a", 3);
    seedSubscribers("ph_b", 2, "autre.org");
    subscriber("ph_a", "parti@example.org", { status: "UNSUBSCRIBED", emailCipher: null, emailMasked: null });

    const result = await svc.sendAnnouncement(SCOPE_A, ANNOUNCEMENT, 3);
    expect(result).toMatchObject({ ok: true, recipientCount: 3, sentCount: 3, failedCount: 0, simulated: false, complete: true });
    expect(sentTo().sort()).toEqual([addressOf(1), addressOf(2), addressOf(3)]);
    expect(sentTo().join()).not.toContain("autre.org");
    expect(sentTo().join()).not.toContain("parti");
    expect(db.state.announcements[0]).toMatchObject({ pharmacyId: "ph_a", status: "SENT", recipientCount: 3, sentCount: 3, failedCount: 0, simulated: false, createdByUserId: "user_a", createdAt: NOW });
    expect(db.state.announcements[0].completedAt).toEqual(NOW);
    expect(db.state.deliveries.map((row) => row.status)).toEqual(["SENT", "SENT", "SENT"]);
  });

  it("chaque message est au nom de l'officine, avec le lien de désinscription propre à son destinataire", async () => {
    seedSubscribers("ph_a", 2);
    await svc.sendAnnouncement(SCOPE_A, ANNOUNCEMENT, 2);
    const messages = sentMessages();
    expect(messages).toHaveLength(2);
    for (const message of messages) {
      expect(message.fromName).toBe("Pharmacie Saint-Michel");
      expect(message.subject).toBe(ANNOUNCEMENT.title);
      expect(message.text).toContain(ANNOUNCEMENT.message);
      expect(message.text).toContain("Vous recevez ce message parce que vous avez demandé à être informé(e) des nouveautés de Pharmacie Saint-Michel.");
      expect(`${message.text}${message.html}`).not.toMatch(/pharmaboost/i);
      const token = unsubscribeTokenIn(message.text);
      expect(message.headers).toEqual({ "List-Unsubscribe": `<https://pharma.example/nouveautes/desinscription/${token}>` });
      // Le lien désinscrit CE destinataire, dans CETTE officine.
      expect(token).not.toContain(message.to);
    }
    const tokens = messages.map((message) => unsubscribeTokenIn(message.text));
    expect(new Set(tokens).size).toBe(2);
    await svc.confirmNewsUnsubscribe(tokens[0]);
    expect(db.state.subs.map((row) => row.status)).toEqual(["UNSUBSCRIBED", "ACTIVE"]);
  });

  it("la réservation précède TOUJOURS l'envoi, pour chaque abonné", async () => {
    const subs = seedSubscribers("ph_a", 4);
    await svc.sendAnnouncement(SCOPE_A, ANNOUNCEMENT, 4);
    for (const [index, row] of subs.entries()) {
      const reserved = db.state.log.indexOf(`réserve:${String(row.id)}`);
      const sent = db.state.log.indexOf(`envoie:${addressOf(index + 1)}`);
      expect(reserved).toBeGreaterThanOrEqual(0);
      expect(sent).toBeGreaterThan(reserved);
    }
  });

  it("une réservation déjà prise (P2002, autre passage) : cet abonné n'est pas contacté une seconde fois", async () => {
    const subs = seedSubscribers("ph_a", 3);
    // Un autre passage a déjà réservé — et servi — le deuxième abonné pour l'annonce à venir.
    db.state.deliveries.push({ id: "del_autre", announcementId: "ann_001", subscriptionId: subs[1].id, status: "SENT", detail: null, createdAt: NOW });
    const result = await svc.sendAnnouncement(SCOPE_A, ANNOUNCEMENT, 3);
    expect(result).toMatchObject({ ok: true, complete: true });
    expect(sentTo().sort()).toEqual([addressOf(1), addressOf(3)]);
    expect(db.state.deliveries).toHaveLength(3);
  });

  it("la réservation gagnée de justesse par un autre passage (P2002 à l'insertion) n'envoie rien à cet abonné", async () => {
    const subs = seedSubscribers("ph_a", 2);
    // Entre la lecture de la liste et l'insertion, un autre passage a réservé (et servi) le premier abonné.
    db.prisma.patientNewsDelivery.create.mockImplementationOnce(async ({ data }: { data: Row }) => {
      db.state.deliveries.push({ id: "del_autre", announcementId: data.announcementId, subscriptionId: data.subscriptionId, status: "SENT", detail: null, createdAt: NOW });
      throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    });
    const result = await svc.sendAnnouncement(SCOPE_A, ANNOUNCEMENT, 2);
    expect(result).toMatchObject({ ok: true, complete: true });
    expect(sentTo()).toEqual([addressOf(2)]);
    expect(db.state.deliveries.map((row) => row.subscriptionId).sort()).toEqual(subs.map((row) => row.id).sort());
  });

  it("un lot entièrement réservé par un autre passage n'est pas une erreur : rien n'est envoyé, l'annonce se clôt", async () => {
    seedSubscribers("ph_a", 1);
    db.prisma.patientNewsDelivery.create.mockImplementationOnce(async ({ data }: { data: Row }) => {
      db.state.deliveries.push({ id: "del_autre", announcementId: data.announcementId, subscriptionId: data.subscriptionId, status: "SENT", detail: null, createdAt: NOW });
      throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    });
    const result = await svc.sendAnnouncement(SCOPE_A, ANNOUNCEMENT, 1);
    expect(result).toMatchObject({ ok: true, complete: true, sentCount: 1 });
    expect(provider.sendEmail).not.toHaveBeenCalled();
  });

  it("un abonné désinscrit PENDANT l'envoi, avant son tour, n'est pas contacté", async () => {
    const subs = seedSubscribers("ph_a", 7);
    // Le premier message part : au même instant, le septième patient se désinscrit.
    provider.sendEmail.mockImplementationOnce(async (message: { to: string }) => {
      db.state.log.push(`envoie:${message.to}`);
      Object.assign(subs[6], { status: "UNSUBSCRIBED", emailCipher: null, emailMasked: null });
      return { status: "SENT", provider: "test", detail: "ok" };
    });
    const result = await svc.sendAnnouncement(SCOPE_A, ANNOUNCEMENT, 7);
    expect(sentTo()).not.toContain(addressOf(7));
    expect(sentTo()).toHaveLength(6);
    expect(result).toMatchObject({ ok: true, recipientCount: 6, sentCount: 6, failedCount: 0, complete: true });
    expect(db.state.deliveries.some((row) => row.subscriptionId === subs[6].id)).toBe(false);
    expect(db.state.announcements[0].status).toBe("SENT");
  });

  it("un abonné désinscrit ENTRE sa réservation et l'envoi n'est pas contacté non plus", async () => {
    const subs = seedSubscribers("ph_a", 3);
    db.state.afterDeliveryCreate = (reserved) => {
      if (reserved.subscriptionId === subs[1].id) Object.assign(subs[1], { status: "UNSUBSCRIBED", emailCipher: null, emailMasked: null });
    };
    const result = await svc.sendAnnouncement(SCOPE_A, ANNOUNCEMENT, 3);
    expect(sentTo().sort()).toEqual([addressOf(1), addressOf(3)]);
    expect(db.state.deliveries.find((row) => row.subscriptionId === subs[1].id)).toMatchObject({ status: "SKIPPED" });
    expect(result).toMatchObject({ ok: true, recipientCount: 2, sentCount: 2, failedCount: 0 });
  });

  it("messagerie non configurée : l'envoi est simulé, dit simulé, et n'est jamais présenté comme réussi", async () => {
    provider.capability = "SIMULATED";
    provider.sendEmail.mockImplementation(async () => ({ status: "SIMULATED", provider: "none", detail: "Aucun fournisseur configuré." }));
    seedSubscribers("ph_a", 2);
    const result = await svc.sendAnnouncement(SCOPE_A, ANNOUNCEMENT, 2);
    expect(result).toMatchObject({ ok: true, simulated: true, sentCount: 2, complete: true });
    expect(db.state.announcements[0].simulated).toBe(true);
    expect(db.state.deliveries.map((row) => row.status)).toEqual(["SIMULATED", "SIMULATED"]);
  });

  it("un envoi simulé ne bloque pas la vraie annonce de la semaine", async () => {
    provider.capability = "SIMULATED";
    provider.sendEmail.mockImplementation(async () => ({ status: "SIMULATED", provider: "none", detail: "non configuré" }));
    seedSubscribers("ph_a", 1);
    await svc.sendAnnouncement(SCOPE_A, ANNOUNCEMENT, 1);
    provider.capability = "LIVE";
    provider.sendEmail.mockImplementation(async () => ({ status: "SENT", provider: "test", detail: "ok" }));
    expect(await svc.sendAnnouncement(SCOPE_A, ANNOUNCEMENT, 1)).toMatchObject({ ok: true, simulated: false, sentCount: 1 });
  });

  it("un refus d'un destinataire donne une annonce partielle ; l'adresse ne survit pas dans le détail", async () => {
    seedSubscribers("ph_a", 3);
    provider.sendEmail.mockImplementation(async (message: { to: string }) =>
      message.to === addressOf(2)
        ? { status: "FAILED", provider: "test", detail: `550 5.1.1 <${message.to}>: Recipient address rejected` }
        : { status: "SENT", provider: "test", detail: "ok" },
    );
    const result = await svc.sendAnnouncement(SCOPE_A, ANNOUNCEMENT, 3);
    expect(result).toMatchObject({ ok: true, sentCount: 2, failedCount: 1, complete: true });
    expect(db.state.announcements[0].status).toBe("PARTIAL");
    const failed = db.state.deliveries.find((row) => row.status === "FAILED")!;
    expect(failed.detail).toContain("[adresse]");
    expect(JSON.stringify(db.state)).not.toContain("patient2@");
  });

  it("une exception du fournisseur est un échec de CE destinataire, détail nettoyé ; les autres partent", async () => {
    seedSubscribers("ph_a", 3);
    provider.sendEmail.mockImplementation(async (message: { to: string }) => {
      if (message.to === addressOf(1)) throw new Error(`connexion refusée pour ${message.to}`);
      return { status: "SENT", provider: "test", detail: "ok" };
    });
    const result = await svc.sendAnnouncement(SCOPE_A, ANNOUNCEMENT, 3);
    expect(result).toMatchObject({ ok: true, sentCount: 2, failedCount: 1 });
    expect(JSON.stringify(db.state.deliveries)).not.toContain("patient1@");
  });

  it("tous les envois refusés : annonce en échec, qui ne bloque pas la suivante", async () => {
    seedSubscribers("ph_a", 2);
    provider.sendEmail.mockImplementation(async () => ({ status: "FAILED", provider: "test", detail: "service indisponible" }));
    const result = await svc.sendAnnouncement(SCOPE_A, ANNOUNCEMENT, 2);
    expect(result).toMatchObject({ ok: true, sentCount: 0, failedCount: 2, complete: true });
    expect(db.state.announcements[0].status).toBe("FAILED");
    provider.sendEmail.mockImplementation(async () => ({ status: "SENT", provider: "test", detail: "ok" }));
    expect((await svc.sendAnnouncement(SCOPE_A, ANNOUNCEMENT, 2)).ok).toBe(true);
  });

  it("l'audit de l'envoi ne porte que des comptes, jamais une adresse", async () => {
    seedSubscribers("ph_a", 2);
    await svc.sendAnnouncement(SCOPE_A, ANNOUNCEMENT, 2);
    const entry = audit.recordAudit.mock.calls.map(([call]) => call as { action: string; metadata: Row }).find((call) => call.action === "patient_news.announcement_sent")!;
    expect(entry.metadata).toEqual({ status: "SENT", recipientCount: 2, sentCount: 2, failedCount: 0, simulated: false });
    expect(JSON.stringify(audit.recordAudit.mock.calls)).not.toMatch(/example\.org|patient1/);
  });

  it("deux envois lancés au même instant (deux onglets) : un seul part", async () => {
    seedSubscribers("ph_a", 3);
    const [first, second] = await Promise.all([svc.sendAnnouncement(SCOPE_A, ANNOUNCEMENT, 3), svc.sendAnnouncement(SCOPE_A, ANNOUNCEMENT, 3)]);
    expect([first.ok, second.ok].sort()).toEqual([false, true]);
    expect(provider.sendEmail).toHaveBeenCalledTimes(3);
    expect(new Set(sentTo()).size).toBe(3);
    expect(db.state.announcements).toHaveLength(1);
    expect(db.state.deliveries).toHaveLength(3);
    const loser = first.ok ? second : first;
    expect(loser).toMatchObject({ ok: false });
    expect(auditActions().filter((action) => action === "patient_news.announcement_sent")).toHaveLength(1);
  });
});

describe("le budget de temps, la reprise et le passage quotidien", () => {
  /** Chaque message « prend » 10 s : un lot de 5 épuise le budget de 45 s. */
  function slowProvider() {
    provider.sendEmail.mockImplementation(async (message: { to: string }) => {
      db.state.log.push(`envoie:${message.to}`);
      vi.setSystemTime(new Date(Date.now() + 10_000));
      return { status: "SENT", provider: "test", detail: "ok" };
    });
  }

  it("au-delà du budget l'annonce reste « en cours » ; la reprise sert les autres, sans doublon, jusqu'au bout", async () => {
    seedSubscribers("ph_a", 12);
    slowProvider();

    const first = await svc.sendAnnouncement(SCOPE_A, ANNOUNCEMENT, 12);
    expect(first).toMatchObject({ ok: true, sentCount: 5, complete: false });
    const id = first.ok ? first.announcementId : "";
    expect(db.state.announcements[0]).toMatchObject({ status: "SENDING", sentCount: 5, completedAt: null });
    expect(auditActions()).not.toContain("patient_news.announcement_sent");

    const second = await svc.resumeAnnouncement(SCOPE_A, id);
    expect(second).toEqual({ ok: true, sentCount: 10, failedCount: 0, complete: false });
    const third = await svc.resumeAnnouncement(SCOPE_A, id);
    expect(third).toEqual({ ok: true, sentCount: 12, failedCount: 0, complete: true });

    expect(sentTo()).toHaveLength(12);
    expect(new Set(sentTo()).size).toBe(12);
    expect(db.state.announcements[0]).toMatchObject({ status: "SENT", recipientCount: 12, sentCount: 12 });
    expect(auditActions().filter((action) => action === "patient_news.announcement_sent")).toHaveLength(1);
  });

  it("reprendre une annonce terminée est refusé ; une annonce d'une autre officine est introuvable", async () => {
    seedSubscribers("ph_a", 1);
    const sent = await svc.sendAnnouncement(SCOPE_A, ANNOUNCEMENT, 1);
    const id = sent.ok ? sent.announcementId : "";
    expect(await svc.resumeAnnouncement(SCOPE_A, id)).toEqual({ ok: false, error: "Cette annonce est déjà terminée." });

    seedSubscribers("ph_b", 2, "autre.org");
    const pending = announcementRow({ id: "ann_en_cours", pharmacyId: "ph_a", status: "SENDING", createdAt: new Date(NOW.getTime() - 10 * 60_000) });
    provider.sendEmail.mockClear();
    expect(await svc.resumeAnnouncement(SCOPE_B, String(pending.id))).toEqual({ ok: false, error: "Annonce introuvable dans cette officine." });
    expect(await svc.resumeAnnouncement(SCOPE_B, "ann_inconnue")).toMatchObject({ ok: false });
    expect(provider.sendEmail).not.toHaveBeenCalled();
  });

  it("l'annonce ne sert pas un abonné qui a donné son accord après sa rédaction", async () => {
    const early = subscriber("ph_a", "ancien@example.org", { consentAt: new Date(NOW.getTime() - 3 * DAY) });
    subscriber("ph_a", "recent@example.org", { consentAt: new Date(NOW.getTime() - 60_000) });
    announcementRow({ id: "ann_en_cours", status: "SENDING", recipientCount: 1, sentCount: 0, createdAt: new Date(NOW.getTime() - 10 * 60_000) });
    const result = await svc.resumeAnnouncement(SCOPE_A, "ann_en_cours");
    expect(sentTo()).toEqual(["ancien@example.org"]);
    expect(result).toMatchObject({ ok: true, complete: true, sentCount: 1 });
    expect(db.state.deliveries.map((row) => row.subscriptionId)).toEqual([early.id]);
  });

  it("une réservation restée sans issue depuis longtemps est close sans être rejouée (un message manquant vaut mieux que deux)", async () => {
    const stuck = subscriber("ph_a", "bloque@example.org");
    announcementRow({ id: "ann_en_cours", status: "SENDING", recipientCount: 1, createdAt: new Date(NOW.getTime() - 30 * 60_000) });
    db.state.deliveries.push({ id: "del_vieille", announcementId: "ann_en_cours", subscriptionId: stuck.id, status: "CLAIMED", detail: null, createdAt: new Date(NOW.getTime() - 20 * 60_000) });
    const result = await svc.resumeAnnouncement(SCOPE_A, "ann_en_cours");
    expect(provider.sendEmail).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, sentCount: 0, failedCount: 1, complete: true });
    expect(db.state.deliveries[0]).toMatchObject({ status: "FAILED", detail: expect.stringContaining("résultat est inconnu") });
    expect(db.state.announcements[0].status).toBe("FAILED");
  });

  it("une réservation récente est peut-être un envoi en cours : l'annonce n'est pas close", async () => {
    const busy = subscriber("ph_a", "enCours@example.org");
    announcementRow({ id: "ann_en_cours", status: "SENDING", recipientCount: 1, createdAt: new Date(NOW.getTime() - 30 * 60_000) });
    db.state.deliveries.push({ id: "del_recente", announcementId: "ann_en_cours", subscriptionId: busy.id, status: "CLAIMED", detail: null, createdAt: new Date(NOW.getTime() - 60_000) });
    const result = await svc.resumeAnnouncement(SCOPE_A, "ann_en_cours");
    expect(result).toMatchObject({ ok: true, complete: false });
    expect(db.state.announcements[0].status).toBe("SENDING");
    expect(provider.sendEmail).not.toHaveBeenCalled();
  });

  it("si l'officine a coupé la fonction entre-temps, plus personne n'est servi et l'annonce est close telle quelle", async () => {
    const [first] = seedSubscribers("ph_a", 3);
    announcementRow({ id: "ann_en_cours", status: "SENDING", recipientCount: 3, createdAt: new Date(NOW.getTime() - 30 * 60_000) });
    db.state.deliveries.push({ id: "del_1", announcementId: "ann_en_cours", subscriptionId: first.id, status: "SENT", detail: null, createdAt: new Date(NOW.getTime() - 25 * 60_000) });
    db.state.pharmacies[0].patientNewsEnabled = false;
    const result = await svc.resumeAnnouncement(SCOPE_A, "ann_en_cours");
    expect(provider.sendEmail).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, sentCount: 1, failedCount: 0, complete: true });
    expect(db.state.announcements[0].status).toBe("SENT");
  });

  it("une panne de base totale ne tourne pas dans le vide : l'erreur remonte", async () => {
    seedSubscribers("ph_a", 3);
    announcementRow({ id: "ann_en_cours", status: "SENDING", recipientCount: 3, createdAt: new Date(NOW.getTime() - 30 * 60_000) });
    db.state.failDeliveriesOf = "ann_en_cours";
    await expect(svc.resumeAnnouncement(SCOPE_A, "ann_en_cours")).rejects.toThrow("panne de base de données");
    expect(provider.sendEmail).not.toHaveBeenCalled();
  });

  describe("resumeStuckAnnouncements", () => {
    it("reprend les annonces en cours depuis plus de 5 minutes, de toutes les officines, et seulement elles", async () => {
      seedSubscribers("ph_a", 2);
      seedSubscribers("ph_b", 1, "autre.org");
      announcementRow({ id: "ann_a", pharmacyId: "ph_a", status: "SENDING", recipientCount: 2, createdAt: new Date(NOW.getTime() - 10 * 60_000) });
      announcementRow({ id: "ann_b", pharmacyId: "ph_b", status: "SENDING", recipientCount: 1, createdAt: new Date(NOW.getTime() - 2 * DAY) });
      announcementRow({ id: "ann_fraiche", pharmacyId: "ph_a", status: "SENDING", createdAt: new Date(NOW.getTime() - 60_000) });
      announcementRow({ id: "ann_finie", pharmacyId: "ph_a", status: "SENT", createdAt: new Date(NOW.getTime() - 3 * DAY) });

      expect(await svc.resumeStuckAnnouncements(NOW)).toBe(2);
      expect(sentTo().sort()).toEqual(["patient1@autre.org", addressOf(1), addressOf(2)].sort());
      const status = (id: string) => db.state.announcements.find((row) => row.id === id)!.status;
      expect([status("ann_a"), status("ann_b"), status("ann_fraiche"), status("ann_finie")]).toEqual(["SENT", "SENT", "SENDING", "SENT"]);
    });

    it("une annonce en difficulté n'empêche pas les suivantes", async () => {
      seedSubscribers("ph_a", 2);
      seedSubscribers("ph_b", 1, "autre.org");
      announcementRow({ id: "ann_a", pharmacyId: "ph_a", status: "SENDING", recipientCount: 2, createdAt: new Date(NOW.getTime() - 3 * DAY) });
      announcementRow({ id: "ann_b", pharmacyId: "ph_b", status: "SENDING", recipientCount: 1, createdAt: new Date(NOW.getTime() - 2 * DAY) });
      db.state.failDeliveriesOf = "ann_a";
      const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
      expect(await svc.resumeStuckAnnouncements(NOW)).toBe(1);
      expect(sentTo()).toEqual(["patient1@autre.org"]);
      expect(errors).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(errors.mock.calls)).not.toContain("@");
      errors.mockRestore();
    });

    it("rien à reprendre : zéro", async () => {
      expect(await svc.resumeStuckAnnouncements(NOW)).toBe(0);
    });
  });
});

describe("purgeStalePatientNews : 36 mois", () => {
  it("supprime les consentements de plus de 36 mois, actifs ou désinscrits, et garde les autres ; la limite est incluse", async () => {
    const at = (iso: string) => new Date(iso);
    subscriber("ph_a", "tresvieux@example.org", { consentAt: at("2023-09-01T00:00:00Z") });
    subscriber("ph_a", "desinscrit@example.org", { consentAt: at("2023-10-03T10:00:00Z"), status: "UNSUBSCRIBED", emailCipher: null, emailMasked: null });
    subscriber("ph_b", "limite@example.org", { consentAt: at("2023-10-14T10:00:00Z") });
    subscriber("ph_b", "recent@example.org", { consentAt: at("2024-01-01T00:00:00Z") });
    subscriber("ph_a", "neuf@example.org", { consentAt: at("2026-10-01T00:00:00Z") });

    expect(await svc.purgeStalePatientNews(NOW)).toBe(2);
    expect(db.state.subs.map((row) => row.emailHash)).toEqual([hashEmail("limite@example.org"), hashEmail("recent@example.org"), hashEmail("neuf@example.org")]);
    expect(audit.recordAudit).toHaveBeenCalledTimes(1);
    expect(audit.recordAudit.mock.calls[0][0]).toMatchObject({ action: "patient_news.purged", metadata: { count: 2 } });
    expect(JSON.stringify(audit.recordAudit.mock.calls)).not.toContain("example.org");
  });

  it("rien à purger : zéro et aucun audit", async () => {
    subscriber("ph_a", MARIE);
    expect(await svc.purgeStalePatientNews(NOW)).toBe(0);
    expect(audit.recordAudit).not.toHaveBeenCalled();
  });
});

describe("getNewsOverview : des comptes, jamais une adresse", () => {
  it("compte les abonnés actifs de l'officine, liste les annonces, calcule la prochaine date possible", async () => {
    seedSubscribers("ph_a", 3);
    subscriber("ph_a", "parti@example.org", { status: "UNSUBSCRIBED", emailCipher: null, emailMasked: null });
    seedSubscribers("ph_b", 5, "autre.org");
    announcementRow({ id: "ann_vieille", createdAt: new Date(NOW.getTime() - 40 * DAY), status: "SENT" });
    announcementRow({ id: "ann_recente", createdAt: new Date(NOW.getTime() - 2 * DAY), status: "PARTIAL", sentCount: 2, failedCount: 1, recipientCount: 3 });
    announcementRow({ id: "ann_autre", pharmacyId: "ph_b", createdAt: new Date(NOW.getTime() - 1 * DAY) });

    const overview = await svc.getNewsOverview(SCOPE_A);
    expect(overview).toMatchObject({ enabled: true, activeCount: 3, messagingLive: true, lastAnnouncementAt: new Date(NOW.getTime() - 2 * DAY), nextAllowedAt: new Date(NOW.getTime() + 5 * DAY) });
    expect(overview.announcements.map((row) => row.id)).toEqual(["ann_recente", "ann_vieille"]);
    expect(overview.announcements[0]).toEqual({ id: "ann_recente", title: ANNOUNCEMENT.title, rangeLabel: ANNOUNCEMENT.rangeLabel, status: "PARTIAL", recipientCount: 3, sentCount: 2, failedCount: 1, simulated: false, createdAt: new Date(NOW.getTime() - 2 * DAY) });
  });

  it("ne contient ni adresse, ni forme masquée, ni chiffré", async () => {
    seedSubscribers("ph_a", 3);
    announcementRow();
    const json = JSON.stringify(await svc.getNewsOverview(SCOPE_A));
    expect(json).not.toMatch(/@|enc:v1|emailCipher|emailMasked|emailHash|\*\*\*/);
  });

  it("dit si la messagerie est réellement branchée", async () => {
    provider.capability = "SIMULATED";
    expect((await svc.getNewsOverview(SCOPE_A)).messagingLive).toBe(false);
  });

  it("sans annonce : ni date, ni attente", async () => {
    expect(await svc.getNewsOverview(SCOPE_A)).toMatchObject({ activeCount: 0, lastAnnouncementAt: null, nextAllowedAt: null, announcements: [] });
  });

  it("les suggestions de gamme viennent des gammes privilégiées actives de l'officine, et d'elles seules", async () => {
    db.state.ranges.push(
      { pharmacyId: "ph_a", laboratory: "Avène", rangeName: "Cicalfate", universe: "DERMO", priority: 1, isActive: true },
      { pharmacyId: "ph_a", laboratory: "Avène", rangeName: "cicalfate", universe: "SOLAIRE", priority: 1, isActive: true },
      { pharmacyId: "ph_a", laboratory: "Bioderma", rangeName: null, universe: "DERMO", priority: 2, isActive: true },
      { pharmacyId: "ph_a", laboratory: "Éteinte", rangeName: "Ancienne", universe: "DERMO", priority: 3, isActive: false },
      { pharmacyId: "ph_b", laboratory: "AutreOfficine", rangeName: "Secrète", universe: "DERMO", priority: 1, isActive: true },
    );
    const { rangeSuggestions } = await svc.getNewsOverview(SCOPE_A);
    expect(rangeSuggestions).toEqual([{ laboratory: "Avène", rangeName: "Cicalfate" }, { laboratory: "Bioderma", rangeName: null }]);
  });

  it("une fonction coupée se voit", async () => {
    db.state.pharmacies[0].patientNewsEnabled = false;
    expect((await svc.getNewsOverview(SCOPE_A)).enabled).toBe(false);
  });
});

describe("setPatientNewsEnabled", () => {
  it("coupe et rétablit la fonction pour l'officine de la session seulement, avec un audit à chaque changement réel", async () => {
    await svc.setPatientNewsEnabled(SCOPE_A, false);
    expect(db.state.pharmacies.map((row) => [row.id, row.patientNewsEnabled])).toEqual([["ph_a", false], ["ph_b", true]]);
    await svc.setPatientNewsEnabled(SCOPE_A, false);
    await svc.setPatientNewsEnabled(SCOPE_A, true);
    expect(db.state.pharmacies[0].patientNewsEnabled).toBe(true);
    expect(audit.recordAudit.mock.calls.map(([entry]) => entry)).toEqual([
      expect.objectContaining({ action: "patient_news.settings_changed", pharmacyId: "ph_a", userId: "user_a", metadata: { enabled: false } }),
      expect.objectContaining({ action: "patient_news.settings_changed", pharmacyId: "ph_a", userId: "user_a", metadata: { enabled: true } }),
    ]);
  });

  it("les liens déjà envoyés ne fonctionnent plus une fois la fonction coupée", async () => {
    const token = optInToken("ph_a", MARIE);
    await svc.setPatientNewsEnabled(SCOPE_A, false);
    expect(await svc.peekNewsOptIn(token)).toBeNull();
    expect(await svc.confirmNewsOptIn(token)).toMatchObject({ ok: false });
    expect(db.state.subs).toEqual([]);
  });
});

describe("aperçu et test", () => {
  it("l'aperçu rend le message de l'officine, avec un lien de désinscription d'exemple, sans écrire ni envoyer", async () => {
    const preview = await svc.previewAnnouncement(SCOPE_A, ANNOUNCEMENT);
    expect(preview.subject).toBe(ANNOUNCEMENT.title);
    expect(preview.text).toContain(ANNOUNCEMENT.message);
    expect(preview.text).toContain("Pharmacie Saint-Michel");
    expect(preview.text).toContain("https://pharma.example/nouveautes/desinscription/exemple");
    expect(preview.html).toContain("Gamme Solaire");
    noWrites();
    expect(provider.sendEmail).not.toHaveBeenCalled();
  });

  it("le test part vers l'adresse de l'utilisateur connecté, et vers elle seule, marqué TEST", async () => {
    seedSubscribers("ph_a", 3);
    const outcome = await svc.sendAnnouncementTest({ ...SCOPE_A, email: "titulaire@officine.fr" }, ANNOUNCEMENT);
    expect(outcome).toEqual({ status: "SENT", detail: "Remis au prestataire." });
    expect(sentTo()).toEqual(["titulaire@officine.fr"]);
    const [message] = sentMessages();
    expect(message).toMatchObject({ fromName: "Pharmacie Saint-Michel", subject: `[TEST] ${ANNOUNCEMENT.title}` });
    expect(message.text.startsWith("MESSAGE DE TEST")).toBe(true);
    // Un test ne réserve rien, ne crée aucune annonce, ne compte pas dans la semaine.
    expect(db.state.deliveries).toEqual([]);
    expect(db.state.announcements).toEqual([]);
    expect(audit.recordAudit).not.toHaveBeenCalled();
  });

  it("refuse un contenu invalide sans rien envoyer, et nettoie l'adresse d'un refus du fournisseur", async () => {
    expect(await svc.sendAnnouncementTest({ ...SCOPE_A, email: "titulaire@officine.fr" }, { ...ANNOUNCEMENT, message: "www.marque.fr" })).toMatchObject({ status: "FAILED" });
    expect(provider.sendEmail).not.toHaveBeenCalled();
    provider.sendEmail.mockRejectedValueOnce(new Error("refus de titulaire@officine.fr"));
    const outcome = await svc.sendAnnouncementTest({ ...SCOPE_A, email: "titulaire@officine.fr" }, ANNOUNCEMENT);
    expect(outcome.status).toBe("FAILED");
    expect(outcome.detail).not.toContain("titulaire@officine.fr");
  });
});
