import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Souscription depuis le site avec l'abonnement unique : le prix figé est celui que
 * le visiteur a VU, le contrat ne part JAMAIS tout seul (la mise en service de 290 €
 * n'existe pas dans le contrat automatique), et le confrère à parrainer est enregistré
 * sans qu'aucun message ne lui soit envoyé. Ni base, ni envoi réel : le fournisseur de
 * messagerie est simulé.
 */
const db = vi.hoisted(() => ({
  prospect: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  pharmacy: { findFirst: vi.fn() },
  plan: { findFirst: vi.fn(), findUnique: vi.fn() },
  referralLead: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  referralOffer: { findMany: vi.fn() },
  emailTemplate: { findUnique: vi.fn() },
  companyProfile: { findUnique: vi.fn() },
}));
const messaging = vi.hoisted(() => ({ sendEmail: vi.fn() }));
const notifications = vi.hoisted(() => ({ notifyAdmins: vi.fn(), notifySalesRep: vi.fn() }));
const tokens = vi.hoisted(() => ({ signPayload: vi.fn(() => "jeton-signe"), verifyPayload: vi.fn() }));
const contracts = vi.hoisted(() => ({ startContracting: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: db }));
vi.mock("@/server/audit/log", () => ({ recordAudit: vi.fn() }));
vi.mock("@/config/env", () => ({ getEnv: () => ({}) }));
vi.mock("@/server/db/advisory-lock", () => ({ withAdvisoryLock: (_key: string, fn: () => Promise<unknown>) => fn() }));
vi.mock("@/server/security/tokens", () => tokens);
vi.mock("@/server/ai/registry", () => ({ getMessagingProvider: () => messaging, getStorageProvider: vi.fn() }));
vi.mock("@/server/public-url", () => ({ publicUrl: (path: string) => `https://exemple.invalid${path}` }));
vi.mock("@/server/services/email-context", () => ({ platformEmailContext: async () => ({ baseUrl: "https://exemple.invalid", company: { legalName: "PharmaBoost SAS", address: null, siren: null, contactEmail: "contact@pharmaboost.app" } }) }));
vi.mock("@/server/services/email-dispatch", () => ({ traceDispatch: vi.fn() }));
vi.mock("@/server/services/sales/events", () => ({ recordProspectEvent: vi.fn() }));
vi.mock("@/server/services/sales/notifications", () => notifications);
vi.mock("@/server/services/sales/contracts", () => contracts);
vi.mock("@/server/services/referral", () => ({ resolveReferralCode: async () => null }));

const events = await import("@/server/services/sales/events");
const audit = await import("@/server/audit/log");
const subscriptions = await import("@/server/services/subscription-requests");

const SENT = { status: "SENT" as const, provider: "resend", detail: "Message transmis.", messageId: "msg-1" };
const request = { pharmacyName: "Pharmacie du Port", legalName: "SELARL Pharmacie du Port", siret: "73282932000074", addressLine1: "1 quai du Port", postalCode: "13002", city: "Marseille", ownerFirstName: "Marc", ownerLastName: "Delaunay", ownerTitle: "Pharmacien titulaire", ownerEmail: "marc@port.fr" };
const referee = { name: "Dr Durand", email: "Confrere@Pharmacie-Durand.fr", phone: "06 12 34 56 78" };

beforeEach(() => {
  vi.clearAllMocks();
  messaging.sendEmail.mockResolvedValue(SENT);
  db.plan.findFirst.mockResolvedValue(null); // aucune offre publiée : l'offre officielle s'affiche
  db.pharmacy.findFirst.mockResolvedValue(null);
  db.prospect.findMany.mockResolvedValue([]);
  db.prospect.create.mockResolvedValue({ id: "p-new" });
  db.referralLead.findFirst.mockResolvedValue(null);
  db.referralLead.create.mockResolvedValue({ id: "lead-1" });
  db.referralLead.updateMany.mockResolvedValue({ count: 1 });
  db.referralOffer.findMany.mockResolvedValue([]);
  db.companyProfile.findUnique.mockResolvedValue(null);
  db.emailTemplate.findUnique.mockResolvedValue(null);
});

const createdData = () => (db.prospect.create.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
const summaries = () => vi.mocked(events.recordProspectEvent).mock.calls.map((call) => (call[0] as { summary: string }).summary);
const adminNotices = () => notifications.notifyAdmins.mock.calls.map((call) => call[0] as { type: string; title: string; body: string; linkUrl?: string });
const sentTo = () => messaging.sendEmail.mock.calls.map((call) => (call[0] as { to: string }).to);

describe("souscription depuis le site : un seul abonnement, le contrat ne part jamais tout seul", () => {
  it("le dossier fige 126 € HT par mois (ce que le visiteur a vu), sans formule, et l'événement dit les conditions", async () => {
    const result = await subscriptions.requestSubscription({ ...request });

    expect(result).toMatchObject({ ok: true, outcome: { status: "RECEIVED", prospectId: "p-new" } });
    expect(createdData()).toMatchObject({ monthlyPriceCents: 12_600, origin: "SELF_SERVICE_SITE" });
    expect(createdData()).not.toHaveProperty("subscriptionFormula");
    expect(summaries().join(" ")).toContain("abonnement à 126 € HT / mois, engagement 12 mois, mise en service 290 € HT");
  });

  it("le contrat est RETENU : aucun lien de confirmation, aucun contrat lancé, l'équipe est invitée à fixer les conditions", async () => {
    await subscriptions.requestSubscription({ ...request });

    expect(tokens.signPayload).not.toHaveBeenCalled();
    expect(contracts.startContracting).not.toHaveBeenCalled();
    const blocked = adminNotices().find((n) => n.type === "DOSSIER_BLOCKED");
    expect(blocked).toMatchObject({ title: "Contrat retenu — Pharmacie du Port", linkUrl: "/admin/dossiers/p-new" });
    expect(blocked?.body).toContain("la mise en service de 290 € HT n'est pas prévue au contrat automatique");
    expect(blocked?.body).toContain("« Envoyer le contrat »");
    expect(blocked?.body).toContain("engagement de 12 mois");
  });

  it("le seul message qui part est l'accusé de réception au signataire : pas de confirmation d'adresse, pas de contrat", async () => {
    await subscriptions.requestSubscription({ ...request });
    expect(messaging.sendEmail).toHaveBeenCalledTimes(1);
    expect(sentTo()).toEqual(["marc@port.fr"]);
    expect((messaging.sendEmail.mock.calls[0][0] as { subject: string }).subject).not.toMatch(/confirm/i);
  });

  it("le prix du dossier est celui que le visiteur a VU, pas celui d'une offre plus ancienne de la console", async () => {
    // Offre par défaut INCOMPLÈTE (ancien tarif, pas de mise en service) : le site affichait l'offre officielle, le dossier fige 126 €.
    db.plan.findFirst.mockResolvedValue({ id: "plan-old", name: "Ancienne offre", monthlyPriceCents: 12_900, setupFeeCents: null, trialDays: 0, isActive: true });
    await subscriptions.requestSubscription({ ...request });
    expect(createdData().monthlyPriceCents).toBe(12_600);
  });

  it("une offre de la console COMPLÈTE est celle qui s'affiche : son prix est figé, et la retenue cite SA mise en service", async () => {
    db.plan.findFirst.mockResolvedValue({ id: "plan-1", name: "Offre d'automne", monthlyPriceCents: 13_900, setupFeeCents: 31_000, trialDays: 0, isActive: true });
    await subscriptions.requestSubscription({ ...request });
    expect(createdData()).toMatchObject({ monthlyPriceCents: 13_900, planId: "plan-1" });
    const blocked = adminNotices().find((n) => n.type === "DOSSIER_BLOCKED");
    expect(blocked?.body).toContain("mise en service de 310 € HT");
    expect(summaries().join(" ")).toContain("139 € HT / mois");
    expect(summaries().join(" ")).toContain("mise en service 310 € HT");
  });

  it("la retenue vaut pour TOUTE nouvelle demande, même si la console publie une mise en service à 0 €", async () => {
    db.plan.findFirst.mockResolvedValue({ id: "plan-2", name: "Sans frais", monthlyPriceCents: 12_600, setupFeeCents: 0, trialDays: 0, isActive: true });
    const result = await subscriptions.requestSubscription({ ...request });
    expect(result).toMatchObject({ ok: true, outcome: { status: "RECEIVED" } });
    expect(tokens.signPayload).not.toHaveBeenCalled();
    expect(adminNotices().some((n) => n.type === "DOSSIER_BLOCKED")).toBe(true);
  });

  it("un dossier proche qui a déjà un contrat en cours est signalé dans la retenue", async () => {
    // Première lecture : les dossiers de ce SIRET (aucun) ; seconde : les dossiers proches (même e-mail).
    db.prospect.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "p-old", name: "Pharmacie du Port", email: "marc@port.fr", siret: null, postalCode: "13002", contracts: [{ status: "SENT" }] }]);
    await subscriptions.requestSubscription({ ...request });
    expect(adminNotices().some((n) => n.type === "DUPLICATE_SUSPECTED")).toBe(true);
    expect(adminNotices().find((n) => n.type === "DOSSIER_BLOCKED")?.body).toContain("contrat en cours ou signé");
  });

  it("une offre cochée qui n'est plus proposée : retenue, avec son propre message", async () => {
    db.plan.findFirst.mockResolvedValue(null);
    const result = await subscriptions.requestSubscription({ ...request, planId: "plan-disparu" });
    expect(result).toMatchObject({ ok: true, outcome: { status: "RECEIVED", reason: "offre indisponible" } });
    expect(adminNotices().find((n) => n.type === "DOSSIER_BLOCKED")?.body).toContain("n'est plus proposée");
  });

  it("un SIRET déjà connu : rien n'est créé ni modifié, aucun contrat", async () => {
    db.prospect.findMany.mockResolvedValue([{ id: "p-existant", name: "Pharmacie du Port", salesRepId: null }]);
    const result = await subscriptions.requestSubscription({ ...request });
    expect(result).toMatchObject({ ok: true, outcome: { status: "RECEIVED", prospectId: "p-existant", reason: "SIRET déjà connu" } });
    expect(db.prospect.create).not.toHaveBeenCalled();
    expect(contracts.startContracting).not.toHaveBeenCalled();
  });
});

