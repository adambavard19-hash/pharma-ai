import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma";

/**
 * L'installation et la réinitialisation de l'officine de démonstration ne touchent QU'À elle.
 * La base est un double qui enregistre chaque appel : on lit ensuite ce qui a été écrit, effacé ou lu.
 */

type Call = { model: string; method: string; args: Record<string, unknown> };
const log = vi.hoisted(() => ({ calls: [] as Call[], pharmacy: null as null | { id: string; isDemo: boolean; organizationId: string }, user: null as null | { id: string; organizationId: string } }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/security/password", () => ({ hashPassword: vi.fn(async (password: string) => `hash:${password}`) }));
vi.mock("@/server/services/notifications", () => ({ refreshStockNotifications: vi.fn(async () => undefined) }));
vi.mock("@/config/env", () => ({ appEnvironment: () => "development", isDemoMode: () => false }));
vi.mock("@/server/db/client", () => ({
  prisma: new Proxy(
    {},
    {
      get: (_target, model: string) =>
        new Proxy(
          {},
          {
            get: (_inner, method: string) => async (args: Record<string, unknown> = {}) => {
              log.calls.push({ model, method, args });
              const key = `${model}.${method}`;
              if (key === "pharmacy.findUnique") return log.pharmacy;
              if (key === "organization.upsert") return { id: "org_demo" };
              if (key === "pharmacy.upsert") return { id: "ph_demo" };
              if (key === "user.findUnique") return log.user;
              if (key === "user.create" || key === "user.update") return { id: `usr_${log.calls.length}` };
              if (key === "drugSpecialty.findMany") {
                const name = ((args.where as { name?: { startsWith?: string } })?.name?.startsWith ?? "BOITE") as string;
                return [{ id: `sp_${name.slice(0, 12)}`, name, presentations: [{ id: `pr_${name.slice(0, 12)}`, cip13: "3400000000017", priceCents: 500, approvedForCommunities: true }] }];
              }
              if (method === "findFirst" || method === "findUnique") return null;
              if (method === "findMany") return [];
              return { count: 0 };
            },
          },
        ),
    },
  ),
}));

const { installDemoPharmacy, KEPT_MODELS, WIPED_MODELS } = await import("../provision");
const { DEMO_PHARMACY_SLUG, DEMO_TEAM } = await import("@/core/demo/identity");

beforeEach(() => {
  log.calls = [];
  log.pharmacy = null;
  log.user = null;
});

const writes = () => log.calls.filter((call) => ["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany"].includes(call.method));

describe("l'installation", () => {
  it("n'efface que l'activité de l'officine de démonstration, jamais celle d'une autre", async () => {
    await installDemoPharmacy({ now: new Date("2026-10-06T10:00:00Z") });
    const wipes = log.calls.filter((call) => call.method === "deleteMany" && call.model !== "user" && call.model !== "counterPost");
    expect(wipes.map((call) => call.model).sort()).toEqual([...WIPED_MODELS].sort());
    for (const wipe of wipes) expect(wipe.args.where, wipe.model).toEqual({ pharmacyId: "ph_demo" });
    // Les postes appairés pendant un rendez-vous partent aussi, mais le poste simulé reste.
    const posts = log.calls.filter((call) => call.model === "counterPost" && call.method === "deleteMany");
    expect(posts).toHaveLength(1);
    expect(posts[0].args.where).toEqual({ pharmacyId: "ph_demo", hostname: { not: "poste-demo" } });
    // L'équipe ajoutée pendant un rendez-vous disparaît, mais seulement dans le groupe de démonstration.
    const users = log.calls.find((call) => call.model === "user" && call.method === "deleteMany");
    expect(users?.args.where).toMatchObject({ organizationId: "org_demo" });
  });

  it("n'écrit que des lignes de l'officine de démonstration", async () => {
    await installDemoPharmacy({ now: new Date("2026-10-06T10:00:00Z") });
    for (const call of log.calls.filter((item) => item.method === "createMany")) {
      const rows = ((call.args.data as Record<string, unknown>[]) ?? []).filter((row) => "pharmacyId" in row);
      for (const row of rows) expect(row.pharmacyId, call.model).toBe("ph_demo");
    }
  });

  it("ne touche jamais aux commerciaux, à la plateforme, aux abonnements ni aux autres officines", async () => {
    await installDemoPharmacy({ now: new Date("2026-10-06T10:00:00Z") });
    const touched = new Set(writes().map((call) => call.model));
    for (const forbidden of ["salesRep", "salesDirector", "platformAdmin", "subscription", "contract", "prospect"]) expect(touched.has(forbidden), forbidden).toBe(false);
    // Les groupes et officines : un seul upsert chacun, sur l'identifiant réservé.
    const pharmacyUpserts = log.calls.filter((call) => call.model === "pharmacy" && call.method === "upsert");
    expect(pharmacyUpserts).toHaveLength(1);
    expect(pharmacyUpserts[0].args.where).toEqual({ slug: DEMO_PHARMACY_SLUG });
    expect(pharmacyUpserts[0].args.create).toMatchObject({ isDemo: true, patientNewsEnabled: false });
    expect(pharmacyUpserts[0].args.update).toMatchObject({ isDemo: true });
  });

  it("l'officine est marquée démonstration, sans abonnement, et l'équipe n'a que des adresses .test", async () => {
    await installDemoPharmacy({ now: new Date("2026-10-06T10:00:00Z") });
    const created = log.calls.filter((call) => call.model === "user" && call.method === "create");
    expect(created).toHaveLength(DEMO_TEAM.length);
    for (const call of created) expect((call.args.data as { email: string }).email).toMatch(/\.test$/);
    expect(log.calls.some((call) => call.model === "subscription")).toBe(false);
  });

  it("marque tout ce qu'elle crée comme démonstration (ventes, conseils, produits, ordonnances)", async () => {
    await installDemoPharmacy({ now: new Date("2026-10-06T10:00:00Z") });
    for (const model of ["sale", "recommendation", "prescription", "product", "analysisRun"]) {
      const rows = log.calls.filter((call) => call.model === model && call.method === "createMany").flatMap((call) => call.args.data as { isDemo?: boolean }[]);
      expect(rows.length, model).toBeGreaterThan(0);
      expect(rows.every((row) => row.isDemo === true), model).toBe(true);
    }
  });

  it("refuse d'écraser une vraie officine qui porterait l'identifiant réservé", async () => {
    log.pharmacy = { id: "ph_reelle", isDemo: false, organizationId: "org_reelle" };
    await expect(installDemoPharmacy({})).rejects.toThrow(/qui n'en est pas une/);
    expect(writes().filter((call) => call.method !== "upsert" || call.model !== "organization")).toHaveLength(0);
  });

  it("refuse une adresse d'équipe qui appartiendrait à un autre groupe", async () => {
    log.user = { id: "usr_autre", organizationId: "org_autre" };
    await expect(installDemoPharmacy({})).rejects.toThrow(/autre groupe/);
    expect(log.calls.some((call) => call.method === "deleteMany")).toBe(false);
  });

  it("ne change pas les mots de passe d'une équipe existante à moins qu'on le demande", async () => {
    log.user = { id: "usr_existant", organizationId: "org_demo" };
    const kept = await installDemoPharmacy({});
    expect(kept.password).toBeNull();
    for (const call of log.calls.filter((item) => item.model === "user" && item.method === "update")) expect(call.args.data).not.toHaveProperty("passwordHash");
    log.calls = [];
    const reset = await installDemoPharmacy({ setPasswords: true, password: "Mot2Passe!Solide" });
    expect(reset.password).toBe("Mot2Passe!Solide");
    expect(log.calls.filter((item) => item.model === "user" && item.method === "update").every((call) => (call.args.data as { passwordHash?: string }).passwordHash === "hash:Mot2Passe!Solide")).toBe(true);
  });
});

describe("la liste de ce qui est effacé", () => {
  it("couvre tous les modèles qui portent un identifiant d'officine : aucun nouveau modèle n'échappe à la réinitialisation sans décision", () => {
    const withPharmacy = Prisma.dmmf.datamodel.models.filter((model) => model.fields.some((field) => field.name === "pharmacyId")).map((model) => model.name.charAt(0).toLowerCase() + model.name.slice(1));
    const decided = new Set<string>([...WIPED_MODELS, ...KEPT_MODELS]);
    const undecided = withPharmacy.filter((model) => !decided.has(model));
    expect(undecided, `à classer dans WIPED_MODELS ou KEPT_MODELS : ${undecided.join(", ")}`).toEqual([]);
    expect(WIPED_MODELS.filter((model) => KEPT_MODELS.includes(model as never))).toEqual([]);
  });
});
