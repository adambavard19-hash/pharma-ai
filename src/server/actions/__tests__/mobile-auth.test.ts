import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Les portes d'entrée de PharmaBoost Mobile, et le refus du comptoir pour un compte sans officine. Services et
 * session simulés ; une redirection de Next.js est une exception, comme en vrai.
 */
const m = vi.hoisted(() => ({
  authenticateUser: vi.fn(),
  createSession: vi.fn(),
  destroySession: vi.fn(),
  switchPharmacy: vi.fn(),
  getUserSession: vi.fn(),
  recordAudit: vi.fn(),
  createCommunityAccount: vi.fn(),
  throttled: vi.fn(),
  platformAdmin: vi.fn(),
  userCount: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`NEXT_REDIRECT ${path}`); } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/auth/credentials", () => ({ authenticateUser: m.authenticateUser }));
vi.mock("@/server/auth/session", () => ({
  createSession: m.createSession,
  destroySession: m.destroySession,
  switchPharmacy: m.switchPharmacy,
  requireSession: vi.fn(),
  getRequestMeta: async () => ({ ipAddress: "203.0.113.9", userAgent: "test" }),
}));
vi.mock("@/server/auth/user-session", () => ({ getUserSession: m.getUserSession }));
vi.mock("@/server/auth/platform-session", () => ({ createPlatformSession: vi.fn() }));
vi.mock("@/server/audit/log", () => ({ recordAudit: m.recordAudit }));
vi.mock("@/server/security/throttle", () => ({ throttled: m.throttled }));
vi.mock("@/server/services/mobile/account", () => ({ createCommunityAccount: m.createCommunityAccount }));
vi.mock("@/server/services/user-password", () => ({ changeOwnPassword: vi.fn(), peekUserPasswordToken: vi.fn(), sendUserPasswordLink: vi.fn(), setUserPasswordByToken: vi.fn() }));
vi.mock("@/server/services/sales/client-pharmacies", () => ({ markProspectActivatedForUser: vi.fn(async () => undefined) }));
vi.mock("@/server/security/password", () => ({ verifyPassword: async () => false }));
vi.mock("@/server/db/client", () => ({ prisma: { platformAdmin: { findUnique: m.platformAdmin }, user: { count: m.userCount } } }));

const mobile = await import("../mobile-auth");
const counter = await import("../auth");

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};
const signup = (extra: Record<string, string> = {}) =>
  form({ firstName: "Inès", lastName: "Martin", email: "Ines@Exemple.fr", password: "MotDePasse2026", profession: "PHARMACY_STUDENT", ...extra });

beforeEach(() => {
  vi.resetAllMocks();
  m.throttled.mockReturnValue(false);
  m.platformAdmin.mockResolvedValue(null);
  m.userCount.mockResolvedValue(10);
});

describe("connexion mobile", () => {
  it("un compte SANS officine entre : session sans officine, puis « Bienvenue » au premier passage", async () => {
    m.authenticateUser.mockResolvedValue({ kind: "OK", user: { id: "u1", organizationId: "org-communaute", mobileOnboardedAt: null, activePharmacyIds: [] } });
    await expect(mobile.mobileLoginAction(null, form({ email: " Ines@Exemple.fr ", password: "MotDePasse2026" }))).rejects.toThrow("NEXT_REDIRECT /m/bienvenue");
    expect(m.authenticateUser).toHaveBeenCalledWith("ines@exemple.fr", "MotDePasse2026");
    expect(m.createSession).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", pharmacyId: null }));
  });

  it("un collaborateur d'officine ouvre sa session dans sa première officine active", async () => {
    m.authenticateUser.mockResolvedValue({ kind: "OK", user: { id: "u2", organizationId: "org1", mobileOnboardedAt: new Date(), activePharmacyIds: ["ph1", "ph2"] } });
    await expect(mobile.mobileLoginAction(null, form({ email: "a@b.fr", password: "x" }))).rejects.toThrow("NEXT_REDIRECT /m");
    expect(m.createSession).toHaveBeenCalledWith(expect.objectContaining({ userId: "u2", pharmacyId: "ph1" }));
  });

  it("identifiants refusés : message générique, aucune session, trace d'échec sans mot de passe", async () => {
    m.authenticateUser.mockResolvedValue({ kind: "INVALID", userId: null, userExists: false });
    expect(await mobile.mobileLoginAction(null, form({ email: "a@b.fr", password: "Secret123456" }))).toMatchObject({ ok: false, error: "Identifiants incorrects." });
    expect(m.createSession).not.toHaveBeenCalled();
    expect(JSON.stringify(m.recordAudit.mock.calls)).not.toContain("Secret123456");
  });

  it("freinée : trop de tentatives, le mot de passe n'est même pas vérifié", async () => {
    m.throttled.mockReturnValue(true);
    expect(await mobile.mobileLoginAction(null, form({ email: "a@b.fr", password: "x" }))).toMatchObject({ ok: false, error: expect.stringContaining("Trop de tentatives") });
    expect(m.authenticateUser).not.toHaveBeenCalled();
  });
});

