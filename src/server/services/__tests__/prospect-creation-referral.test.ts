import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Un NOUVEAU dossier créé hors de l'abonnement du site — par une demande de
 * démonstration du site, ou à la main depuis la console, l'extranet ou une invitation —
 * est rapproché du confrère qu'une officine avait proposé au parrainage (même e-mail,
 * casse ignorée). Un dossier existant n'est jamais rapproché : seule la création compte.
 * Base simulée, aucun message ne part au confrère.
 */
const db = vi.hoisted(() => ({
  prospect: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  salesTask: { create: vi.fn() },
  companyProfile: { findUnique: vi.fn() },
  referralLead: { findFirst: vi.fn(), updateMany: vi.fn() },
  pharmacy: { findUnique: vi.fn() },
}));
const messaging = vi.hoisted(() => ({ sendEmail: vi.fn() }));
const events = vi.hoisted(() => ({ recordProspectEvent: vi.fn() }));
const audit = vi.hoisted(() => ({ recordAudit: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: db }));
vi.mock("@/server/audit/log", () => audit);
vi.mock("@/server/ai/registry", () => ({ getMessagingProvider: () => messaging, getStorageProvider: vi.fn() }));
vi.mock("@/server/public-url", () => ({ publicUrl: (path: string) => `https://exemple.invalid${path}` }));
vi.mock("@/server/services/email-dispatch", () => ({ traceDispatch: vi.fn() }));
vi.mock("@/server/services/sales/events", () => events);
vi.mock("@/server/services/sales/notifications", () => ({ notifyAdmins: vi.fn(), notifySalesRep: vi.fn() }));
vi.mock("@/server/services/referral", () => ({ resolveReferralCode: async () => null }));

const siteLeads = await import("@/server/services/site-leads");
const { createProspect } = await import("@/server/services/sales/prospects");

const SENT = { status: "SENT" as const, provider: "resend", detail: "Message transmis.", messageId: "msg-1" };
const proposed = { id: "lead_1", referrerProspectId: "p_parrain", referrerProspect: { name: "Pharmacie du Port" } };
const demo = { kind: "DEMO" as const, pharmacyName: "Pharmacie de la Gare", contactName: "Camille Martin", email: "Camille@Gare.FR", phone: null, city: "Lyon", lgo: null, postCount: null, message: null, preferredSlot: null, referralCode: null };
const summaries = () => events.recordProspectEvent.mock.calls.map((c) => c[0] as { prospectId: string; summary: string });
const sentTo = () => messaging.sendEmail.mock.calls.map((c) => (c[0] as { to: string }).to);

beforeEach(() => {
  vi.clearAllMocks();
  messaging.sendEmail.mockResolvedValue(SENT);
  db.prospect.findFirst.mockResolvedValue(null);
  db.prospect.create.mockResolvedValue({ id: "p_new", name: "Pharmacie de la Gare", email: "camille@gare.fr" });
  db.companyProfile.findUnique.mockResolvedValue({ representativeEmail: "contact@pharmaboost.app" });
  db.referralLead.findFirst.mockResolvedValue(null);
  db.referralLead.updateMany.mockResolvedValue({ count: 1 });
});

describe("demande de démonstration du site", () => {
  it("un nouveau dossier à l'adresse d'un confrère proposé (casse ignorée) lui est rattaché : statut LINKED, événement sur les deux dossiers", async () => {
    db.referralLead.findFirst.mockResolvedValue(proposed);
    await siteLeads.receiveSiteLead(demo);

    expect(db.referralLead.findFirst.mock.calls[0][0]).toMatchObject({ where: { email: { equals: "Camille@Gare.FR", mode: "insensitive" }, status: { in: ["NEW", "CONTACTED"] }, referredProspectId: null } });
    expect(db.referralLead.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "lead_1" }), data: { referredProspectId: "p_new", status: "LINKED" } }));
    expect(summaries().find((e) => e.prospectId === "p_new" && e.summary.includes("Pharmacie du Port"))).toBeTruthy();
    expect(summaries().find((e) => e.prospectId === "p_parrain")?.summary).toContain("Pharmacie de la Gare");
  });

  it("aucun e-mail ne part au confrère : seuls l'équipe et le demandeur sont écrits", async () => {
    db.referralLead.findFirst.mockResolvedValue(proposed);
    await siteLeads.receiveSiteLead(demo);
    expect(sentTo().sort()).toEqual(["Camille@Gare.FR", "contact@pharmaboost.app"].sort());
  });

  it("une adresse qui n'a été proposée par personne : rien n'est rapproché", async () => {
    await siteLeads.receiveSiteLead(demo);
    expect(db.referralLead.updateMany).not.toHaveBeenCalled();
    expect(summaries().every((e) => e.prospectId === "p_new")).toBe(true);
  });

  it("une officine qui redemande depuis le site retrouve son dossier : ce n'est pas une création, rien n'est rapproché", async () => {
    db.prospect.findFirst.mockResolvedValue({ id: "p_existant", notes: null });
    db.prospect.update.mockResolvedValue({ id: "p_existant" });
    await siteLeads.receiveSiteLead(demo);
    expect(db.prospect.create).not.toHaveBeenCalled();
    expect(db.referralLead.findFirst).not.toHaveBeenCalled();
  });
});

describe("dossier créé à la main (console, extranet, invitation du titulaire)", () => {
  const ADMIN = { type: "ADMIN" as const, id: "adm_1", label: "Administrateur" };

  it("l'adresse du dossier est celle d'un confrère proposé : le dossier lui est rattaché, la trace est écrite sur les deux dossiers", async () => {
    db.prospect.create.mockResolvedValue({ id: "p_new", name: "Pharmacie de la Gare", email: "camille@gare.fr" });
    db.referralLead.findFirst.mockResolvedValue(proposed);
    const result = await createProspect({ name: "Pharmacie de la Gare", email: "  Camille@Gare.fr " }, null, ADMIN, "SUPER_ADMIN");

    expect(result).toEqual({ id: "p_new" });
    expect(db.referralLead.findFirst.mock.calls[0][0]).toMatchObject({ where: { email: { equals: "camille@gare.fr", mode: "insensitive" } } });
    expect(db.referralLead.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { referredProspectId: "p_new", status: "LINKED" } }));
    expect(summaries().find((e) => e.prospectId === "p_parrain")?.summary).toContain("Pharmacie de la Gare");
  });

  it("sans adresse, ou pour une adresse inconnue des confrères proposés, rien n'est rapproché et la création se déroule comme avant", async () => {
    db.prospect.create.mockResolvedValue({ id: "p_new", name: "Sans adresse", email: null });
    expect(await createProspect({ name: "Sans adresse" }, null, ADMIN)).toEqual({ id: "p_new" });
    expect(db.referralLead.findFirst).not.toHaveBeenCalled();
    db.prospect.create.mockResolvedValue({ id: "p_2", name: "Autre", email: "autre@exemple.fr" });
    expect(await createProspect({ name: "Autre", email: "autre@exemple.fr" }, null, ADMIN)).toEqual({ id: "p_2" });
    expect(db.referralLead.updateMany).not.toHaveBeenCalled();
  });

  it("une panne du rapprochement ne fait pas échouer la création du dossier", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    db.prospect.create.mockResolvedValue({ id: "p_new", name: "Pharmacie de la Gare", email: "camille@gare.fr" });
    db.referralLead.findFirst.mockRejectedValue(new Error("base indisponible"));
    await expect(createProspect({ name: "Pharmacie de la Gare", email: "camille@gare.fr" }, null, ADMIN)).resolves.toEqual({ id: "p_new" });
    spy.mockRestore();
  });
});
