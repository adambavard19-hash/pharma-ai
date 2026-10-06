import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * L'accès du directeur commercial : connexion, lien de mot de passe, oubli.
 * Ni base, ni e-mail réel (l'e-mail local est vrai : aucun test ne l'envoie),
 * ni scrypt : tout ce qui sort du processus est simulé.
 */

const db = vi.hoisted(() => ({
  salesDirector: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  salesDirectorSession: { updateMany: vi.fn() },
  $transaction: vi.fn(),
}));
const mocks = vi.hoisted(() => ({
  recordAudit: vi.fn(),
  sendEmail: vi.fn(),
  buildEmail: vi.fn(),
  verifyPassword: vi.fn(),
  hashPassword: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: db }));
vi.mock("@/server/audit/log", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@/server/ai/registry", () => ({ getMessagingProvider: () => ({ sendEmail: mocks.sendEmail }) }));
vi.mock("@/core/platform/sales-emails", () => ({ buildDirectorInvitationEmail: mocks.buildEmail }));
vi.mock("@/server/public-url", () => ({ publicUrl: (path: string) => `https://app.test${path}` }));
vi.mock("@/server/security/password", async () => ({
  ...(await vi.importActual<typeof import("@/server/security/password")>("@/server/security/password")),
  verifyPassword: mocks.verifyPassword,
  hashPassword: mocks.hashPassword,
}));

const auth = await import("../director-auth");

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const GOOD_PASSWORD = "Mot2Passe!Solide";

/** Une adresse neuve à chaque appel : la limite de débit est en mémoire et survit d'un test à l'autre. */
let counter = 0;
const freshEmail = () => `directeur${++counter}@exemple.test`;
const freshIp = () => `10.0.${Math.floor(++counter / 250)}.${counter % 250}`;

const director = (overrides: Record<string, unknown> = {}) => ({ id: "dir_1", email: "directeur@exemple.test", firstName: "Camille", passwordHash: "scrypt$hash", isActive: true, ...overrides });

beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation(async (work: (tx: typeof db) => unknown) => work(db));
  mocks.verifyPassword.mockResolvedValue(true);
  mocks.hashPassword.mockResolvedValue("scrypt$nouveau");
  mocks.buildEmail.mockReturnValue({ subject: "Réinitialiser votre mot de passe", text: "texte", html: "<p>html</p>" });
  mocks.sendEmail.mockResolvedValue({ status: "SENT", detail: "ok" });
});

