import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Les gestes qui ont un effet HORS de l'officine sont refusés dans l'officine de démonstration,
 * AVANT tout accès à la base ou à un service : commande à un partenaire, message à l'équipe
 * PharmaBoost, portail de paiement, recherche de photos sur Internet, changement de mot de passe.
 *
 * La base est ici un piège : la moindre lecture ou écriture fait échouer le test.
 */

const touched = vi.hoisted(() => ({ calls: [] as string[] }));
const session = vi.hoisted(() => ({
  current: null as unknown,
  demo: () => ({ user: { id: "usr_1", email: "demo@pharmaboost.test", fullName: "Camille Moreau" }, pharmacy: { id: "ph_demo", name: "Pharmacie des Lilas", slug: "pharmacie-demo-pharmaboost", isDemo: true }, scope: { pharmacyId: "ph_demo", organizationId: "org_demo", userId: "usr_1", isDemo: true }, permissions: new Set() }),
  real: () => ({ user: { id: "usr_2", email: "titulaire@officine.fr", fullName: "Titulaire Réel" }, pharmacy: { id: "ph_real", name: "Pharmacie du Port", slug: "pharmacie-du-port", isDemo: false }, scope: { pharmacyId: "ph_real", organizationId: "org_real", userId: "usr_2" }, permissions: new Set() }),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }) }));
vi.mock("@/server/auth/session", () => ({
  requirePermission: async () => session.current,
  requireSession: async () => session.current,
  getSession: async () => session.current,
  getRequestMeta: async () => ({ ipAddress: null, userAgent: null }),
  createSession: vi.fn(),
  destroySession: vi.fn(),
  switchPharmacy: vi.fn(),
}));
vi.mock("@/server/db/client", () => ({
  prisma: new Proxy({}, { get: (_target, model: string) => { touched.calls.push(`prisma.${model}`); throw new Error(`Base touchée (${model}) avant le refus`); } }),
}));
vi.mock("@/server/services/sales/notifications", () => ({ notifyAdmins: (...args: unknown[]) => { touched.calls.push("notifyAdmins"); return args; } }));
vi.mock("@/server/services/partners/orders", () => ({
  openPartnerLink: () => touched.calls.push("openPartnerLink"),
  placeOrder: () => touched.calls.push("placeOrder"),
  recordBrandView: () => touched.calls.push("recordBrandView"),
  requestContact: () => touched.calls.push("requestContact"),
}));
vi.mock("@/server/billing/subscriptions", () => ({ createPortalSession: () => touched.calls.push("createPortalSession") }));
vi.mock("@/server/audit/log", () => ({ recordAudit: () => touched.calls.push("recordAudit") }));

const partners = await import("../partners");
const assortment = await import("../assortment");
const billing = await import("../billing");
const stockImport = await import("../stock-import");
const auth = await import("../auth");
const team = await import("../team");

const cases: [string, () => Promise<unknown>, RegExp][] = [
  ["commande à un partenaire", () => partners.placePartnerOrderAction({ brandId: "b1", source: "PARTNERS_PAGE", lines: [{ productId: "p1", quantity: 2 }], note: null } as never), /aucune commande/],
  ["demande de contact au partenaire", () => partners.requestPartnerContactAction({ brandId: "b1", source: "PARTNERS_PAGE", contactEmail: "a@b.fr", contactPhone: "", contactName: "Camille", message: "Bonjour" } as never), /n'est pas transmise/],
  ["ouverture du site d'un partenaire", () => partners.openPartnerLinkAction({ brandId: "b1", source: "PARTNERS_PAGE" } as never), /n'est pas ouvert/],
  ["suggestion de laboratoire à l'équipe PharmaBoost", () => assortment.suggestLabAction({ name: "Laboratoire Test", need: "", note: "" } as never), /n'est pas transmise/],
  ["portail de paiement", () => billing.openBillingPortalAction(), /portail de paiement/],
  ["recherche de photos sur Internet", () => stockImport.fetchProductImagesAction(), /aucune recherche/],
  ["changement du mot de passe du compte", () => auth.changeOwnPasswordAction({ currentPassword: "x", newPassword: "y" }), /mot de passe/],
  ["changement du mot de passe d'un collaborateur", () => team.resetCollaboratorPasswordAction({ userId: "usr_9", password: "Mot2Passe!Solide" } as never), /mots de passe/],
];

beforeEach(() => {
  touched.calls = [];
  session.current = session.demo();
});

describe("l'officine de démonstration", () => {
  for (const [label, run, message] of cases) {
    it(`refuse : ${label}, sans toucher la base ni aucun service`, async () => {
      const result = (await run()) as { ok: boolean; error?: string };
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/Mode démo/);
      expect(result.error).toMatch(message);
      expect(touched.calls).toEqual([]);
    });
  }
});

describe("une vraie officine", () => {
  for (const [label, run] of cases) {
    it(`n'est pas arrêtée par la barrière : ${label}`, async () => {
      session.current = session.real();
      // Elle continue jusqu'à ses propres contrôles (ici : la base-piège, ou un refus métier qui n'est PAS le refus de démonstration).
      let outcome: { ok?: boolean; error?: string } | null = null;
      try {
        outcome = (await run()) as { ok?: boolean; error?: string };
      } catch {
        outcome = null;
      }
      expect(outcome?.error ?? "").not.toMatch(/Mode démo/);
    });
  }
});