describe("l'ancien lien de confirmation d'adresse ne fait plus partir le contrat", () => {
  it("l'adresse est notée, l'équipe prévenue ; le titulaire apprend que son contrat est en préparation ; aucun contrat ne part", async () => {
    tokens.verifyPayload.mockReturnValue({ p: "p-1", e: "marc@port.fr" });
    db.prospect.findUnique.mockResolvedValue({ id: "p-1", name: "Pharmacie du Port", email: "Marc@Port.fr", origin: "SELF_SERVICE_SITE", blockedAt: null });
    const result = await subscriptions.confirmSubscription("jeton");
    expect(result).toEqual({ ok: false, error: expect.stringContaining("Votre adresse est confirmée") });
    expect(contracts.startContracting).not.toHaveBeenCalled();
    expect(summaries().join(" ")).toContain("Adresse e-mail confirmée");
    expect(adminNotices().find((n) => n.type === "DOSSIER_BLOCKED")?.body).toContain("« Envoyer le contrat »");
  });

  it("un lien invalide, ou qui ne correspond plus au dossier, ne note rien", async () => {
    tokens.verifyPayload.mockReturnValue(null);
    expect(await subscriptions.confirmSubscription("faux")).toMatchObject({ ok: false, error: expect.stringContaining("pas valide") });
    tokens.verifyPayload.mockReturnValue({ p: "p-1", e: "autre@port.fr" });
    db.prospect.findUnique.mockResolvedValue({ id: "p-1", name: "X", email: "marc@port.fr", origin: "SELF_SERVICE_SITE", blockedAt: null });
    expect(await subscriptions.confirmSubscription("jeton")).toMatchObject({ ok: false, error: expect.stringContaining("ne correspond plus") });
    expect(vi.mocked(events.recordProspectEvent)).not.toHaveBeenCalled();
    expect(notifications.notifyAdmins).not.toHaveBeenCalled();
  });
});

