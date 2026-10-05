import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * À qui s'adresse une campagne : les filtres posés en base (officines non
 * démo et actives, partenaires ni archivés ni suspendus, candidatures jamais
 * refusées), le dédoublonnage par adresse, l'exclusion des désinscrits par
 * empreinte — l'adresse en clair ne sort jamais d'ici vers la liste.
 */

const db = vi.hoisted(() => ({
  pharmacies: [] as unknown[],
  partners: [] as unknown[],
  applications: [] as unknown[],
  optOuts: new Set<string>(),
  prisma: {
    pharmacy: { findMany: vi.fn() },
    partner: { findMany: vi.fn() },
    partnerApplication: { findMany: vi.fn(), findUnique: vi.fn() },
    partnerContact: { findUnique: vi.fn() },
    marketingOptOut: { findMany: vi.fn() },
  },
  ensureReferralCode: vi.fn(),
  pharmacyRecipient: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/config/env", () => ({ getEnv: () => ({ AUTH_SESSION_SECRET: "s".repeat(48), DATA_ENCRYPTION_KEY: "k".repeat(32) }) }));
vi.mock("@/server/db/client", () => ({ prisma: db.prisma }));
vi.mock("@/server/public-url", () => ({ publicUrl: (path: string) => `https://pharmaboost.test${path}` }));
vi.mock("@/server/services/referral", () => ({ ensureReferralCode: db.ensureReferralCode }));
vi.mock("../outbound-email", () => ({ pharmacyRecipient: db.pharmacyRecipient }));

const { resolveAudience, recipientValues } = await import("../campaign-audience");
const { hashEmail } = await import("@/server/security/tokens");

type PharmacyRow = { id: string; name: string; email: string | null; memberships: { user: { email: string } }[] };
const pharmacy = (n: number, overrides: Partial<PharmacyRow> = {}): PharmacyRow => ({ id: `ph_${n}`, name: `Pharmacie ${n}`, email: `contact${n}@officine.fr`, memberships: [{ user: { email: `titulaire${n}@officine.fr` } }], ...overrides });

const lastWhere = (mock: { mock: { calls: unknown[][] } }) => (mock.mock.calls.at(-1)?.[0] as { where: Record<string, unknown> }).where;

beforeEach(() => {
  vi.resetAllMocks();
  db.optOuts = new Set();
  db.prisma.pharmacy.findMany.mockImplementation(async () => db.pharmacies);
  db.prisma.partner.findMany.mockImplementation(async () => db.partners);
  db.prisma.partnerApplication.findMany.mockImplementation(async () => db.applications);
  db.prisma.marketingOptOut.findMany.mockImplementation(async ({ where }: { where: { emailHash: { in: string[] } } }) => where.emailHash.in.filter((h) => db.optOuts.has(h)).map((emailHash) => ({ emailHash })));
  db.pharmacies = [];
  db.partners = [];
  db.applications = [];
});

describe("officines : qui, et à quelle adresse", () => {
  it("toutes les officines actives, hors démonstration : le filtre est posé en base", async () => {
    db.pharmacies = [pharmacy(1), pharmacy(2)];
    const result = await resolveAudience("pharmacies.all_active", {});
    expect(lastWhere(db.prisma.pharmacy.findMany)).toEqual({ isDemo: false, isActive: true });
    expect(result.recipients.map((r) => r.targetId)).toEqual(["ph_1", "ph_2"]);
    expect(result.recipients[0]).toEqual({ targetType: "PHARMACY", targetId: "ph_1", pharmacyId: "ph_1", partnerId: null, email: "titulaire1@officine.fr", name: "Pharmacie 1" });
  });

  it("le titulaire actif d'abord (lu comme pharmacyRecipient), à défaut l'e-mail de l'officine ; l'adresse est mise en minuscules", async () => {
    db.pharmacies = [pharmacy(1, { memberships: [{ user: { email: "Titulaire.Un@Officine.FR" } }] }), pharmacy(2, { memberships: [], email: "Accueil@Officine2.fr" })];
    const { recipients } = await resolveAudience("pharmacies.all_active", {});
    expect(recipients.map((r) => r.email)).toEqual(["titulaire.un@officine.fr", "accueil@officine2.fr"]);
    const select = (db.prisma.pharmacy.findMany.mock.calls[0][0] as { select: { memberships: { where: unknown; take: number } } }).select;
    expect(select.memberships).toMatchObject({ where: { role: "OWNER", isActive: true, user: { deletedAt: null } }, take: 1 });
  });

  it("sans adresse exploitable, l'officine est comptée à part, jamais contactée", async () => {
    db.pharmacies = [pharmacy(1, { memberships: [], email: null }), pharmacy(2, { memberships: [], email: "pas-une-adresse" }), pharmacy(3, { memberships: [{ user: { email: "" } }], email: "" }), pharmacy(4)];
    const result = await resolveAudience("pharmacies.all_active", {});
    expect(result.recipients.map((r) => r.targetId)).toEqual(["ph_4"]);
    expect(result.excluded).toEqual({ optedOut: 0, noEmail: 3, duplicates: 0 });
  });

  it("une adresse = un destinataire : le premier garde l'adresse, les autres sont comptés comme doublons", async () => {
    db.pharmacies = [pharmacy(1, { memberships: [{ user: { email: "groupe@officine.fr" } }] }), pharmacy(2, { memberships: [{ user: { email: "GROUPE@officine.fr" } }] }), pharmacy(3, { memberships: [{ user: { email: " groupe@officine.fr " } }] }), pharmacy(4)];
    const result = await resolveAudience("pharmacies.all_active", {});
    expect(result.recipients.map((r) => r.targetId)).toEqual(["ph_1", "ph_4"]);
    expect(result.excluded.duplicates).toBe(2);
  });

  it("les segments : essai, abonnées (actif), sans filleul, choisies", async () => {
    await resolveAudience("pharmacies.trialing", {});
    expect(lastWhere(db.prisma.pharmacy.findMany)).toEqual({ isDemo: false, isActive: true, organization: { subscription: { status: "TRIALING" } } });
    await resolveAudience("pharmacies.subscribed", {});
    expect(lastWhere(db.prisma.pharmacy.findMany)).toEqual({ isDemo: false, isActive: true, organization: { subscription: { status: "ACTIVE" } } });
    await resolveAudience("pharmacies.without_referrals", {});
    expect(lastWhere(db.prisma.pharmacy.findMany)).toEqual({ isDemo: false, isActive: true, referrals: { none: {} } });
    await resolveAudience("pharmacies.selected", { pharmacyIds: ["ph_7", "ph_9"] });
    expect(lastWhere(db.prisma.pharmacy.findMany)).toEqual({ isDemo: false, isActive: true, id: { in: ["ph_7", "ph_9"] } });
  });

  it("une sélection vide ne ramène personne : jamais « toutes les officines » par défaut", async () => {
    await resolveAudience("pharmacies.selected", {});
    expect(lastWhere(db.prisma.pharmacy.findMany)).toMatchObject({ id: { in: [] } });
    await resolveAudience("pharmacies.selected", { partnerIds: ["pa_1"] });
    expect(lastWhere(db.prisma.pharmacy.findMany)).toMatchObject({ id: { in: [] } });
  });

  it("même une officine choisie à la main reste filtrée : démonstration et officine inactive exclues", async () => {
    await resolveAudience("pharmacies.selected", { pharmacyIds: ["ph_demo"] });
    expect(lastWhere(db.prisma.pharmacy.findMany)).toMatchObject({ isDemo: false, isActive: true });
  });
});

describe("désinscrits : par empreinte, jamais l'adresse", () => {
  it("écarte les désinscrits (casse comprise), les garde à part, et ne passe que des empreintes à la base", async () => {
    db.pharmacies = [pharmacy(1), pharmacy(2), pharmacy(3)];
    db.optOuts.add(hashEmail("TITULAIRE2@officine.FR"));
    const result = await resolveAudience("pharmacies.all_active", {});
    expect(result.recipients.map((r) => r.targetId)).toEqual(["ph_1", "ph_3"]);
    expect(result.optedOut.map((r) => r.targetId)).toEqual(["ph_2"]);
    expect(result.excluded).toEqual({ optedOut: 1, noEmail: 0, duplicates: 0 });
    const args = JSON.stringify(db.prisma.marketingOptOut.findMany.mock.calls);
    expect(args).not.toContain("@");
    expect(args).toContain(hashEmail("titulaire1@officine.fr"));
  });

  it("une adresse en double ET désinscrite n'est comptée que comme doublon, une seule fois", async () => {
    db.pharmacies = [pharmacy(1, { memberships: [{ user: { email: "a@officine.fr" } }] }), pharmacy(2, { memberships: [{ user: { email: "a@officine.fr" } }] })];
    db.optOuts.add(hashEmail("a@officine.fr"));
    const result = await resolveAudience("pharmacies.all_active", {});
    expect(result.recipients).toHaveLength(0);
    expect(result.excluded).toEqual({ optedOut: 1, noEmail: 0, duplicates: 1 });
  });

  it("la liste est interrogée par lots de 1 000 empreintes", async () => {
    db.pharmacies = Array.from({ length: 2500 }, (_, i) => pharmacy(i + 1));
    const result = await resolveAudience("pharmacies.all_active", {});
    expect(result.recipients).toHaveLength(2500);
    expect(db.prisma.marketingOptOut.findMany).toHaveBeenCalledTimes(3);
    const sizes = db.prisma.marketingOptOut.findMany.mock.calls.map((call) => (call[0] as { where: { emailHash: { in: string[] } } }).where.emailHash.in.length);
    expect(sizes).toEqual([1000, 1000, 500]);
  });

  it("un public vide n'interroge pas la liste inutilement", async () => {
    await resolveAudience("pharmacies.all_active", {});
    expect(db.prisma.marketingOptOut.findMany).not.toHaveBeenCalled();
  });
});

describe("partenaires et candidatures", () => {
  const partner = (n: number, contacts: { id: string; firstName: string; lastName: string; email: string | null }[]) => ({ id: `pa_${n}`, contacts });

  it("jamais un partenaire archivé ou suspendu ; sans marque ou choisis, le filtre est posé en base", async () => {
    await resolveAudience("partners.contacts", {});
    expect(lastWhere(db.prisma.partner.findMany)).toEqual({ status: { notIn: ["ARCHIVED", "SUSPENDED"] } });
    await resolveAudience("partners.without_brand", {});
    expect(lastWhere(db.prisma.partner.findMany)).toEqual({ status: { notIn: ["ARCHIVED", "SUSPENDED"] }, brands: { none: {} } });
    await resolveAudience("partners.selected", { partnerIds: ["pa_1"] });
    expect(lastWhere(db.prisma.partner.findMany)).toEqual({ status: { notIn: ["ARCHIVED", "SUSPENDED"] }, id: { in: ["pa_1"] } });
    await resolveAudience("partners.selected", {});
    expect(lastWhere(db.prisma.partner.findMany)).toMatchObject({ id: { in: [] } });
  });

  it("un destinataire par contact avec une adresse ; le principal passe en premier (tri en base)", async () => {
    db.partners = [
      partner(1, [
        { id: "pc_1", firstName: "Claire", lastName: "Martin", email: "Claire@labo.fr" },
        { id: "pc_2", firstName: "Paul", lastName: "Durand", email: null },
        { id: "pc_3", firstName: "Zoé", lastName: "Petit", email: "pas-une-adresse" },
      ]),
      partner(2, [{ id: "pc_4", firstName: "Hugo", lastName: "Roux", email: "hugo@autre-labo.fr" }]),
    ];
    const result = await resolveAudience("partners.contacts", {});
    expect(result.recipients).toEqual([
      { targetType: "PARTNER_CONTACT", targetId: "pc_1", pharmacyId: null, partnerId: "pa_1", email: "claire@labo.fr", name: "Claire Martin" },
      { targetType: "PARTNER_CONTACT", targetId: "pc_4", pharmacyId: null, partnerId: "pa_2", email: "hugo@autre-labo.fr", name: "Hugo Roux" },
    ]);
    expect((db.prisma.partner.findMany.mock.calls[0][0] as { select: { contacts: { orderBy: unknown } } }).select.contacts.orderBy).toEqual([{ isPrimary: "desc" }, { createdAt: "asc" }]);
  });

  it("un partenaire sans aucune adresse exploitable est compté à part", async () => {
    db.partners = [partner(1, []), partner(2, [{ id: "pc_1", firstName: "A", lastName: "B", email: null }]), partner(3, [{ id: "pc_2", firstName: "C", lastName: "D", email: "c@labo.fr" }])];
    const result = await resolveAudience("partners.without_brand", {});
    expect(result.recipients.map((r) => r.targetId)).toEqual(["pc_2"]);
    expect(result.excluded.noEmail).toBe(2);
  });

  it("un contact en double chez deux partenaires n'écrit qu'une fois ; un désinscrit est écarté", async () => {
    db.partners = [partner(1, [{ id: "pc_1", firstName: "A", lastName: "B", email: "shared@labo.fr" }]), partner(2, [{ id: "pc_2", firstName: "A", lastName: "B", email: "SHARED@labo.fr" }, { id: "pc_3", firstName: "C", lastName: "D", email: "out@labo.fr" }])];
    db.optOuts.add(hashEmail("out@labo.fr"));
    const result = await resolveAudience("partners.contacts", {});
    expect(result.recipients.map((r) => r.targetId)).toEqual(["pc_1"]);
    expect(result.excluded).toEqual({ optedOut: 1, noEmail: 0, duplicates: 1 });
  });

  it("candidatures en cours : nouvelle, en étude, contactée, en négociation ; jamais refusée, ni déjà partenaire", async () => {
    db.applications = [
      { id: "ap_1", partnerId: null, email: "Claire@Labo.fr", contactFirstName: "Claire", contactLastName: "Martin" },
      { id: "ap_2", partnerId: "pa_9", email: "", contactFirstName: "Paul", contactLastName: "Durand" },
    ];
    const result = await resolveAudience("partners.applications_open", {});
    expect(lastWhere(db.prisma.partnerApplication.findMany)).toEqual({ status: { in: ["NEW", "REVIEWING", "CONTACTED", "NEGOTIATION"] } });
    expect(JSON.stringify(lastWhere(db.prisma.partnerApplication.findMany))).not.toMatch(/REFUSED|ACCEPTED|ACTIVE_PARTNER/);
    expect(result.recipients).toEqual([{ targetType: "PARTNER_APPLICATION", targetId: "ap_1", pharmacyId: null, partnerId: null, email: "claire@labo.fr", name: "Claire Martin" }]);
    expect(result.excluded.noEmail).toBe(1);
    expect(db.prisma.partner.findMany).not.toHaveBeenCalled();
  });
});

describe("valeurs d'un destinataire au moment de l'envoi", () => {
  const recipient = { targetType: "PHARMACY", targetId: "ph_1", pharmacyId: "ph_1", name: "Pharmacie 1" };

  it("officine : prénom, nom, officine, contact, lien ; le code de parrainage n'est créé que si le texte le demande", async () => {
    db.pharmacyRecipient.mockResolvedValue({ email: "t@officine.fr", firstName: "Camille", fullName: "Camille Martin", pharmacyId: "ph_1", organizationId: "org_1", prospectId: null, pharmacyName: "Pharmacie du Port" });
    const plain = await recipientValues(recipient, { wantsReferralCode: false });
    expect(plain).toEqual({ prenom: "Camille", titulaire: "Camille Martin", officine: "Pharmacie du Port", contact: "Contact@pharmaboost.app", lien_espace: "https://pharmaboost.test/parametres?onglet=abonnement" });
    expect(db.ensureReferralCode).not.toHaveBeenCalled();

    db.ensureReferralCode.mockResolvedValue("PB-AB23CD");
    const withCode = await recipientValues(recipient, { wantsReferralCode: true });
    expect(db.ensureReferralCode).toHaveBeenCalledWith("ph_1");
    expect(withCode).toMatchObject({ code_parrainage: "PB-AB23CD", lien_parrainage: "https://pharmaboost.test/decouvrir/abonnement?parrain=PB-AB23CD" });
  });

  it("officine introuvable ou sans titulaire : les valeurs inconnues restent vides, jamais inventées", async () => {
    db.pharmacyRecipient.mockResolvedValue(null);
    expect(await recipientValues(recipient, { wantsReferralCode: false })).toMatchObject({ prenom: "", titulaire: "", officine: "Pharmacie 1" });
    db.pharmacyRecipient.mockResolvedValue({ email: "x@officine.fr", firstName: null, fullName: null, pharmacyId: "ph_1", organizationId: null, prospectId: null, pharmacyName: "Pharmacie du Port" });
    expect(await recipientValues(recipient, { wantsReferralCode: false })).toMatchObject({ prenom: "", titulaire: "", officine: "Pharmacie du Port" });
  });

  it("contact de partenaire : prénom et nom du partenaire, lien de candidature", async () => {
    db.prisma.partnerContact.findUnique.mockResolvedValue({ firstName: "Claire", partner: { name: "Laboratoire Test" } });
    const values = await recipientValues({ targetType: "PARTNER_CONTACT", targetId: "pc_1", pharmacyId: null, name: "Claire Martin" }, { wantsReferralCode: false });
    expect(values).toEqual({ contact: "Contact@pharmaboost.app", lien_candidature: "https://pharmaboost.test/decouvrir/partenaires", prenom: "Claire", nom_partenaire: "Laboratoire Test" });
    expect(db.prisma.partnerContact.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "pc_1" } }));
  });

  it("candidature : prénom du candidat et société ; un contact supprimé depuis laisse les valeurs vides", async () => {
    db.prisma.partnerApplication.findUnique.mockResolvedValue({ contactFirstName: "Paul", company: "Société Test" });
    expect(await recipientValues({ targetType: "PARTNER_APPLICATION", targetId: "ap_1", pharmacyId: null, name: "Paul Durand" }, { wantsReferralCode: false })).toMatchObject({ prenom: "Paul", nom_partenaire: "Société Test" });
    db.prisma.partnerContact.findUnique.mockResolvedValue(null);
    expect(await recipientValues({ targetType: "PARTNER_CONTACT", targetId: "pc_x", pharmacyId: null, name: null }, { wantsReferralCode: false })).toMatchObject({ prenom: "", nom_partenaire: "" });
  });
});
