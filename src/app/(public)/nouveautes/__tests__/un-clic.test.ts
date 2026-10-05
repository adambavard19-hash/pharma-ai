import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La route « un clic » de la désinscription des nouveautés : ce que la
 * messagerie du patient appelle (POST, RFC 8058) et ce qu'un aperçu ou un
 * antivirus ouvre (GET). Le service est remplacé : la désinscription réelle est
 * éprouvée, de l'en-tête au POST, dans les tests du service.
 */

const mocks = vi.hoisted(() => ({ confirmNewsUnsubscribe: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/services/patient-news", () => mocks);

const route = await import("../desinscription/[token]/un-clic/route");

const context = (token: string) => ({ params: Promise.resolve({ token }) });
const post = (token: string, ip: string) =>
  route.POST(new Request("http://localhost/x", { method: "POST", headers: { "x-forwarded-for": ip, "content-type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click" }), context(token));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.confirmNewsUnsubscribe.mockResolvedValue({ ok: true, pharmacyName: "Pharmacie Saint-Michel" });
});

describe("POST : la désinscription en un clic", () => {
  it("désinscrit par le service (le seul chemin d'écriture), répond 200 et ne dit ni le nom de la pharmacie ni rien de l'abonné", async () => {
    const response = await post("jeton-123", "10.2.0.1");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.confirmNewsUnsubscribe).toHaveBeenCalledExactlyOnceWith("jeton-123");
  });

  it("un jeton refusé : 400, la raison du service telle quelle, rien de plus", async () => {
    mocks.confirmNewsUnsubscribe.mockResolvedValue({ ok: false, error: "Ce lien de désinscription n'est plus valide. Adressez-vous à votre pharmacie : elle supprimera votre adresse." });
    const response = await post("n-importe-quoi", "10.2.0.2");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "Ce lien de désinscription n'est plus valide. Adressez-vous à votre pharmacie : elle supprimera votre adresse." });
  });

  it("limite de débit : au-delà de 30 demandes par heure et par adresse IP, 429 et le service n'est plus appelé", async () => {
    for (let i = 0; i < 30; i += 1) expect((await post("jeton-123", "10.2.0.9")).status).toBe(200);
    mocks.confirmNewsUnsubscribe.mockClear();
    const limited = await post("jeton-123", "10.2.0.9");
    expect(limited.status).toBe(429);
    expect(mocks.confirmNewsUnsubscribe).not.toHaveBeenCalled();
    expect((await post("jeton-123", "10.2.0.10")).status).toBe(200);
  });
});

describe("GET : n'écrit rien", () => {
  it("mène à la page de confirmation, sans appeler le service", async () => {
    await expect(route.GET(new Request("http://localhost/x"), context("jeton-123"))).rejects.toMatchObject({ digest: expect.stringContaining("/nouveautes/desinscription/jeton-123") });
    expect(mocks.confirmNewsUnsubscribe).not.toHaveBeenCalled();
  });

  it("le jeton est encodé dans l'adresse de redirection : il ne peut pas en changer le chemin", async () => {
    await expect(route.GET(new Request("http://localhost/x"), context("a/b?c=d"))).rejects.toMatchObject({ digest: expect.stringContaining("/nouveautes/desinscription/a%2Fb%3Fc%3Dd") });
  });
});

describe("la route", () => {
  it("n'est jamais mise en cache : un POST ne doit pas être servi depuis une réponse enregistrée", () => {
    expect(route.dynamic).toBe("force-dynamic");
  });
});