describe("le confrère à parrainer, saisi à l'inscription", () => {
  it("un nouveau dossier crée la fiche du confrère (NEW), un événement, une notification à l'équipe et un audit sans donnée personnelle", async () => {
    const result = await subscriptions.requestSubscription({ ...request, referee });

    expect(result).toMatchObject({ ok: true, outcome: { status: "RECEIVED", prospectId: "p-new" } });
    expect(db.referralLead.create).toHaveBeenCalledTimes(1);
    expect(db.referralLead.create.mock.calls[0][0]).toMatchObject({ data: { referrerProspectId: "p-new", contactName: "Dr Durand", email: "confrere@pharmacie-durand.fr", phone: "06 12 34 56 78", status: "NEW" } });
    expect(summaries()).toContain("Confrère proposé au parrainage : Dr Durand · confrere@pharmacie-durand.fr · 06 12 34 56 78");
    const notice = adminNotices().find((n) => n.type === "REFERRAL_LEAD");
    expect(notice).toMatchObject({ linkUrl: "/admin/dossiers/p-new" });
    const referralAudit = vi.mocked(audit.recordAudit).mock.calls.map((c) => c[0] as { action: string; metadata?: Record<string, unknown> }).find((a) => a.action === "referral.lead_proposed");
    expect(referralAudit?.metadata).toEqual({ referrerProspectId: "p-new" });
    expect(JSON.stringify(referralAudit).toLowerCase()).not.toContain("durand");
  });

  it("AUCUN e-mail ni SMS n'est envoyé à la personne parrainée : l'équipe la contacte", async () => {
    await subscriptions.requestSubscription({ ...request, referee });
    expect(sentTo()).not.toContain("confrere@pharmacie-durand.fr");
    expect(sentTo().every((to) => to === "marc@port.fr")).toBe(true);
    expect(sentTo()).toHaveLength(1);
  });

  it("sans confrère indiqué : aucune fiche, aucune notification de parrainage", async () => {
    await subscriptions.requestSubscription({ ...request });
    expect(db.referralLead.create).not.toHaveBeenCalled();
    expect(adminNotices().some((n) => n.type === "REFERRAL_LEAD")).toBe(false);
    expect((await subscriptions.requestSubscription({ ...request, siret: "73282932000074", referee: null })).ok).toBe(true);
    expect(db.referralLead.create).not.toHaveBeenCalled();
  });

  it("pour un SIRET DÉJÀ CONNU, le confrère n'est pas enregistré, et ses coordonnées ne sont recopiées nulle part", async () => {
    db.prospect.findMany.mockResolvedValue([{ id: "p-existant", name: "Pharmacie du Port", salesRepId: null }]);
    await subscriptions.requestSubscription({ ...request, referee });
    expect(db.referralLead.create).not.toHaveBeenCalled();
    expect(summaries().join(" ")).toContain("Un confrère à parrainer était indiqué : il n'a pas été enregistré");
    const everything = JSON.stringify([vi.mocked(events.recordProspectEvent).mock.calls, notifications.notifyAdmins.mock.calls, notifications.notifySalesRep.mock.calls]).toLowerCase();
    for (const personal of ["durand", "confrere@", "06 12 34 56 78"]) expect(everything).not.toContain(personal.toLowerCase());
  });

  it("une panne à l'enregistrement du confrère ne perd ni la demande ni la saisie : l'équipe reçoit les coordonnées à enregistrer à la main", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    db.referralLead.create.mockRejectedValue(new Error("base indisponible"));
    const result = await subscriptions.requestSubscription({ ...request, referee });
    expect(result).toMatchObject({ ok: true, outcome: { status: "RECEIVED", prospectId: "p-new" } });
    expect(adminNotices().find((n) => n.title.startsWith("Confrère à enregistrer à la main"))?.body).toContain("confrere@pharmacie-durand.fr");
    // L'accusé de réception et la retenue du contrat suivent leur cours.
    expect(adminNotices().some((n) => n.type === "DOSSIER_BLOCKED")).toBe(true);
    expect(sentTo()).toEqual(["marc@port.fr"]);
    spy.mockRestore();
  });

  it("le nouveau dossier est d'abord rapproché d'un confrère qu'une autre officine avait proposé (même e-mail, casse ignorée)", async () => {
    db.referralLead.findFirst.mockResolvedValue({ id: "lead-9", referrerProspectId: "p-parrain", referrerProspect: { name: "Pharmacie du Centre" } });
    await subscriptions.requestSubscription({ ...request, ownerEmail: "MARC@Port.fr" });
    expect(db.referralLead.findFirst.mock.calls[0][0]).toMatchObject({ where: { email: { equals: "marc@port.fr", mode: "insensitive" }, status: { in: ["NEW", "CONTACTED"] }, referredProspectId: null } });
    expect(db.referralLead.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "lead-9" }), data: { referredProspectId: "p-new", status: "LINKED" } }));
    expect(summaries().some((s) => s.includes("Pharmacie du Centre"))).toBe(true);
  });
});

