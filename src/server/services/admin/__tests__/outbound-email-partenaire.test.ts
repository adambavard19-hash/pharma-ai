import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Le destinataire d'un partenaire et la trace de l'e-mail qui lui part : aucun
 * rattachement à une officine, une organisation ou un dossier. Base et
 * messagerie simulées.
 */

type PartnerRow = {
  name: string;
  contacts: { email: string | null; firstName: string; lastName: string }[];
  applications: { email: string; contactFirstName: string; contactLastName: string }[];
};

const db = vi.hoisted(() => ({
  partner: { findUnique: vi.fn<(args: unknown) => Promise<unknown>>() },
  subscription: { findUnique: vi.fn(async () => null) },
}));
const mocks = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  traceDispatch: vi.fn(),
  renderTemplate: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: db }));
vi.mock("@/server/ai/registry", () => ({ getMessagingProvider: () => ({ sendEmail: mocks.sendEmail }) }));
vi.mock("@/server/public-url", () => ({ publicUrl: (path: string) => `https://pharmaboost.test${path}` }));
vi.mock("@/server/services/email-dispatch", () => ({ traceDispatch: mocks.traceDispatch }));
vi.mock("../email-templates", () => ({ renderTemplate: mocks.renderTemplate }));

const { partnerRecipient, templateValuesFor, sendTemplatedEmail } = await import("../outbound-email");

const partner = (overrides: Partial<PartnerRow> = {}): PartnerRow => ({ name: "Laboratoires Exemple", contacts: [], applications: [], ...overrides });
const contact = (email: string | null, firstName = "Claire", lastName = "Durand") => ({ email, firstName, lastName });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("partnerRecipient : à qui écrire chez un partenaire", () => {
  it("le contact principal d'abord (la base les rend triés : principal, puis le plus ancien)", async () => {
    db.partner.findUnique.mockResolvedValue(partner({ contacts: [contact("principal@labo.fr", "Paul", "Principal"), contact("autre@labo.fr", "Anne", "Autre")] }));
    const recipient = await partnerRecipient("pa_1");
    expect(recipient).toEqual({ email: "principal@labo.fr", firstName: "Paul", fullName: "Paul Principal", pharmacyId: null, organizationId: null, prospectId: null, pharmacyName: "Laboratoires Exemple" });
    const query = db.partner.findUnique.mock.calls[0][0] as { where: { id: string }; select: { contacts: { orderBy: unknown } } };
    expect(query.where).toEqual({ id: "pa_1" });
    expect(query.select.contacts.orderBy).toEqual([{ isPrimary: "desc" }, { createdAt: "asc" }]);
  });

  it("le contact principal sans adresse (ou avec une adresse invalide) laisse la place au premier contact qui en a une", async () => {
    db.partner.findUnique.mockResolvedValue(partner({ contacts: [contact(null, "Paul", "Principal"), contact("pas une adresse", "Zoé", "Zéro"), contact("Anne.Autre@Labo.fr", "Anne", "Autre")] }));
    const recipient = await partnerRecipient("pa_1");
    expect(recipient).toMatchObject({ email: "anne.autre@labo.fr", firstName: "Anne", fullName: "Anne Autre" });
  });

  it("sans contact utilisable, l'adresse de la candidature liée", async () => {
    db.partner.findUnique.mockResolvedValue(partner({ contacts: [contact(null)], applications: [{ email: "candidature@labo.fr", contactFirstName: "Marc", contactLastName: "Candidat" }] }));
    expect(await partnerRecipient("pa_1")).toMatchObject({ email: "candidature@labo.fr", firstName: "Marc", fullName: "Marc Candidat", pharmacyId: null, organizationId: null, prospectId: null });
    expect((db.partner.findUnique.mock.calls[0][0] as { select: { applications: { take: number } } }).select.applications.take).toBe(1);
  });

  it("un contact avec adresse l'emporte sur la candidature", async () => {
    db.partner.findUnique.mockResolvedValue(partner({ contacts: [contact("contact@labo.fr")], applications: [{ email: "candidature@labo.fr", contactFirstName: "Marc", contactLastName: "Candidat" }] }));
    expect((await partnerRecipient("pa_1"))?.email).toBe("contact@labo.fr");
  });

  it("rien : ni contact avec adresse, ni candidature — `null`, jamais une adresse inventée", async () => {
    db.partner.findUnique.mockResolvedValue(partner({ contacts: [contact(null), contact("   ")] }));
    expect(await partnerRecipient("pa_1")).toBeNull();
    db.partner.findUnique.mockResolvedValue(partner({ contacts: [], applications: [{ email: "invalide", contactFirstName: "A", contactLastName: "B" }] }));
    expect(await partnerRecipient("pa_1")).toBeNull();
  });

  it("partenaire inconnu : `null`", async () => {
    db.partner.findUnique.mockResolvedValue(null);
    expect(await partnerRecipient("pa_absent")).toBeNull();
  });

  it("un prénom vide reste vide (le modèle ne dit pas « Bonjour undefined »)", async () => {
    db.partner.findUnique.mockResolvedValue(partner({ contacts: [contact("contact@labo.fr", "  ", "Durand")] }));
    expect(await partnerRecipient("pa_1")).toMatchObject({ firstName: null, fullName: "Durand" });
  });
});

describe("e-mail à un partenaire : valeurs et trace", () => {
  const recipient = { email: "claire@labo.fr", firstName: "Claire", fullName: "Claire Durand", pharmacyId: null, organizationId: null, prospectId: null, pharmacyName: "Laboratoires Exemple" };

  it("le lien vers le formulaire de référencement est fourni, et aucune lecture d'abonnement n'est faite", async () => {
    const values = await templateValuesFor(recipient, { nom_partenaire: "Laboratoires Exemple" });
    expect(values).toMatchObject({ prenom: "Claire", nom_partenaire: "Laboratoires Exemple", lien_candidature: "https://pharmaboost.test/decouvrir/partenaires" });
    expect(db.subscription.findUnique).not.toHaveBeenCalled();
    expect(values.offre).toBeUndefined();
    expect(values.prix).toBeUndefined();
  });

  it("l'e-mail est tracé sans officine, organisation ni dossier, avec la règle à l'origine", async () => {
    mocks.renderTemplate.mockResolvedValue({ subject: "Référencer votre gamme", text: "texte", html: "<p>texte</p>" });
    mocks.sendEmail.mockResolvedValue({ status: "SENT", provider: "test", detail: "Remis au prestataire." });
    mocks.traceDispatch.mockResolvedValue({ id: "ed_1" });
    const sent = await sendTemplatedEmail({ templateKey: "partner.range_invitation", recipient, values: { prenom: "Claire" }, trigger: "AUTOMATIC", ruleKey: "partner.range_invitation", adminId: null });
    expect(sent).toMatchObject({ outcome: { status: "SENT" }, dispatchId: "ed_1" });
    expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "claire@labo.fr", fromName: "PharmaBoost" }));
    expect(mocks.traceDispatch).toHaveBeenCalledWith(expect.objectContaining({ kind: "TEMPLATE", recipient: "claire@labo.fr", templateKey: "partner.range_invitation", trigger: "AUTOMATIC", ruleKey: "partner.range_invitation", pharmacyId: null, organizationId: null, prospectId: null }));
  });
});
