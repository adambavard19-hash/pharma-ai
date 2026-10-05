import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Les confrères proposés au parrainage : enregistrement (sans doublon, sans donnée
 * personnelle dans l'audit), rapprochement d'un NOUVEAU dossier par l'e-mail (casse
 * ignorée, un seul confrère par dossier), rattachement de l'officine au parrain, et
 * les gestes de la console. Une base en mémoire fait respecter les mêmes règles que
 * la vraie (clé unique, filtres) ; rien n'est écrit, aucun message ne part.
 */

type Lead = { id: string; referrerProspectId: string; contactName: string | null; email: string; phone: string; status: string; referredProspectId: string | null; createdAt: Date };

const db = vi.hoisted(() => {
  const state = {
    leads: [] as Lead[],
    prospects: [] as { id: string; name: string; pharmacyId: string | null; referralCode: string | null }[],
    pharmacies: [] as { id: string; referredById: string | null; referralAmountCents: number | null }[],
    /** Les codes de parrainage connus : code → officine marraine. */
    codes: {} as Record<string, { id: string; name: string }>,
    sequence: 0,
    failCreate: false,
  };
  const matches = (lead: Lead, where: Record<string, unknown>): boolean => {
    for (const [key, cond] of Object.entries(where)) {
      const value = lead[key as keyof Lead];
      if (cond && typeof cond === "object" && !(cond instanceof Date)) {
        const c = cond as { equals?: string; mode?: string; in?: unknown[]; not?: unknown };
        if (c.equals !== undefined && !(c.mode === "insensitive" ? String(value).toLowerCase() === c.equals.toLowerCase() : value === c.equals)) return false;
        if (c.in && !c.in.includes(value)) return false;
        if (c.not !== undefined && value === c.not) return false;
      } else if (value !== cond) return false;
    }
    return true;
  };
  const withRelations = (lead: Lead) => ({
    ...lead,
    referrerProspect: (() => {
      const p = state.prospects.find((x) => x.id === lead.referrerProspectId)!;
      const pharmacy = p.pharmacyId ? { id: p.pharmacyId, name: `Officine de ${p.name}` } : null;
      return { id: p.id, name: p.name, pharmacyId: p.pharmacyId, pharmacy };
    })(),
    referredProspect: lead.referredProspectId ? { id: lead.referredProspectId, name: state.prospects.find((x) => x.id === lead.referredProspectId)?.name ?? "?" } : null,
  });
  const prisma = {
    referralLead: {
      findFirst: vi.fn(async ({ where, orderBy }: { where: Record<string, unknown>; orderBy?: { createdAt: "asc" | "desc" } }) => {
        // Sans ordre demandé, l'ordre d'insertion ; l'ordre demandé est respecté (le plus ancien d'abord, ou l'inverse).
        const direction = orderBy?.createdAt === "desc" ? -1 : 1;
        const found = state.leads.filter((l) => matches(l, where)).sort((a, b) => direction * (a.createdAt.getTime() - b.createdAt.getTime()))[0];
        return found ? withRelations(found) : null;
      }),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => state.leads.filter((l) => matches(l, where)).map(withRelations)),
      findUnique: vi.fn(async ({ where }: { where: { id?: string; referredProspectId?: string } }) => {
        const found = state.leads.find((l) => (where.id ? l.id === where.id : l.referredProspectId === where.referredProspectId));
        return found ? withRelations(found) : null;
      }),
      create: vi.fn(async ({ data }: { data: Partial<Lead> }) => {
        if (state.failCreate) throw new Error("base indisponible");
        const lead: Lead = { id: `lead_${++state.sequence}`, referrerProspectId: data.referrerProspectId!, contactName: data.contactName ?? null, email: data.email!, phone: data.phone!, status: data.status ?? "NEW", referredProspectId: null, createdAt: new Date(2026, 9, 1, 8, state.sequence) };
        state.leads.push(lead);
        return { id: lead.id };
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Partial<Lead> }) => {
        const targets = state.leads.filter((l) => matches(l, where));
        for (const lead of targets) {
          // La clé unique de la vraie table : un dossier n'est le confrère que d'un seul parrain.
          if (data.referredProspectId && state.leads.some((l) => l.referredProspectId === data.referredProspectId && l.id !== lead.id)) throw Object.assign(new Error("Unique constraint"), { code: "P2002" });
          Object.assign(lead, data);
        }
        return { count: targets.length };
      }),
    },
    prospect: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => state.prospects.find((p) => p.id === where.id) ?? null),
    },
    pharmacy: {
      updateMany: vi.fn(async ({ where, data }: { where: { id: string; referredById: null }; data: { referredById: string; referralAmountCents: number | null } }) => {
        const targets = state.pharmacies.filter((p) => p.id === where.id && p.referredById === where.referredById);
        for (const p of targets) Object.assign(p, data);
        return { count: targets.length };
      }),
      findUnique: vi.fn(async ({ where }: { where: { referralCode: string } }) => state.codes[where.referralCode] ?? null),
    },
    referralOffer: { findMany: vi.fn(async () => [] as unknown[]) },
  };
  return { state, prisma };
});

