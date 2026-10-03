import { beforeEach, describe, expect, it, vi } from "vitest";

// Ni base, ni session, ni envoi : tout ce qui sort du processus est simulé.
vi.mock("server-only", () => ({}));

type FakeAdmin = { id: string; email: string; firstName: string; lastName: string; isActive: boolean };
const store: { admins: FakeAdmin[] } = { admins: [] };

const prismaMock = vi.hoisted(() => ({
  platformAdmin: { count: vi.fn(), findUnique: vi.fn(), delete: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
  platformAdminSession: { deleteMany: vi.fn() },
  companyProfile: { findUnique: vi.fn() },
  automationRule: { count: vi.fn() },
  platformSetting: { findUnique: vi.fn(), upsert: vi.fn() },
  // Fiche 360° d'une officine.
  pharmacy: { findUnique: vi.fn() },
  contract: { findMany: vi.fn() },
  billingPayment: { count: vi.fn(), findMany: vi.fn() },
  adminNote: { count: vi.fn() },
  emailDispatch: { count: vi.fn(), findMany: vi.fn() },
  platformIncident: { count: vi.fn() },
  cancellationRequest: { findFirst: vi.fn() },
  auditLog: { findMany: vi.fn() },
  prospectEvent: { findMany: vi.fn() },
  billingEvent: { findMany: vi.fn() },
  subscriptionInvite: { findMany: vi.fn() },
  cancellationEvent: { findMany: vi.fn() },
  subscriptionPriceChange: { findMany: vi.fn() },
}));
const auditMock = vi.hoisted(() => ({ recordAudit: vi.fn() }));
const sessionMock = vi.hoisted(() => ({ requirePlatformSession: vi.fn() }));
const passwordLinkMock = vi.hoisted(() => ({ sendPasswordLink: vi.fn() }));
const revalidateMock = vi.hoisted(() => ({ revalidatePath: vi.fn() }));

vi.mock("@/server/db/client", () => ({ prisma: prismaMock }));
vi.mock("@/server/audit/log", () => auditMock);
vi.mock("@/server/auth/platform-session", () => sessionMock);
vi.mock("next/cache", () => revalidateMock);
vi.mock("@/server/services/platform-admin", () => passwordLinkMock);
// Les services commerciaux importés par les actions de l'extranet : hors sujet ici.
vi.mock("@/server/services/sales/reps", () => ({}));
vi.mock("@/server/services/sales/prospects", () => ({}));
vi.mock("@/server/services/sales/contracts", () => ({}));
vi.mock("@/server/services/sales/notifications", () => ({}));
vi.mock("@/server/services/sales/commissions", () => ({}));
vi.mock("@/server/services/sales/client-pharmacies", () => ({}));
// La fiche 360° : notes et noms d'auteurs lus ailleurs.
vi.mock("@/server/services/admin/notes", () => ({ listNotes: vi.fn(async () => []) }));
vi.mock("@/server/services/admin/clients", () => ({ namesFor: vi.fn(async () => ({ admins: new Map(), pharmacies: new Map(), prospects: new Map() })) }));
vi.mock("@/server/security/tokens", () => ({ generateToken: () => "jeton" }));
vi.mock("@/server/security/password", () => ({ hashPassword: async () => "empreinte" }));

// Des valeurs factices mais reconnaissables : aucune ne doit ressortir du bilan.
const SECRETS = {
  DATABASE_URL: "postgresql://utilisateur:MotDePasseBase-7f3a@db.exemple.fr:5432/pharma",
  AUTH_SESSION_SECRET: "secret-de-session-ZZ9-0123456789abcdef0123456789",
  DATA_ENCRYPTION_KEY: "cle-de-chiffrement-QQ7-0123456789",
  STRIPE_SECRET_KEY: "sk_test_FAUSSECLESTRIPE4242",
  STRIPE_WEBHOOK_SECRET: "whsec_FAUXSECRETSTRIPE9876",
  STRIPE_PORTAL_CONFIGURATION_ID: "bpc_FAUXPORTAIL5555",
  RESEND_API_KEY: "re_FAUSSECLERESEND1234",
  RESEND_WEBHOOK_SECRET: "whsec_FAUXSECRETRESEND5678",
  DOCUSEAL_API_KEY: "FAUSSECLEDOCUSEAL8888",
  DOCUSEAL_WEBHOOK_SECRET: "FAUXSECRETDOCUSEAL7777",
  YOUSIGN_API_KEY: "FAUSSECLEYOUSIGN6666",
  CRON_SECRET: "FAUXSECRETCRON3333",
  S3_ACCESS_KEY_ID: "FAUXIDENTIFIANTS3AKIA",
  S3_SECRET_ACCESS_KEY: "FAUXSECRETS3wJalrXUtnFEMI",
  SMTP_PASSWORD: "FAUXMOTDEPASSESMTP",
  ANTHROPIC_API_KEY: "sk-ant-FAUSSECLEANTHROPIC",
};

Object.assign(process.env, SECRETS, {
  APP_URL: "https://pharmaboost.exemple",
  PUBLIC_APP_URL: "https://pharmaboost.exemple",
  STRIPE_MODE: "test",
  EMAIL_PROVIDER: "resend",
  EMAIL_FROM: "PharmaBoost <contact@pharmaboost.exemple>",
  SIGNATURE_PROVIDER: "docuseal",
  DOCUSEAL_REGION: "eu",
  STORAGE_PROVIDER: "s3",
  S3_BUCKET: "compartiment-contrats",
  S3_REGION: "fr-par",
});

const { describeCronSchedule, loadPlatformHealth } = await import("../platform-health");
const { deletePlatformAdminAction, resendPlatformAdminLinkAction, setPlatformAdminActiveAction } = await import("@/server/actions/platform-admins");
const { saveReminderPolicyAction } = await import("@/server/actions/platform-sales");
const { loadPharmacy360, loadPharmacyTimeline } = await import("../pharmacy-360");

describe("paramètres : l'état de la plateforme ne livre aucun secret", () => {
  beforeEach(() => {
    prismaMock.companyProfile.findUnique.mockResolvedValue({ legalName: "PharmaBoost SAS", siren: "123456789", addressLine1: "1 rue de l'Exemple", representativeName: "A. Exemple" });
    prismaMock.automationRule.count.mockResolvedValue(2);
    prismaMock.platformSetting.findUnique.mockResolvedValue(null);
  });

  it("aucune valeur de variable sensible n'apparaît dans le résultat sérialisé", async () => {
    const serialized = JSON.stringify(await loadPlatformHealth());
    for (const [name, value] of Object.entries(SECRETS)) {
      expect(serialized.includes(value), name).toBe(false);
    }
    // Ni fragment reconnaissable des clés.
    for (const fragment of ["FAUSSECLE", "FAUXSECRET", "FAUXIDENTIFIANT", "FAUXMOTDEPASSE", "FAUXPORTAIL", "MotDePasseBase"]) expect(serialized).not.toContain(fragment);
  });

  it("ne renvoie que des booléens et des libellés", async () => {
    const health = await loadPlatformHealth();
    for (const service of health.services) {
      for (const check of service.checks) expect(typeof check.ok).toBe("boolean");
      for (const fact of service.facts) expect(typeof fact.value).toBe("string");
      for (const endpoint of service.endpoints ?? []) expect(typeof endpoint.secured).toBe("boolean");
    }
  });

  it("dit l'état réel de chaque service, adresse d'expédition publique comprise", async () => {
    const health = await loadPlatformHealth();
    const state = (key: string) => health.services.find((s) => s.key === key)?.state;
    expect(state("messaging")).toBe("CONFIGURED");
    expect(state("payments")).toBe("TEST");
    expect(state("signature")).toBe("CONFIGURED");
    expect(state("cron")).toBe("CONFIGURED");
    expect(state("webhooks")).toBe("CONFIGURED");
    expect(state("publicUrl")).toBe("CONFIGURED");
    expect(state("storage")).toBe("CONFIGURED");
    expect(state("company")).toBe("CONFIGURED");
    const messaging = health.services.find((s) => s.key === "messaging")!;
    expect(messaging.facts).toContainEqual({ label: "Adresse d'expédition", value: "PharmaBoost <contact@pharmaboost.exemple>" });
    expect(health.counts.CONFIGURED + health.counts.TEST + health.counts.INCOMPLETE + health.counts.NOT_CONFIGURED).toBe(health.services.length);
  });

  it("une base illisible ne fait pas tomber la page", async () => {
    prismaMock.companyProfile.findUnique.mockRejectedValue(new Error("base indisponible"));
    prismaMock.automationRule.count.mockRejectedValue(new Error("base indisponible"));
    prismaMock.platformSetting.findUnique.mockRejectedValue(new Error("base indisponible"));
    const health = await loadPlatformHealth();
    expect(health.services.find((s) => s.key === "company")?.state).toBe("NOT_CONFIGURED");
    expect(JSON.stringify(health)).toContain("Illisible pour l'instant");
  });

  it("sans configuration : non configuré, avec ce qu'il faut faire", async () => {
    const saved = { ...process.env };
    for (const key of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "RESEND_API_KEY", "RESEND_WEBHOOK_SECRET", "EMAIL_PROVIDER", "EMAIL_FROM", "SIGNATURE_PROVIDER", "DOCUSEAL_API_KEY", "DOCUSEAL_WEBHOOK_SECRET", "CRON_SECRET", "STORAGE_PROVIDER"]) delete process.env[key];
    vi.resetModules();
    try {
      const fresh = await import("../platform-health");
      const health = await fresh.loadPlatformHealth();
      const service = (key: string) => health.services.find((s) => s.key === key)!;
      expect(service("messaging").state).toBe("NOT_CONFIGURED");
      expect(service("payments").state).toBe("NOT_CONFIGURED");
      expect(service("signature").state).toBe("NOT_CONFIGURED");
      expect(service("webhooks").state).toBe("NOT_CONFIGURED");
      // Des tâches sont déclarées dans vercel.json, mais sans secret elles refusent de tourner.
      expect(service("cron").state).toBe("INCOMPLETE");
      expect(service("storage").state).toBe("TEST");
      for (const key of ["messaging", "payments", "signature", "cron"]) expect(service(key).todo.length, key).toBeGreaterThan(0);
      expect(service("payments").todo.join(" ")).toContain("STRIPE_SECRET_KEY");
      const serialized = JSON.stringify(health);
      for (const value of [SECRETS.DATABASE_URL, SECRETS.AUTH_SESSION_SECRET, SECRETS.DATA_ENCRYPTION_KEY, SECRETS.S3_SECRET_ACCESS_KEY, SECRETS.YOUSIGN_API_KEY]) expect(serialized).not.toContain(value);
    } finally {
      process.env = saved;
      vi.resetModules();
    }
  });

  it("les planifications cron se lisent en français", () => {
    expect(describeCronSchedule("0 8 * * *")).toBe("Tous les jours à 08:00 (UTC)");
    expect(describeCronSchedule("15 8 * * *")).toBe("Tous les jours à 08:15 (UTC)");
    expect(describeCronSchedule("*/10 * * * *")).toBe("Toutes les 10 minutes");
    expect(describeCronSchedule("0 7 * * 1")).toBe("Chaque lundi à 07:00 (UTC)");
    expect(describeCronSchedule("0 6 1 * *")).toBe("Le 1 de chaque mois à 06:00 (UTC)");
    expect(describeCronSchedule("n'importe quoi")).toBe("Planification « n'importe quoi »");
  });
});

