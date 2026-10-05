import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * L'action publique de souscription : plus de formule, un confrère à parrainer
 * facultatif et borné, ses erreurs de champ renvoyées en français sous
 * `referee.email` / `referee.phone`, et un ancien lien de confirmation qui ne fait
 * jamais partir le contrat. Le service est simulé : on vérifie ce que l'action lui
 * transmet, et ce qu'elle refuse avant de l'appeler.
 */
const mocks = vi.hoisted(() => ({ requestSubscription: vi.fn(), confirmSubscription: vi.fn(), receiveSiteLead: vi.fn() }));

// Une adresse IP différente à chaque appel : la limite d'envois (trois par heure) ne s'en mêle pas.
let ip = 0;
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": `10.0.${Math.floor(++ip / 250)}.${ip % 250}` }) }));
vi.mock("@/server/services/site-leads", () => ({ receiveSiteLead: mocks.receiveSiteLead }));
vi.mock("@/server/services/subscription-requests", async () => {
  const core = await vi.importActual<typeof import("@/core/contracts/subscription-request")>("@/core/contracts/subscription-request");
  return { normalizeSubscriptionRequest: core.normalizeSubscriptionRequest, requestSubscription: mocks.requestSubscription, confirmSubscription: mocks.confirmSubscription };
});

const { submitSubscriptionRequestAction, confirmSubscriptionAction } = await import("../site-leads");

let counter = 0;
const payload = (overrides: Record<string, unknown> = {}) => {
  // Une adresse différente à chaque appel : la limite d'envois par adresse ne s'en mêle pas.
  counter += 1;
  return { pharmacyName: "Pharmacie du Port", legalName: "SELARL Pharmacie du Port", siret: "73282932000074", addressLine1: "1 quai du Port", postalCode: "13002", city: "Marseille", ownerFirstName: "Marc", ownerLastName: "Delaunay", ownerTitle: "Pharmacien titulaire", ownerEmail: `marc${counter}@port.fr`, confirm: true as const, ...overrides };
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requestSubscription.mockResolvedValue({ ok: true, outcome: { status: "RECEIVED", prospectId: "p-1", reason: "x" } });
});

describe("action de souscription : le confrère à parrainer", () => {
  it("le confrère valide est transmis au service ; un nom vide devient `null`", async () => {
    const result = await submitSubscriptionRequestAction(payload({ referee: { name: "", email: "confrere@pharmacie-durand.fr", phone: "06 12 34 56 78" } }));
    expect(result).toMatchObject({ ok: true, data: { outcome: "RECEIVED" } });
    expect(mocks.requestSubscription.mock.calls[0][0]).toMatchObject({ referee: { name: null, email: "confrere@pharmacie-durand.fr", phone: "06 12 34 56 78" } });
  });

  it("sans confrère (absent ou nul), `referee` est nul : le parcours d'avant reste valide", async () => {
    await submitSubscriptionRequestAction(payload());
    await submitSubscriptionRequestAction(payload({ referee: null }));
    expect(mocks.requestSubscription.mock.calls.map((c) => c[0].referee)).toEqual([null, null]);
  });

  it("il n'y a plus de formule : un `formula` envoyé est ignoré et n'atteint jamais le service", async () => {
    await submitSubscriptionRequestAction(payload({ formula: "ANNUAL" }) as never);
    expect(mocks.requestSubscription.mock.calls[0][0]).not.toHaveProperty("formula");
  });

  it("e-mail ou téléphone invalides : erreurs de champ en français, le service n'est pas appelé", async () => {
    const result = await submitSubscriptionRequestAction(payload({ referee: { name: "Dr Durand", email: "pas-un-mail", phone: "12" } }));
    expect(result).toMatchObject({ ok: false, error: "Certaines informations sont à corriger.", fieldErrors: { "referee.email": "Cette adresse e-mail n'est pas valide.", "referee.phone": "Ce numéro de téléphone n'est pas valide." } });
    expect(mocks.requestSubscription).not.toHaveBeenCalled();
  });

  it("l'adresse du signataire est refusée : « Indiquez un confrère, pas vous-même »", async () => {
    const own = payload();
    const result = await submitSubscriptionRequestAction({ ...own, referee: { email: own.ownerEmail.toUpperCase(), phone: "06 12 34 56 78" } });
    expect(result).toMatchObject({ ok: false, fieldErrors: { "referee.email": "Indiquez un confrère, pas vous-même." } });
    expect(mocks.requestSubscription).not.toHaveBeenCalled();
  });

  it("les champs sont bornés dès la forme : nom 120, e-mail 160, téléphone 30 (avant toute règle du domaine)", async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ name: "x".repeat(121), email: "a@b.fr", phone: "0612345678" }, "120 caractères au plus."],
      [{ email: `${"x".repeat(160)}@b.fr`, phone: "0612345678" }, "160 caractères au plus."],
      [{ email: "a@b.fr", phone: "0".repeat(31) }, "30 caractères au plus."],
    ];
    for (const [referee, message] of cases) {
      expect(await submitSubscriptionRequestAction(payload({ referee }))).toMatchObject({ ok: false, error: message });
    }
    // À la limite exacte, la forme passe.
    expect((await submitSubscriptionRequestAction(payload({ referee: { name: "x".repeat(120), email: "a@b.fr", phone: "0612345678" } }))).ok).toBe(true);
    expect(mocks.requestSubscription).toHaveBeenCalledTimes(1);
  });

  it("le champ piège (`website`) rempli : la demande est avalée sans rien enregistrer, confrère compris", async () => {
    const result = await submitSubscriptionRequestAction(payload({ website: "http://spam", referee: { email: "a@b.fr", phone: "0612345678" } }));
    expect(result).toMatchObject({ ok: true, data: { outcome: "RECEIVED" } });
    expect(mocks.requestSubscription).not.toHaveBeenCalled();
  });
});

describe("action de confirmation : l'ancien lien ne fait plus partir le contrat", () => {
  it("la réponse dit que le contrat est en préparation (jamais « il vient de partir »)", async () => {
    mocks.confirmSubscription.mockResolvedValue({ ok: false, error: "Votre adresse est confirmée. Votre contrat est en cours de préparation : vous le recevez par e-mail très prochainement." });
    const result = await confirmSubscriptionAction("jeton");
    expect(result).toEqual({ ok: false, error: expect.stringContaining("en cours de préparation") });
  });

  it("un jeton absurde est refusé avant tout appel", async () => {
    expect(await confirmSubscriptionAction("x".repeat(2001))).toMatchObject({ ok: false, error: "Lien invalide." });
    expect(mocks.confirmSubscription).not.toHaveBeenCalled();
  });
});