describe("le confrère : validation à l'inscription", () => {
  const refused = async (overrides: Record<string, unknown>) => {
    const result = await subscriptions.requestSubscription({ ...request, referee: { ...referee, ...overrides } } as never);
    if (result.ok) throw new Error("Demande acceptée à tort.");
    expect(db.prospect.create).not.toHaveBeenCalled();
    expect(db.referralLead.create).not.toHaveBeenCalled();
    return result.errors;
  };

  it("une adresse e-mail invalide est refusée, en français, sur le champ du confrère", async () => {
    expect(await refused({ email: "pas-un-mail" })).toEqual({ "referee.email": "Cette adresse e-mail n'est pas valide." });
    expect(await refused({ email: "" })).toHaveProperty(["referee.email"]);
  });

  it("un téléphone invalide ou absent est refusé", async () => {
    expect(await refused({ phone: "12" })).toEqual({ "referee.phone": "Ce numéro de téléphone n'est pas valide." });
    expect(await refused({ phone: "" })).toHaveProperty(["referee.phone"]);
  });

  it("l'adresse du signataire est refusée (« un confrère, pas vous-même »), quelle que soit la casse", async () => {
    expect(await refused({ email: "marc@port.fr" })).toEqual({ "referee.email": "Indiquez un confrère, pas vous-même." });
    expect(await refused({ email: "  MARC@Port.FR " })).toEqual({ "referee.email": "Indiquez un confrère, pas vous-même." });
  });

  it("les deux erreurs reviennent ensemble, avec celles du reste du formulaire", async () => {
    const result = await subscriptions.requestSubscription({ ...request, siret: "123", referee: { name: null, email: "x", phone: "1" } });
    expect(result).toEqual({ ok: false, errors: expect.objectContaining({ siret: expect.any(String), "referee.email": expect.any(String), "referee.phone": expect.any(String) }) });
  });

  it("un nom de plus de 120 caractères est refusé ; un nom vide est accepté (facultatif)", async () => {
    expect(await refused({ name: "x".repeat(121) })).toEqual({ "referee.name": "120 caractères au plus." });
    const accepted = await subscriptions.requestSubscription({ ...request, referee: { ...referee, name: "   " } });
    expect(accepted.ok).toBe(true);
    expect(db.referralLead.create.mock.calls[0][0]).toMatchObject({ data: { contactName: null } });
  });
});