describe("équipe : garde-fou « au moins un administrateur actif »", () => {
  const admin = (id: string, isActive: boolean): FakeAdmin => ({ id, email: `${id}@pharmaboost.exemple`, firstName: id, lastName: "Test", isActive });

  beforeEach(() => {
    vi.clearAllMocks();
    sessionMock.requirePlatformSession.mockResolvedValue({ admin: { id: "adm_self", email: "adm_self@pharmaboost.exemple", fullName: "Moi", initials: "MO" }, sessionId: "s1" });
    prismaMock.platformAdmin.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => store.admins.find((a) => a.id === where.id) ?? null);
    // Le compteur simulé applique vraiment le filtre reçu : on teste la requête, pas un nombre posé à la main.
    prismaMock.platformAdmin.count.mockImplementation(async ({ where }: { where: { isActive?: boolean; id?: { not?: string } } }) =>
      store.admins.filter((a) => (where.isActive === undefined || a.isActive === where.isActive) && (!where.id?.not || a.id !== where.id.not)).length,
    );
    prismaMock.platformAdmin.delete.mockImplementation(async ({ where }: { where: { id: string } }) => {
      store.admins = store.admins.filter((a) => a.id !== where.id);
      return {};
    });
  });

  it("supprimer un compte désactivé reste possible quand on est le seul actif (défaut corrigé)", async () => {
    store.admins = [admin("adm_self", true), admin("adm_old", false)];
    const result = await deletePlatformAdminAction({ adminId: "adm_old" });
    expect(result.ok).toBe(true);
    expect(prismaMock.platformAdmin.count).toHaveBeenCalledWith({ where: { isActive: true, id: { not: "adm_old" } } });
    expect(prismaMock.platformAdmin.delete).toHaveBeenCalledWith({ where: { id: "adm_old" } });
  });

  it("les comptes désactivés ne comptent pas : sans autre compte actif, la suppression est refusée", async () => {
    // Course : la session est encore ouverte mais le compte vient d'être désactivé ailleurs.
    store.admins = [admin("adm_self", false), admin("adm_last", true), admin("adm_off", false)];
    const result = await deletePlatformAdminAction({ adminId: "adm_last" });
    expect(result).toEqual({ ok: false, error: "Il doit rester au moins un administrateur actif.", fieldErrors: undefined });
    expect(prismaMock.platformAdmin.delete).not.toHaveBeenCalled();
  });

  it("supprimer un autre compte actif quand on reste actif", async () => {
    store.admins = [admin("adm_self", true), admin("adm_b", true)];
    const result = await deletePlatformAdminAction({ adminId: "adm_b" });
    expect(result.ok).toBe(true);
    expect(auditMock.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "platform.admin_deleted", entityId: "adm_b", platformAdminId: "adm_self", metadata: { before: expect.objectContaining({ email: "adm_b@pharmaboost.exemple", isActive: true }) } }),
    );
  });

  it("jamais son propre compte, jamais un compte inconnu, jamais une entrée invalide", async () => {
    store.admins = [admin("adm_self", true), admin("adm_b", true)];
    expect((await deletePlatformAdminAction({ adminId: "adm_self" })).ok).toBe(false);
    expect((await deletePlatformAdminAction({ adminId: "adm_inconnu" })).ok).toBe(false);
    expect((await deletePlatformAdminAction({ adminId: "" })).ok).toBe(false);
    expect(prismaMock.platformAdmin.delete).not.toHaveBeenCalled();
    expect(auditMock.recordAudit).not.toHaveBeenCalled();
  });

  it("la session est exigée avant toute lecture", async () => {
    sessionMock.requirePlatformSession.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(deletePlatformAdminAction({ adminId: "adm_b" })).rejects.toThrow("NEXT_REDIRECT");
    expect(prismaMock.platformAdmin.findUnique).not.toHaveBeenCalled();
  });
});