describe("la connexion", () => {
  it("ouvre l'accès à un compte actif au bon mot de passe, adresse normalisée", async () => {
    db.salesDirector.findUnique.mockResolvedValue(director());
    const result = await auth.authenticateDirector("  Directeur@Exemple.TEST ", GOOD_PASSWORD, { ipAddress: freshIp() });
    expect(result).toEqual({ ok: true, salesDirectorId: "dir_1" });
    expect(db.salesDirector.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { email: "directeur@exemple.test" } }));
    expect(mocks.verifyPassword).toHaveBeenCalledWith(GOOD_PASSWORD, "scrypt$hash");
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("compte inconnu, mot de passe faux, compte désactivé : exactement le même message", async () => {
    const unknown = await (async () => {
      db.salesDirector.findUnique.mockResolvedValueOnce(null);
      return auth.authenticateDirector(freshEmail(), "peu importe", { ipAddress: freshIp() });
    })();
    const wrong = await (async () => {
      db.salesDirector.findUnique.mockResolvedValueOnce(director());
      mocks.verifyPassword.mockResolvedValueOnce(false);
      return auth.authenticateDirector(freshEmail(), "faux", { ipAddress: freshIp() });
    })();
    const inactive = await (async () => {
      db.salesDirector.findUnique.mockResolvedValueOnce(director({ isActive: false }));
      return auth.authenticateDirector(freshEmail(), GOOD_PASSWORD, { ipAddress: freshIp() });
    })();
    expect(unknown).toEqual({ ok: false, error: "Identifiants incorrects." });
    expect(wrong).toEqual(unknown);
    expect(inactive).toEqual(unknown);
  });

  it("un compte désactivé est refusé même avec le bon mot de passe", async () => {
    db.salesDirector.findUnique.mockResolvedValue(director({ isActive: false }));
    mocks.verifyPassword.mockResolvedValue(true);
    expect((await auth.authenticateDirector(freshEmail(), GOOD_PASSWORD, { ipAddress: freshIp() })).ok).toBe(false);
  });

  it("un compte inconnu coûte une vérification d'empreinte, comme un mot de passe faux (durée identique)", async () => {
    db.salesDirector.findUnique.mockResolvedValue(null);
    await auth.authenticateDirector(freshEmail(), "essai", { ipAddress: freshIp() });
    await auth.authenticateDirector(freshEmail(), "essai", { ipAddress: freshIp() });
    expect(mocks.verifyPassword).toHaveBeenCalledTimes(2);
    for (const [, stored] of mocks.verifyPassword.mock.calls) expect(stored).toBe("scrypt$nouveau");
    // L'empreinte factice est calculée au plus une fois par processus, jamais à chaque tentative.
    expect(mocks.hashPassword.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it("journalise l'échec d'un compte réel sans l'adresse saisie ni le mot de passe", async () => {
    db.salesDirector.findUnique.mockResolvedValue(director());
    mocks.verifyPassword.mockResolvedValue(false);
    await auth.authenticateDirector(freshEmail(), "MotDePasseSecretFaux1", { ipAddress: freshIp() });
    expect(mocks.recordAudit).toHaveBeenCalledTimes(1);
    const entry = mocks.recordAudit.mock.calls[0][0];
    expect(entry).toMatchObject({ action: "auth.login_failed", entityType: "SalesDirector", entityId: "dir_1", salesDirectorId: "dir_1" });
    expect(JSON.stringify(entry)).not.toContain("MotDePasseSecretFaux1");
    expect(JSON.stringify(entry)).not.toContain("@");
  });

  it("n'écrit rien dans le journal pour une adresse inconnue : n'importe qui peut en saisir une", async () => {
    db.salesDirector.findUnique.mockResolvedValue(null);
    await auth.authenticateDirector(freshEmail(), "essai", { ipAddress: freshIp() });
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("refuse une saisie vide sans toucher à la base", async () => {
    expect(await auth.authenticateDirector("", "x")).toEqual({ ok: false, error: "Identifiants incorrects." });
    expect(await auth.authenticateDirector("a@b.fr", "")).toEqual({ ok: false, error: "Identifiants incorrects." });
    expect(db.salesDirector.findUnique).not.toHaveBeenCalled();
  });

  it("dix essais par adresse et par quart d'heure, puis refus AVANT toute lecture ni calcul d'empreinte", async () => {
    const email = freshEmail();
    const ip = freshIp();
    db.salesDirector.findUnique.mockResolvedValue(director());
    mocks.verifyPassword.mockResolvedValue(false);
    for (let attempt = 0; attempt < 10; attempt++) {
      expect(await auth.authenticateDirector(email, "faux", { ipAddress: ip })).toEqual({ ok: false, error: "Identifiants incorrects." });
    }
    const reads = db.salesDirector.findUnique.mock.calls.length;
    const checks = mocks.verifyPassword.mock.calls.length;
    const blocked = await auth.authenticateDirector(email, GOOD_PASSWORD, { ipAddress: ip });
    expect(blocked).toEqual({ ok: false, error: "Trop de tentatives. Patientez quelques minutes, puis réessayez." });
    expect(db.salesDirector.findUnique.mock.calls.length).toBe(reads);
    expect(mocks.verifyPassword.mock.calls.length).toBe(checks);
  });

  it("dix essais d'un même poste sur une même adresse, puis la porte se ferme — pour ce poste seulement", async () => {
    const email = freshEmail();
    const ip = freshIp();
    db.salesDirector.findUnique.mockResolvedValue(null);
    for (let attempt = 0; attempt < 10; attempt++) await auth.authenticateDirector(email, "faux", { ipAddress: ip });
    expect(await auth.authenticateDirector(email, "faux", { ipAddress: ip })).toMatchObject({ ok: false, error: expect.stringContaining("Trop de tentatives") });
    // Le vrai directeur, depuis SON poste, n'est pas bloqué par un inconnu qui tape son adresse ailleurs.
    expect(await auth.authenticateDirector(email, "faux", { ipAddress: freshIp() })).toMatchObject({ ok: false, error: "Identifiants incorrects." });
  });

  it("une attaque répartie sur beaucoup de postes est arrêtée par le plafond de l'adresse (100 par heure)", async () => {
    const email = freshEmail();
    db.salesDirector.findUnique.mockResolvedValue(null);
    for (let attempt = 0; attempt < 100; attempt++) await auth.authenticateDirector(email, "faux", { ipAddress: freshIp() });
    expect(await auth.authenticateDirector(email, "faux", { ipAddress: freshIp() })).toMatchObject({ ok: false, error: expect.stringContaining("Trop de tentatives") });
  });

  it("trente essais par poste et par quart d'heure, toutes adresses confondues", async () => {
    const ip = freshIp();
    db.salesDirector.findUnique.mockResolvedValue(null);
    for (let attempt = 0; attempt < 30; attempt++) expect(await auth.authenticateDirector(freshEmail(), "faux", { ipAddress: ip })).toMatchObject({ error: "Identifiants incorrects." });
    expect(await auth.authenticateDirector(freshEmail(), "faux", { ipAddress: ip })).toMatchObject({ error: expect.stringContaining("Trop de tentatives") });
    // Un autre poste n'est pas pénalisé.
    expect(await auth.authenticateDirector(freshEmail(), "faux", { ipAddress: freshIp() })).toMatchObject({ error: "Identifiants incorrects." });
  });
});

describe("le lien pour définir le mot de passe", () => {
  it("n'enregistre que l'empreinte du jeton, valable sept jours, et rend l'adresse du directeur", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-06T10:00:00Z"));
    try {
      const { url, expiresAt } = await auth.issueDirectorPasswordLink("dir_1");
      const token = url.replace("https://app.test/directeur/mot-de-passe/", "");
      expect(url).toMatch(/^https:\/\/app\.test\/directeur\/mot-de-passe\/[\w-]{40,}$/);
      expect(expiresAt.toISOString()).toBe("2026-10-13T10:00:00.000Z");
      const update = db.salesDirector.update.mock.calls[0][0];
      expect(update.where).toEqual({ id: "dir_1" });
      expect(update.data).toEqual({ passwordResetTokenHash: sha256(token), passwordResetExpiresAt: expiresAt });
      expect(JSON.stringify(update)).not.toContain(token);
    } finally {
      vi.useRealTimers();
    }
  });

  it("deux liens successifs sont différents", async () => {
    const [a, b] = [await auth.issueDirectorPasswordLink("dir_1"), await auth.issueDirectorPasswordLink("dir_1")];
    expect(a.url).not.toBe(b.url);
  });
});

describe("« mot de passe oublié »", () => {
  it("envoie le lien à un compte actif, avec le gabarit « réinitialiser », et le trace sans rien de secret", async () => {
    db.salesDirector.findUnique.mockResolvedValue(director());
    await auth.requestDirectorPasswordReset("  Directeur@Exemple.test ", { ipAddress: freshIp() });
    expect(db.salesDirector.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { email: "directeur@exemple.test" } }));
    expect(mocks.buildEmail).toHaveBeenCalledWith(expect.objectContaining({ firstName: "Camille", kind: "reset", url: expect.stringContaining("/directeur/mot-de-passe/") }));
    expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "directeur@exemple.test", subject: "Réinitialiser votre mot de passe" }));
    const entry = mocks.recordAudit.mock.calls[0][0];
    expect(entry).toMatchObject({ action: "auth.password_link_sent", entityType: "SalesDirector", entityId: "dir_1", salesDirectorId: "dir_1", metadata: { kind: "reset", status: "SENT" } });
    const url = mocks.buildEmail.mock.calls[0][0].url as string;
    expect(JSON.stringify(entry)).not.toContain(url.split("/").pop());
  });

  it("compte inconnu ou désactivé : rien ne part, et l'appel se termine exactement comme pour un compte actif", async () => {
    db.salesDirector.findUnique.mockResolvedValueOnce(null);
    await expect(auth.requestDirectorPasswordReset(freshEmail(), { ipAddress: freshIp() })).resolves.toBeUndefined();
    db.salesDirector.findUnique.mockResolvedValueOnce(director({ isActive: false }));
    await expect(auth.requestDirectorPasswordReset(freshEmail(), { ipAddress: freshIp() })).resolves.toBeUndefined();
    db.salesDirector.findUnique.mockResolvedValueOnce(director());
    await expect(auth.requestDirectorPasswordReset(freshEmail(), { ipAddress: freshIp() })).resolves.toBeUndefined();
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(db.salesDirector.update).toHaveBeenCalledTimes(1);
  });

  it("un prestataire d'e-mail en panne ne se voit pas : aucune exception, aucun lien dans le journal technique", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      db.salesDirector.findUnique.mockResolvedValue(director());
      mocks.sendEmail.mockRejectedValue(new Error("Resend indisponible"));
      await expect(auth.requestDirectorPasswordReset(freshEmail(), { ipAddress: freshIp() })).resolves.toBeUndefined();
      const logged = JSON.stringify(spy.mock.calls);
      expect(logged).not.toContain("directeur@exemple.test");
      expect(logged).not.toContain("/directeur/mot-de-passe/");
    } finally {
      spy.mockRestore();
    }
  });

  it("trois demandes d'un même poste par heure, puis plus rien ne part (et rien ne se voit)", async () => {
    const email = freshEmail();
    const ip = freshIp();
    db.salesDirector.findUnique.mockResolvedValue(director());
    for (let attempt = 0; attempt < 5; attempt++) await expect(auth.requestDirectorPasswordReset(email, { ipAddress: ip })).resolves.toBeUndefined();
    expect(mocks.sendEmail).toHaveBeenCalledTimes(3);
  });

  it("un lien émis il y a moins de dix minutes n'est pas remplacé : l'invitation qui vient de partir reste valable", async () => {
    const email = freshEmail();
    const issuedJustNow = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7 - 60_000);
    db.salesDirector.findUnique.mockResolvedValue(director({ passwordResetExpiresAt: issuedJustNow }));
    await auth.requestDirectorPasswordReset(email, { ipAddress: freshIp() });
    expect(db.salesDirector.update).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("un lien plus ancien que dix minutes est remplacé et envoyé", async () => {
    const email = freshEmail();
    const issuedLongAgo = new Date(Date.now() + 1000 * 60 * 60 * 24 * 3);
    db.salesDirector.findUnique.mockResolvedValue(director({ passwordResetExpiresAt: issuedLongAgo }));
    await auth.requestDirectorPasswordReset(email, { ipAddress: freshIp() });
    expect(db.salesDirector.update).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("ignore une adresse vide", async () => {
    await auth.requestDirectorPasswordReset("   ");
    expect(db.salesDirector.findUnique).not.toHaveBeenCalled();
  });
});

describe("lire un lien", () => {
  const link = "A".repeat(43);
  const future = () => new Date(Date.now() + 60_000);

  it("rend le compte pour un lien valable, en cherchant par empreinte", async () => {
    db.salesDirector.findUnique.mockResolvedValue({ id: "dir_1", email: "directeur@exemple.test", firstName: "Camille", isActive: true, passwordResetExpiresAt: future() });
    expect(await auth.peekDirectorPasswordToken(link)).toEqual({ id: "dir_1", email: "directeur@exemple.test", firstName: "Camille" });
    expect(db.salesDirector.findUnique).toHaveBeenCalledWith({ where: { passwordResetTokenHash: sha256(link) } });
  });

  it("refuse un lien trop court sans interroger la base", async () => {
    expect(await auth.peekDirectorPasswordToken("")).toBeNull();
    expect(await auth.peekDirectorPasswordToken("court")).toBeNull();
    expect(db.salesDirector.findUnique).not.toHaveBeenCalled();
  });

  it("refuse un lien inconnu, périmé, ou d'un compte désactivé", async () => {
    db.salesDirector.findUnique.mockResolvedValueOnce(null);
    expect(await auth.peekDirectorPasswordToken(link)).toBeNull();
    db.salesDirector.findUnique.mockResolvedValueOnce({ id: "d", email: "e", firstName: "f", isActive: true, passwordResetExpiresAt: new Date(Date.now() - 1000) });
    expect(await auth.peekDirectorPasswordToken(link)).toBeNull();
    db.salesDirector.findUnique.mockResolvedValueOnce({ id: "d", email: "e", firstName: "f", isActive: false, passwordResetExpiresAt: future() });
    expect(await auth.peekDirectorPasswordToken(link)).toBeNull();
    db.salesDirector.findUnique.mockResolvedValueOnce({ id: "d", email: "e", firstName: "f", isActive: true, passwordResetExpiresAt: null });
    expect(await auth.peekDirectorPasswordToken(link)).toBeNull();
  });
});

describe("définir le mot de passe", () => {
  const link = "B".repeat(43);
  const valid = () => db.salesDirector.findUnique.mockResolvedValue({ id: "dir_1", email: "directeur@exemple.test", firstName: "Camille", isActive: true, passwordResetExpiresAt: new Date(Date.now() + 60_000) });

  it("change le mot de passe, consomme le lien et révoque les sessions dans une seule opération", async () => {
    valid();
    db.salesDirector.updateMany.mockResolvedValue({ count: 1 });
    expect(await auth.setDirectorPasswordByToken(link, GOOD_PASSWORD)).toEqual({ ok: true, salesDirectorId: "dir_1" });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    const claim = db.salesDirector.updateMany.mock.calls[0][0];
    expect(claim.where).toMatchObject({ id: "dir_1", passwordResetTokenHash: sha256(link), isActive: true });
    expect(claim.data).toEqual({ passwordHash: "scrypt$nouveau", passwordResetTokenHash: null, passwordResetExpiresAt: null });
    expect(db.salesDirectorSession.updateMany).toHaveBeenCalledWith({ where: { salesDirectorId: "dir_1", revokedAt: null }, data: { revokedAt: expect.any(Date) } });
    expect(mocks.hashPassword).toHaveBeenCalledWith(GOOD_PASSWORD);
  });

  it("trace le geste sans le mot de passe", async () => {
    valid();
    db.salesDirector.updateMany.mockResolvedValue({ count: 1 });
    await auth.setDirectorPasswordByToken(link, GOOD_PASSWORD);
    expect(mocks.recordAudit).toHaveBeenCalledWith({ action: "auth.password_set", entityType: "SalesDirector", entityId: "dir_1", salesDirectorId: "dir_1", metadata: { scope: "director" } });
    expect(JSON.stringify(mocks.recordAudit.mock.calls)).not.toContain(GOOD_PASSWORD);
  });

  it("refuse un mot de passe faible en disant quoi corriger, sans rien écrire ni consommer le lien", async () => {
    valid();
    const result = await auth.setDirectorPasswordByToken(link, "court");
    expect(result).toMatchObject({ ok: false });
    expect(!result.ok && result.error).toMatch(/^Mot de passe trop faible : 12 caractères minimum, /);
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.salesDirector.updateMany).not.toHaveBeenCalled();
    expect(mocks.hashPassword).not.toHaveBeenCalled();
  });

  it("un lien invalide est refusé avant tout calcul", async () => {
    db.salesDirector.findUnique.mockResolvedValue(null);
    expect(await auth.setDirectorPasswordByToken(link, GOOD_PASSWORD)).toEqual({ ok: false, error: "Ce lien n'est plus valide. Demandez-en un nouveau depuis la page de connexion." });
    expect(mocks.hashPassword).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("à usage unique : si le lien vient d'être consommé entre-temps, rien n'est changé ni révoqué", async () => {
    valid();
    db.salesDirector.updateMany.mockResolvedValue({ count: 0 });
    expect(await auth.setDirectorPasswordByToken(link, GOOD_PASSWORD)).toMatchObject({ ok: false, error: expect.stringContaining("n'est plus valide") });
    expect(db.salesDirectorSession.updateMany).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });
});