const mocks = vi.hoisted(() => ({ recordProspectEvent: vi.fn(), notifyAdmins: vi.fn(), recordAudit: vi.fn(), referralAmountForNewFilleul: vi.fn(async () => null as number | null) }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: db.prisma }));
vi.mock("@/server/audit/log", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@/server/services/sales/events", () => ({ recordProspectEvent: mocks.recordProspectEvent }));
vi.mock("@/server/services/sales/notifications", () => ({ notifyAdmins: mocks.notifyAdmins, notifySalesRep: vi.fn() }));
vi.mock("@/server/services/referral-offers", () => ({ referralAmountForNewFilleul: mocks.referralAmountForNewFilleul }));

const svc = await import("../referral-leads");

const SITE = { type: "SYSTEM" as const, label: "Site PharmaBoost" };
const ADMIN = { type: "ADMIN" as const, id: "adm_1", label: "Administrateur" };
const referee = { name: "Dr Durand", email: "Confrere@Pharmacie-Durand.fr", phone: "06 12 34 56 78" };

const events = () => mocks.recordProspectEvent.mock.calls.map((c) => c[0] as { prospectId: string; type: string; summary: string; metadata?: Record<string, unknown> });
const leads = () => db.state.leads;

beforeEach(() => {
  vi.clearAllMocks();
  db.state.leads = [];
  db.state.sequence = 0;
  db.state.failCreate = false;
  db.state.prospects = [
    { id: "p_parrain", name: "Pharmacie du Port", pharmacyId: null, referralCode: null },
    { id: "p_filleul", name: "Pharmacie Durand", pharmacyId: null, referralCode: null },
  ];
  db.state.pharmacies = [{ id: "ph_filleul", referredById: null, referralAmountCents: null }];
  db.state.codes = {};
  mocks.referralAmountForNewFilleul.mockResolvedValue(null);
});

describe("statuts d'un confrère proposé", () => {
  it("quatre statuts, libellés en français ; seuls « Contacté » et « Décliné » se fixent à la main", () => {
    expect(svc.REFERRAL_LEAD_STATUSES).toEqual(["NEW", "CONTACTED", "LINKED", "DECLINED"]);
    expect(svc.REFERRAL_LEAD_STATUS_LABELS).toEqual({ NEW: "À contacter", CONTACTED: "Contacté", LINKED: "Dossier ouvert", DECLINED: "Décliné" });
    expect(svc.MANUAL_LEAD_STATUSES).toEqual(["CONTACTED", "DECLINED"]);
  });
});

describe("proposer un confrère à parrainer", () => {
  it("crée la fiche (NEW, e-mail en minuscules), un événement sur le dossier, une notification et un audit", async () => {
    const result = await svc.proposeReferee({ referrerProspectId: "p_parrain", referrerName: "Pharmacie du Port", referee, actor: SITE });
    expect(result.created).toBe(true);
    expect(leads()).toEqual([expect.objectContaining({ referrerProspectId: "p_parrain", contactName: "Dr Durand", email: "confrere@pharmacie-durand.fr", phone: "06 12 34 56 78", status: "NEW", referredProspectId: null })]);
    expect(events()).toEqual([expect.objectContaining({ prospectId: "p_parrain", type: "NOTE", summary: "Confrère proposé au parrainage : Dr Durand · confrere@pharmacie-durand.fr · 06 12 34 56 78" })]);
    expect(mocks.notifyAdmins).toHaveBeenCalledWith(expect.objectContaining({ type: "REFERRAL_LEAD", linkUrl: "/admin/dossiers/p_parrain", body: expect.stringContaining("rien n'a été envoyé à cette personne") }));
  });

  it("sans nom : l'événement ne garde que l'e-mail et le téléphone", async () => {
    await svc.proposeReferee({ referrerProspectId: "p_parrain", referrerName: "Pharmacie du Port", referee: { ...referee, name: null } });
    expect(events()[0].summary).toBe("Confrère proposé au parrainage : confrere@pharmacie-durand.fr · 06 12 34 56 78");
  });

  it("l'audit ne porte AUCUNE donnée personnelle : ni nom, ni e-mail, ni téléphone du confrère", async () => {
    await svc.proposeReferee({ referrerProspectId: "p_parrain", referrerName: "Pharmacie du Port", referee, actor: SITE });
    expect(mocks.recordAudit).toHaveBeenCalledTimes(1);
    const audit = mocks.recordAudit.mock.calls[0][0] as { action: string; entityType: string; entityId: string; metadata: Record<string, unknown> };
    expect(audit).toMatchObject({ action: "referral.lead_proposed", entityType: "ReferralLead", entityId: "lead_1", metadata: { referrerProspectId: "p_parrain" } });
    const serialized = JSON.stringify(audit);
    for (const personal of ["Durand", "pharmacie-durand", "06 12", "0612"]) expect(serialized.toLowerCase()).not.toContain(personal.toLowerCase());
  });

  it("un même e-mail déjà proposé par le même dossier ne crée pas de doublon (casse ignorée), et n'écrit rien de plus", async () => {
    const first = await svc.proposeReferee({ referrerProspectId: "p_parrain", referrerName: "Pharmacie du Port", referee });
    vi.clearAllMocks();
    const again = await svc.proposeReferee({ referrerProspectId: "p_parrain", referrerName: "Pharmacie du Port", referee: { ...referee, email: "CONFRERE@pharmacie-durand.FR", name: "Autre nom" } });
    expect(again).toEqual({ created: false, leadId: first.leadId });
    expect(leads()).toHaveLength(1);
    expect(mocks.recordProspectEvent).not.toHaveBeenCalled();
    expect(mocks.notifyAdmins).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("un confrère déjà enregistré avec une autre casse (fiche ancienne) est retrouvé : pas de doublon", async () => {
    leads().push({ id: "lead_ancien", referrerProspectId: "p_parrain", contactName: null, email: "Confrere@Pharmacie-Durand.fr", phone: "0612345678", status: "NEW", referredProspectId: null, createdAt: new Date(2026, 8, 1) });
    const result = await svc.proposeReferee({ referrerProspectId: "p_parrain", referrerName: "Pharmacie du Port", referee });
    expect(result).toEqual({ created: false, leadId: "lead_ancien" });
    expect(leads()).toHaveLength(1);
  });

  it("le même e-mail proposé par un AUTRE dossier est une autre fiche : chaque parrain garde la sienne", async () => {
    db.state.prospects.push({ id: "p_autre", name: "Pharmacie du Centre", pharmacyId: null, referralCode: null });
    await svc.proposeReferee({ referrerProspectId: "p_parrain", referrerName: "Pharmacie du Port", referee });
    await svc.proposeReferee({ referrerProspectId: "p_autre", referrerName: "Pharmacie du Centre", referee });
    expect(leads().map((l) => l.referrerProspectId)).toEqual(["p_parrain", "p_autre"]);
  });
});

describe("rapprochement d'un nouveau dossier par l'e-mail", () => {
  const propose = (email = referee.email, referrerProspectId = "p_parrain") => svc.proposeReferee({ referrerProspectId, referrerName: "Pharmacie du Port", referee: { ...referee, email } });

  it("un nouveau dossier à la même adresse (casse différente) est rattaché : référé renseigné, statut LINKED, événement sur les deux dossiers", async () => {
    await propose("confrere@pharmacie-durand.fr");
    vi.clearAllMocks();
    const result = await svc.reconcileNewProspect({ id: "p_filleul", email: "CONFRERE@Pharmacie-Durand.FR", name: "Pharmacie Durand" }, SITE);
    expect(result).toEqual({ linked: true, leadId: "lead_1" });
    expect(leads()[0]).toMatchObject({ referredProspectId: "p_filleul", status: "LINKED" });
    const written = events();
    expect(written.find((e) => e.prospectId === "p_filleul")?.summary).toContain("Pharmacie du Port");
    expect(written.find((e) => e.prospectId === "p_parrain")?.summary).toContain("Pharmacie Durand");
    expect(written).toHaveLength(2);
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "referral.lead_linked", entityId: "lead_1", metadata: { referrerProspectId: "p_parrain", referredProspectId: "p_filleul" } }));
  });

  it("un confrère déjà CONTACTÉ est rapproché aussi", async () => {
    await propose();
    leads()[0].status = "CONTACTED";
    expect((await svc.reconcileNewProspect({ id: "p_filleul", email: referee.email, name: "X" }, SITE)).linked).toBe(true);
    expect(leads()[0].status).toBe("LINKED");
  });

  it("un confrère DÉCLINÉ ou déjà rapproché n'est jamais repris", async () => {
    await propose();
    leads()[0].status = "DECLINED";
    expect((await svc.reconcileNewProspect({ id: "p_filleul", email: referee.email, name: "X" }, SITE)).linked).toBe(false);
    expect(leads()[0]).toMatchObject({ status: "DECLINED", referredProspectId: null });
  });

  it("une adresse inconnue, ou un dossier sans adresse, ne rapproche rien et n'écrit rien", async () => {
    await propose();
    vi.clearAllMocks();
    expect((await svc.reconcileNewProspect({ id: "p_filleul", email: "autre@exemple.fr", name: "X" }, SITE)).linked).toBe(false);
    expect((await svc.reconcileNewProspect({ id: "p_filleul", email: null, name: "X" }, SITE)).linked).toBe(false);
    expect((await svc.reconcileNewProspect({ id: "p_filleul", email: "   ", name: "X" }, SITE)).linked).toBe(false);
    expect(mocks.recordProspectEvent).not.toHaveBeenCalled();
    expect(leads()[0]).toMatchObject({ status: "NEW", referredProspectId: null });
  });

  it("jamais le dossier du parrain lui-même", async () => {
    await propose();
    expect((await svc.reconcileNewProspect({ id: "p_parrain", email: referee.email, name: "Pharmacie du Port" }, SITE)).linked).toBe(false);
    expect(leads()[0].referredProspectId).toBeNull();
  });

  it("UN SEUL confrère par dossier parrainé : deux parrains pour la même adresse, le plus ancien l'emporte et le second reste à contacter", async () => {
    db.state.prospects.push({ id: "p_autre", name: "Pharmacie du Centre", pharmacyId: null, referralCode: null });
    await propose(referee.email, "p_parrain");
    await propose(referee.email, "p_autre");
    expect((await svc.reconcileNewProspect({ id: "p_filleul", email: referee.email, name: "X" }, SITE)).linked).toBe(true);
    // Le même dossier ne rejoint pas une seconde fois : la clé unique l'interdit, rien ne casse.
    expect((await svc.reconcileNewProspect({ id: "p_filleul", email: referee.email, name: "X" }, SITE)).linked).toBe(false);
    expect(leads().map((l) => [l.referrerProspectId, l.status, l.referredProspectId])).toEqual([
      ["p_parrain", "LINKED", "p_filleul"],
      ["p_autre", "NEW", null],
    ]);
  });

  it("ne lève jamais : une panne de la base est journalisée, le dossier déjà créé n'en est pas affecté", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    db.prisma.referralLead.findFirst.mockRejectedValueOnce(new Error("base indisponible"));
    await expect(svc.reconcileNewProspect({ id: "p_filleul", email: referee.email, name: "X" }, SITE)).resolves.toEqual({ linked: false, leadId: null });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("rattachement de l'officine à son parrain", () => {
  const linked = async () => {
    db.state.prospects[0].pharmacyId = "ph_parrain";
    await svc.proposeReferee({ referrerProspectId: "p_parrain", referrerName: "Pharmacie du Port", referee });
    await svc.reconcileNewProspect({ id: "p_filleul", email: referee.email, name: "Pharmacie Durand" }, SITE);
    vi.clearAllMocks();
  };

  it("le parrain d'un dossier rapproché est l'officine du dossier qui l'a proposé (si elle existe déjà)", async () => {
    await linked();
    expect(await svc.referrerFromLead("p_filleul")).toEqual({ id: "ph_parrain", name: "Officine de Pharmacie du Port", prospectId: "p_parrain" });
  });

  it("pas de parrain si le dossier n'est le confrère de personne, ou si le dossier qui l'a proposé n'a pas encore d'officine", async () => {
    expect(await svc.referrerFromLead("p_filleul")).toBeNull();
    await svc.proposeReferee({ referrerProspectId: "p_parrain", referrerName: "Pharmacie du Port", referee });
    await svc.reconcileNewProspect({ id: "p_filleul", email: referee.email, name: "X" }, SITE);
    expect(await svc.referrerFromLead("p_filleul")).toBeNull();
  });

  it("une officine créée à la main sans parrain le reçoit, avec le montant de l'offre en cours s'il y en a une, et la trace est écrite sur les deux dossiers", async () => {
    await linked();
    mocks.referralAmountForNewFilleul.mockResolvedValue(2500);
    const result = await svc.attachReferrerFromLead({ prospectId: "p_filleul", pharmacyId: "ph_filleul", pharmacyName: "Pharmacie Durand", actor: ADMIN });
    expect(result).toEqual({ attached: true });
    expect(db.state.pharmacies[0]).toMatchObject({ referredById: "ph_parrain", referralAmountCents: 2500 });
    const written = events();
    expect(written.find((e) => e.prospectId === "p_filleul")?.summary).toContain("filleule de « Officine de Pharmacie du Port »");
    expect(written.find((e) => e.prospectId === "p_parrain")?.summary).toContain("20 % de moins");
  });

  it("hors offre, le montant figé reste vide : c'est la règle des 20 %", async () => {
    await linked();
    await svc.attachReferrerFromLead({ prospectId: "p_filleul", pharmacyId: "ph_filleul", pharmacyName: "Pharmacie Durand", actor: ADMIN });
    expect(db.state.pharmacies[0]).toMatchObject({ referredById: "ph_parrain", referralAmountCents: null });
  });

  it("ne change RIEN quand un parrain est déjà renseigné (un code saisi l'emporte), et n'écrit aucun événement", async () => {
    await linked();
    db.state.pharmacies[0].referredById = "ph_code";
    const result = await svc.attachReferrerFromLead({ prospectId: "p_filleul", pharmacyId: "ph_filleul", pharmacyName: "Pharmacie Durand", actor: ADMIN });
    expect(result).toEqual({ attached: false });
    expect(db.state.pharmacies[0].referredById).toBe("ph_code");
    expect(mocks.recordProspectEvent).not.toHaveBeenCalled();
  });

  it("jamais sa propre officine pour parrain", async () => {
    await linked();
    db.state.prospects[0].pharmacyId = "ph_filleul";
    expect((await svc.attachReferrerFromLead({ prospectId: "p_filleul", pharmacyId: "ph_filleul", pharmacyName: "X", actor: ADMIN })).attached).toBe(false);
    expect(db.state.pharmacies[0].referredById).toBeNull();
  });

  it("ne lève jamais : l'officine existe déjà, une panne est journalisée", async () => {
    await linked();
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    db.prisma.referralLead.findUnique.mockRejectedValueOnce(new Error("base indisponible"));
    await expect(svc.attachReferrerFromLead({ prospectId: "p_filleul", pharmacyId: "ph_filleul", pharmacyName: "X", actor: ADMIN })).resolves.toEqual({ attached: false });
    spy.mockRestore();
  });
});

describe("console : marquer « Contacté » ou « Décliné »", () => {
  beforeEach(async () => {
    await svc.proposeReferee({ referrerProspectId: "p_parrain", referrerName: "Pharmacie du Port", referee });
    vi.clearAllMocks();
  });

  it("NEW → Contacté : statut changé, événement sur le dossier, audit avec l'avant et l'après, sans donnée personnelle", async () => {
    const result = await svc.setReferralLeadStatus("lead_1", "CONTACTED", ADMIN);
    expect(result).toEqual({ ok: true, changed: true, referrerProspectId: "p_parrain" });
    expect(leads()[0].status).toBe("CONTACTED");
    expect(events()[0]).toMatchObject({ prospectId: "p_parrain", type: "NOTE", summary: expect.stringContaining("« Contacté »") });
    const audit = mocks.recordAudit.mock.calls[0][0] as { action: string; platformAdminId: string; metadata: Record<string, unknown> };
    expect(audit).toMatchObject({ action: "referral.lead_status_changed", platformAdminId: "adm_1", metadata: { from: "NEW", to: "CONTACTED" } });
    expect(JSON.stringify(audit).toLowerCase()).not.toContain("pharmacie-durand");
  });

  it("Décliné, puis de nouveau Contacté (erreur corrigée) ; le même statut deux fois ne change rien", async () => {
    expect((await svc.setReferralLeadStatus("lead_1", "DECLINED", ADMIN)).ok).toBe(true);
    expect(leads()[0].status).toBe("DECLINED");
    expect(await svc.setReferralLeadStatus("lead_1", "DECLINED", ADMIN)).toMatchObject({ ok: true, changed: false });
    expect((await svc.setReferralLeadStatus("lead_1", "CONTACTED", ADMIN)).ok).toBe(true);
    expect(leads()[0].status).toBe("CONTACTED");
  });

  it("un confrère déjà rapproché (dossier ouvert) ne se change plus à la main", async () => {
    await svc.reconcileNewProspect({ id: "p_filleul", email: referee.email, name: "X" }, SITE);
    const result = await svc.setReferralLeadStatus("lead_1", "DECLINED", ADMIN);
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("déjà ouvert son dossier") });
    expect(leads()[0].status).toBe("LINKED");
  });

  it("un confrère inconnu est refusé", async () => {
    expect(await svc.setReferralLeadStatus("lead_9", "CONTACTED", ADMIN)).toEqual({ ok: false, error: "Confrère introuvable." });
  });

  it("si le confrère vient d'être rapproché entre la lecture et l'écriture, rien n'est écrasé", async () => {
    db.prisma.referralLead.findUnique.mockImplementationOnce(async () => {
      const stale = { id: "lead_1", status: "NEW", email: "x@y.fr", referrerProspectId: "p_parrain" };
      leads()[0].status = "LINKED";
      return stale as never;
    });
    const result = await svc.setReferralLeadStatus("lead_1", "DECLINED", ADMIN);
    expect(result.ok).toBe(false);
    expect(leads()[0].status).toBe("LINKED");
  });
});

describe("console : la fiche du dossier", () => {
  it("liste les confrères que ce dossier a proposés (statut, dossier rapproché) et son parrain par le confrère proposé", async () => {
    await svc.proposeReferee({ referrerProspectId: "p_parrain", referrerName: "Pharmacie du Port", referee });
    await svc.reconcileNewProspect({ id: "p_filleul", email: referee.email, name: "Pharmacie Durand" }, SITE);

    const parrain = await svc.loadReferralPanel("p_parrain");
    expect(parrain.proposed).toEqual([expect.objectContaining({ id: "lead_1", name: "Dr Durand", email: "confrere@pharmacie-durand.fr", phone: "06 12 34 56 78", status: "LINKED", linkedProspect: { id: "p_filleul", name: "Pharmacie Durand" } })]);
    expect(parrain.referredBy).toEqual({ viaLead: null, viaCode: null });

    const filleul = await svc.loadReferralPanel("p_filleul");
    expect(filleul.proposed).toEqual([]);
    expect(filleul.referredBy.viaLead).toEqual({ prospectId: "p_parrain", name: "Pharmacie du Port", pharmacyId: null });
  });

  it("un dossier qui a saisi un code de parrainage valide nomme l'officine marraine ; un code qui ne désigne personne n'invente rien", async () => {
    db.state.codes = { "PB-ABC234": { id: "ph_marraine", name: "Pharmacie Marraine" } };
    db.state.prospects[1].referralCode = "PB-ABC234";
    expect((await svc.loadReferralPanel("p_filleul")).referredBy).toEqual({ viaLead: null, viaCode: { code: "PB-ABC234", pharmacyId: "ph_marraine", name: "Pharmacie Marraine" } });
    db.state.prospects[1].referralCode = "PB-ZZZZZ9";
    expect((await svc.loadReferralPanel("p_filleul")).referredBy.viaCode).toBeNull();
  });

  it("un dossier sans parrainage : tout est vide (état vide discret côté écran)", async () => {
    expect(await svc.loadReferralPanel("p_parrain")).toEqual({ proposed: [], referredBy: { viaLead: null, viaCode: null } });
  });

  it("un statut inconnu en base est lu comme « À contacter » : jamais un écran cassé", async () => {
    await svc.proposeReferee({ referrerProspectId: "p_parrain", referrerName: "P", referee });
    leads()[0].status = "BIZARRE";
    expect((await svc.loadReferralPanel("p_parrain")).proposed[0].status).toBe("NEW");
  });
});