describe("équipe : activer / désactiver relit l'état, ne journalise que ce qui change", () => {
  const admin = (id: string, isActive: boolean): FakeAdmin => ({ id, email: `${id}@pharmaboost.exemple`, firstName: id, lastName: "Test", isActive });

  beforeEach(() => {
    vi.clearAllMocks();
    sessionMock.requirePlatformSession.mockResolvedValue({ admin: { id: "adm_self", email: "adm_self@pharmaboost.exemple", fullName: "Moi", initials: "MO" }, sessionId: "s1" });
    // Comme Prisma, la lecture rend une copie : l'écriture qui suit ne la modifie pas.
    prismaMock.platformAdmin.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
      const found = store.admins.find((a) => a.id === where.id);
      return found ? { ...found } : null;
    });
    // L'écriture conditionnelle simulée applique vraiment son filtre : rien n'est écrit si l'état a bougé.
    prismaMock.platformAdmin.updateMany.mockImplementation(async ({ where, data }: { where: { id: string; isActive: boolean }; data: { isActive: boolean } }) => {
      const target = store.admins.find((a) => a.id === where.id && a.isActive === where.isActive);
      if (target) target.isActive = data.isActive;
      return { count: target ? 1 : 0 };
    });
    prismaMock.platformAdmin.update.mockRejectedValue(Object.assign(new Error("Record to update not found."), { code: "P2025" }));
    prismaMock.platformAdminSession.deleteMany.mockResolvedValue({ count: 0 });
    passwordLinkMock.sendPasswordLink.mockResolvedValue({ status: "SENT", detail: "", url: "" });
  });

  it("déjà désactivé par un autre administrateur : rien n'est écrit ni journalisé (défaut corrigé)", async () => {
    store.admins = [admin("adm_self", true), admin("adm_b", false)];
    const result = await setPlatformAdminActiveAction({ adminId: "adm_b", isActive: false });
    expect(result.ok).toBe(true);
    expect(prismaMock.platformAdmin.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.platformAdmin.update).not.toHaveBeenCalled();
    expect(prismaMock.platformAdminSession.deleteMany).not.toHaveBeenCalled();
    expect(auditMock.recordAudit).not.toHaveBeenCalled();
  });

  it("supprimé entre-temps : « Administrateur introuvable », sans exception (défaut corrigé)", async () => {
    store.admins = [admin("adm_self", true)];
    await expect(setPlatformAdminActiveAction({ adminId: "adm_b", isActive: false })).resolves.toEqual({ ok: false, error: "Administrateur introuvable.", fieldErrors: undefined });
    await expect(resendPlatformAdminLinkAction({ adminId: "adm_b" })).resolves.toEqual({ ok: false, error: "Administrateur introuvable.", fieldErrors: undefined });
    expect(passwordLinkMock.sendPasswordLink).not.toHaveBeenCalled();
    expect(auditMock.recordAudit).not.toHaveBeenCalled();
  });

  it("un vrai changement : écrit, ferme les sessions, journalise l'avant relu et l'après", async () => {
    store.admins = [admin("adm_self", true), admin("adm_b", true)];
    const result = await setPlatformAdminActiveAction({ adminId: "adm_b", isActive: false });
    expect(result.ok).toBe(true);
    expect(store.admins.find((a) => a.id === "adm_b")?.isActive).toBe(false);
    expect(prismaMock.platformAdminSession.deleteMany).toHaveBeenCalledWith({ where: { adminId: "adm_b" } });
    expect(auditMock.recordAudit).toHaveBeenCalledTimes(1);
    expect(auditMock.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "platform.admin_deactivated", entityId: "adm_b", platformAdminId: "adm_self", metadata: { email: "adm_b@pharmaboost.exemple", changes: { isActive: { from: true, to: false } } } }),
    );
  });

  it("état modifié entre la lecture et l'écriture : refus, rien de journalisé", async () => {
    store.admins = [admin("adm_self", true), admin("adm_b", true)];
    // Un autre administrateur désactive le compte juste après notre lecture.
    prismaMock.platformAdmin.findUnique.mockImplementationOnce(async () => {
      const snapshot = { ...store.admins[1]! };
      store.admins[1]!.isActive = false;
      return snapshot;
    });
    const result = await setPlatformAdminActiveAction({ adminId: "adm_b", isActive: false });
    expect(result.ok).toBe(false);
    expect(auditMock.recordAudit).not.toHaveBeenCalled();
  });

  it("renvoyer le lien d'un compte existant : envoyé et journalisé", async () => {
    store.admins = [admin("adm_self", true), admin("adm_b", true)];
    expect((await resendPlatformAdminLinkAction({ adminId: "adm_b" })).ok).toBe(true);
    expect(passwordLinkMock.sendPasswordLink).toHaveBeenCalledWith("adm_b");
    expect(auditMock.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "platform.admin_link_resent", entityId: "adm_b" }));
  });
});