describe("le comptoir refuse un compte sans officine, et dit où aller", () => {
  it("message qui pointe vers PharmaBoost Mobile, aucune session", async () => {
    m.authenticateUser.mockResolvedValue({ kind: "OK", user: { id: "u1", organizationId: "org-communaute", mobileOnboardedAt: null, activePharmacyIds: [] } });
    const result = await counter.loginAction(null, form({ email: "ines@exemple.fr", password: "MotDePasse2026" }));
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("ouvrez PharmaBoost Mobile") });
    expect(m.createSession).not.toHaveBeenCalled();
  });

  it("un collaborateur rattaché entre au comptoir comme avant", async () => {
    m.authenticateUser.mockResolvedValue({ kind: "OK", user: { id: "u2", organizationId: "org1", mobileOnboardedAt: null, activePharmacyIds: ["ph1"] } });
    await expect(counter.loginAction(null, form({ email: "a@b.fr", password: "x" }))).rejects.toThrow("NEXT_REDIRECT /");
    expect(m.createSession).toHaveBeenCalledWith(expect.objectContaining({ userId: "u2", pharmacyId: "ph1" }));
  });
});

describe("inscription gratuite", () => {
  it("crée le compte, ouvre une session sans officine, puis « Bienvenue »", async () => {
    m.createCommunityAccount.mockResolvedValue({ ok: true, userId: "u-neuf" });
    await expect(mobile.mobileSignupAction(null, signup({ rpps: "101 0123 4567", pharmacyName: "Pharmacie du Centre" }))).rejects.toThrow("NEXT_REDIRECT /m/bienvenue");
    expect(m.createCommunityAccount).toHaveBeenCalledWith(expect.objectContaining({ email: "ines@exemple.fr", profession: "PHARMACY_STUDENT", rpps: "101 0123 4567", pharmacyName: "Pharmacie du Centre" }));
    expect(m.createSession).toHaveBeenCalledWith(expect.objectContaining({ userId: "u-neuf", pharmacyId: null }));
  });

  it("les accords sont NON tant que la case n'est pas cochée par la personne", async () => {
    m.createCommunityAccount.mockResolvedValue({ ok: true, userId: "u" });
    await expect(mobile.mobileSignupAction(null, signup())).rejects.toThrow("NEXT_REDIRECT");
    expect(m.createCommunityAccount.mock.calls[0][0].consents).toEqual({ PHARMABOOST_NEWS: false, PARTNER_COMMUNICATIONS: false });
    m.createCommunityAccount.mockClear();
    await expect(mobile.mobileSignupAction(null, signup({ consentNews: "on" }))).rejects.toThrow("NEXT_REDIRECT");
    expect(m.createCommunityAccount.mock.calls[0][0].consents).toEqual({ PHARMABOOST_NEWS: true, PARTNER_COMMUNICATIONS: false });
  });

  it("champs manquants ou métier inconnu : refus par champ, rien n'est créé", async () => {
    const result = await mobile.mobileSignupAction(null, signup({ firstName: "", email: "pas-une-adresse", profession: "ASTRONAUTE" }));
    expect(result).toMatchObject({ ok: false, fieldErrors: { firstName: expect.any(String), email: expect.any(String), profession: expect.any(String) } });
    expect(m.createCommunityAccount).not.toHaveBeenCalled();
  });

  it("adresse déjà connue : le refus du service est rendu sur le champ e-mail, aucune session", async () => {
    m.createCommunityAccount.mockResolvedValue({ ok: false, field: "email", error: "Un compte existe déjà avec cette adresse." });
    const result = await mobile.mobileSignupAction(null, signup());
    expect(result).toMatchObject({ ok: false, fieldErrors: { email: expect.stringContaining("existe déjà") } });
    expect(m.createSession).not.toHaveBeenCalled();
  });

  it("freinée par adresse IP et par adresse e-mail", async () => {
    m.throttled.mockImplementation((key: string) => key.startsWith("mobile-signup-mail:"));
    expect(await mobile.mobileSignupAction(null, signup())).toMatchObject({ ok: false, error: expect.stringContaining("Trop de tentatives") });
    expect(m.createCommunityAccount).not.toHaveBeenCalled();
    expect(m.throttled).toHaveBeenCalledWith("mobile-signup:203.0.113.9", 5, 600_000);
  });
});

describe("choisir son officine", () => {
  it("refuse une officine qui n'est pas l'une des siennes, sans toucher à la session", async () => {
    m.getUserSession.mockResolvedValue({ user: { id: "u2" }, memberships: [{ pharmacyId: "ph1" }] });
    await expect(mobile.mobileSwitchPharmacyAction(form({ pharmacyId: "ph-autre" }))).rejects.toThrow("NEXT_REDIRECT /m/officine");
    expect(m.switchPharmacy).not.toHaveBeenCalled();
  });

  it("bascule par switchPharmacy (le même contrôle que le comptoir)", async () => {
    m.getUserSession.mockResolvedValue({ user: { id: "u2" }, memberships: [{ pharmacyId: "ph1" }, { pharmacyId: "ph2" }] });
    await expect(mobile.mobileSwitchPharmacyAction(form({ pharmacyId: "ph2" }))).rejects.toThrow("NEXT_REDIRECT /m");
    expect(m.switchPharmacy).toHaveBeenCalledWith("ph2");
  });
});