describe("relances de contrat : la cadence est journalisée avec l'avant et l'après", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionMock.requirePlatformSession.mockResolvedValue({ admin: { id: "adm_self", email: "adm_self@pharmaboost.exemple", fullName: "Moi", initials: "MO" }, sessionId: "s1" });
    prismaMock.platformSetting.findUnique.mockResolvedValue({ key: "contract.reminders", value: { enabled: true, firstAfterDays: 3, secondAfterDays: 4, escalateAfterDays: 3 } });
    prismaMock.platformSetting.upsert.mockResolvedValue({});
  });

  it("J+3 → J+10 : before / after consignés, centre des relances revalidé (défaut corrigé)", async () => {
    const result = await saveReminderPolicyAction({ enabled: true, firstAfterDays: 10, secondAfterDays: 4, escalateAfterDays: 3 });
    expect(result.ok).toBe(true);
    expect(prismaMock.platformSetting.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { key: "contract.reminders" }, update: { value: { enabled: true, firstAfterDays: 10, secondAfterDays: 4, escalateAfterDays: 3 }, updatedBy: "adm_self" } }));
    expect(auditMock.recordAudit).toHaveBeenCalledTimes(1);
    expect(auditMock.recordAudit).toHaveBeenCalledWith({
      action: "platform.setting_updated",
      entityType: "PlatformSetting",
      entityId: "contract.reminders",
      platformAdminId: "adm_self",
      metadata: { before: { enabled: true, firstAfterDays: 3, secondAfterDays: 4, escalateAfterDays: 3 }, after: { enabled: true, firstAfterDays: 10, secondAfterDays: 4, escalateAfterDays: 3 } },
    });
    expect(revalidateMock.revalidatePath).toHaveBeenCalledWith("/admin/relances");
    expect(revalidateMock.revalidatePath).not.toHaveBeenCalledWith("/admin/societe");
  });

  it("sans réglage enregistré, l'avant est la règle par défaut qui s'appliquait", async () => {
    prismaMock.platformSetting.findUnique.mockResolvedValue(null);
    await saveReminderPolicyAction({ enabled: false, firstAfterDays: 3, secondAfterDays: 4, escalateAfterDays: 3 });
    expect(auditMock.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ metadata: { before: { enabled: true, firstAfterDays: 3, secondAfterDays: 4, escalateAfterDays: 3 }, after: { enabled: false, firstAfterDays: 3, secondAfterDays: 4, escalateAfterDays: 3 } } }));
  });

  it("cadence inchangée : rien n'est écrit ni journalisé", async () => {
    const result = await saveReminderPolicyAction({ enabled: true, firstAfterDays: 3, secondAfterDays: 4, escalateAfterDays: 3 });
    expect(result.ok).toBe(true);
    expect(prismaMock.platformSetting.upsert).not.toHaveBeenCalled();
    expect(auditMock.recordAudit).not.toHaveBeenCalled();
  });

  it("la session est exigée avant toute lecture", async () => {
    sessionMock.requirePlatformSession.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(saveReminderPolicyAction({ enabled: true, firstAfterDays: 10, secondAfterDays: 4, escalateAfterDays: 3 })).rejects.toThrow("NEXT_REDIRECT");
    expect(prismaMock.platformSetting.findUnique).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------- Fiche 360° : requêtes bornées et indexées

type Row = Record<string, unknown>;

/**
 * Un évaluateur minimal des filtres Prisma utilisés par la fiche, sur des lignes
 * en mémoire. Un opérateur inconnu (un chemin JSON `path`, par exemple) lève une
 * erreur : on prouve ainsi qu'aucune requête ne filtre sur les métadonnées.
 */
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === "AND") return (condition as Row[]).every((c) => matches(row, c));
    if (key === "OR") return (condition as Row[]).some((c) => matches(row, c));
    const value = row[key] ?? null;
    if (condition === null || typeof condition !== "object") return value === condition;
    return Object.entries(condition as Row).every(([op, operand]) => {
      if (op === "in") return (operand as unknown[]).includes(value);
      if (op === "startsWith") return typeof value === "string" && value.startsWith(operand as string);
      if (op === "equals") return value === operand;
      if (op === "not") return value !== operand;
      throw new Error(`Opérateur non pris en charge : ${key}.${op}`);
    });
  });
}

function runQuery(rows: Row[], args: { where: Row; orderBy?: Row; take?: number }): Row[] {
  const found = rows.filter((row) => matches(row, args.where)).sort((a, b) => (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime());
  return args.take ? found.slice(0, args.take) : found;
}

describe("fiche 360° : aucun balayage complet du journal ni des e-mails", () => {
  const at = (day: number) => new Date(Date.UTC(2026, 8, day, 10));
  const PHARMACY = {
    id: "ph_1",
    organizationId: "org_1",
    createdAt: at(1),
    stockConnection: null,
    organization: { name: "Groupe", subscription: null, pharmacies: [{ id: "ph_1" }, { id: "ph_sib" }] },
    prospect: { id: "pr_1" },
    memberships: [{ id: "m1", role: "OWNER", isActive: true, createdAt: at(1), user: { id: "u_1", firstName: "T", lastName: "Itulaire", email: "t@exemple.fr", lastLoginAt: null, status: "ACTIVE" } }],
  };
  const CONTRACT = { id: "k_1", version: 1, status: "DRAFT", monthlyPriceCents: 29000, pharmacySignerEmail: "t@exemple.fr", createdAt: at(2), sentAt: null, openedAt: null, pharmacySignedAt: null, companySignedAt: null, finalizedAt: null, refusedAt: null, refusalReason: null, expiresAt: null, reminderCount: 0 };

  const AUDITS: Row[] = [
    { id: "a_own", pharmacyId: "ph_1", entityType: "Pharmacy", entityId: "ph_1", action: "platform.pharmacy_updated", metadata: {}, createdAt: at(10), platformAdminId: "adm" },
    { id: "a_clinic", pharmacyId: "ph_1", entityType: "Patient", entityId: "pa_1", action: "patient.created", metadata: {}, createdAt: at(11), platformAdminId: null },
    // Lien d'abonnement et contrat préparé : sans officine en colonne, l'officine n'était citée que dans les métadonnées.
    { id: "a_invite", pharmacyId: null, entityType: "SubscriptionInvite", entityId: "inv_1", action: "billing.invite_sent", metadata: { pharmacyId: "ph_1" }, createdAt: at(12), platformAdminId: "adm" },
    { id: "a_prepared", pharmacyId: null, entityType: "Contract", entityId: "k_1", action: "billing.contract_prepared", metadata: { pharmacyId: "ph_1" }, createdAt: at(13), platformAdminId: "adm" },
    { id: "a_user", pharmacyId: null, entityType: "User", entityId: "u_1", action: "auth.password_link_sent", metadata: {}, createdAt: at(14), platformAdminId: null },
    { id: "a_other", pharmacyId: "ph_2", entityType: "Pharmacy", entityId: "ph_2", action: "platform.pharmacy_updated", metadata: {}, createdAt: at(15), platformAdminId: "adm" },
    { id: "a_admin", pharmacyId: null, entityType: "PlatformAdmin", entityId: "adm_x", action: "platform.admin_created", metadata: {}, createdAt: at(16), platformAdminId: "adm" },
  ];
  const EMAILS: Row[] = [
    { id: "e_own", pharmacyId: "ph_1", prospectId: null, organizationId: null, kind: "WELCOME", subject: "Bienvenue", recipient: "t@exemple.fr", status: "SENT", trigger: "SYSTEM", createdAt: at(10) },
    { id: "e_dossier", pharmacyId: null, prospectId: "pr_1", organizationId: null, kind: "INVITATION", subject: "Invitation", recipient: "t@exemple.fr", status: "SENT", trigger: "SYSTEM", createdAt: at(11) },
    // Relance de paiement du groupe, tracée au nom de l'officine sœur.
    { id: "e_group", pharmacyId: "ph_sib", prospectId: null, organizationId: "org_1", kind: "PAYMENT_FAILED", subject: "Paiement", recipient: "t@exemple.fr", status: "SENT", trigger: "SYSTEM", createdAt: at(12) },
    { id: "e_sib_own", pharmacyId: "ph_sib", prospectId: null, organizationId: null, kind: "WELCOME", subject: "Bienvenue", recipient: "s@exemple.fr", status: "SENT", trigger: "SYSTEM", createdAt: at(13) },
    { id: "e_other", pharmacyId: "ph_2", prospectId: null, organizationId: "org_2", kind: "WELCOME", subject: "Bienvenue", recipient: "x@exemple.fr", status: "SENT", trigger: "SYSTEM", createdAt: at(14) },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.pharmacy.findUnique.mockResolvedValue(PHARMACY);
    prismaMock.contract.findMany.mockResolvedValue([CONTRACT]);
    prismaMock.billingPayment.count.mockResolvedValue(0);
    prismaMock.billingPayment.findMany.mockResolvedValue([]);
    prismaMock.adminNote.count.mockResolvedValue(0);
    prismaMock.platformIncident.count.mockResolvedValue(0);
    prismaMock.cancellationRequest.findFirst.mockResolvedValue(null);
    prismaMock.prospectEvent.findMany.mockResolvedValue([]);
    prismaMock.billingEvent.findMany.mockResolvedValue([]);
    prismaMock.cancellationEvent.findMany.mockResolvedValue([]);
    prismaMock.subscriptionPriceChange.findMany.mockResolvedValue([]);
    prismaMock.subscriptionInvite.findMany.mockImplementation(async ({ where }: { where: Row }) => runQuery([{ id: "inv_1", pharmacyId: "ph_1", createdAt: at(12) }, { id: "inv_2", pharmacyId: "ph_2", createdAt: at(12) }], { where }).map((r) => ({ id: r.id })));
    prismaMock.auditLog.findMany.mockImplementation(async (args: { where: Row; take?: number }) => runQuery(AUDITS, args));
    prismaMock.emailDispatch.findMany.mockImplementation(async (args: { where: Row; take?: number }) => runQuery(EMAILS, args));
    prismaMock.emailDispatch.count.mockImplementation(async (args: { where: Row }) => runQuery(EMAILS, args).length);
  });

  it("le journal : requêtes bornées sur colonnes indexées, sans filtre JSON, et rien de perdu (défaut corrigé)", async () => {
    const base = await loadPharmacy360("ph_1", at(20));
    const timeline = await loadPharmacyTimeline(base!, { now: at(20) });

    for (const [args] of prismaMock.auditLog.findMany.mock.calls as [{ where: Row; take?: number }][]) {
      expect(JSON.stringify(args.where)).not.toContain("path");
      expect(args.take).toBeGreaterThan(0);
      expect(args.take).toBeLessThanOrEqual(200);
      // Chaque requête désigne l'officine par une colonne indexée : pharmacyId, ou le couple (entityType, entityId).
      const indexed = typeof args.where.pharmacyId === "string" || (args.where.pharmacyId === null && Array.isArray((args.where.entityType as Row)?.in) && Array.isArray((args.where.entityId as Row)?.in));
      expect(indexed, JSON.stringify(args.where)).toBe(true);
    }
    const auditIds = timeline.filter((e) => e.id.startsWith("audit:")).map((e) => e.id).sort();
    expect(auditIds).toEqual(["audit:a_invite", "audit:a_own", "audit:a_prepared", "audit:a_user"]);
  });

  it("les e-mails : jamais une branche sur la seule organisation (colonne sans index), les envois du groupe gardés", async () => {
    const base = await loadPharmacy360("ph_1", at(20));
    expect(base?.counts.emails).toBe(3);
    const timeline = await loadPharmacyTimeline(base!, { now: at(20) });

    const calls = [...prismaMock.emailDispatch.count.mock.calls, ...prismaMock.emailDispatch.findMany.mock.calls] as [{ where: { OR: Row[] }; take?: number }][];
    expect(calls.length).toBeGreaterThan(0);
    for (const [args] of calls) {
      for (const branch of args.where.OR) expect("pharmacyId" in branch || "prospectId" in branch, JSON.stringify(branch)).toBe(true);
    }
    for (const [args] of prismaMock.emailDispatch.findMany.mock.calls as [{ take?: number }][]) expect(args.take).toBeLessThanOrEqual(200);
    expect(timeline.filter((e) => e.id.startsWith("email:")).map((e) => e.id).sort()).toEqual(["email:e_dossier", "email:e_group", "email:e_own"]);
  });
});
