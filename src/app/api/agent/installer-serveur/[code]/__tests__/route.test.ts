import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * L'installateur du serveur en une ligne : le code est vérifié sans être
 * consommé, le script ne dit rien de l'officine, et un code mort reçoit un
 * message clair. Ni base ni réseau : le service est simulé.
 */

const mocks = vi.hoisted(() => ({ peekServerPairing: vi.fn(), resolvePublicBaseUrl: vi.fn(), rateLimited: vi.fn(), pairAgent: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/services/stock-sync", () => ({ peekServerPairing: mocks.peekServerPairing, pairAgent: mocks.pairAgent }));
vi.mock("@/server/public-url", () => ({ resolvePublicBaseUrl: mocks.resolvePublicBaseUrl }));
vi.mock("@/server/http/rate-limit", () => ({ rateLimited: mocks.rateLimited, clientIp: () => "203.0.113.7" }));

const route = await import("../route");

const call = (code: string) => route.GET(new Request(`http://localhost/api/agent/installer-serveur/${code}`), { params: Promise.resolve({ code }) });

/**
 * Ce que voit l'équipe : `irm <adresse> | iex`. `Invoke-RestMethod` de Windows
 * PowerShell 5.1 lève une exception sur tout statut hors 2xx et ne passe alors
 * rien à `iex` : le message en français ne s'afficherait jamais, seulement
 * « Le serveur distant a retourné une erreur : (410) Gone ». Un refus doit donc
 * être une réponse réussie dont le corps est le message.
 */
const expectSeenByPowerShell = (response: Response) => {
  expect(response.status).toBe(200);
  expect(response.ok).toBe(true);
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.resolvePublicBaseUrl.mockReturnValue({ url: "https://pharmaboost.app/", reach: "PUBLIC", secure: true });
  mocks.rateLimited.mockReturnValue(false);
});

describe("GET /api/agent/installer-serveur/[code]", () => {
  it("un code valable : le script du serveur, en texte brut, jamais mis en cache", async () => {
    mocks.peekServerPairing.mockResolvedValue({ lgo: "lgpi" });
    const response = await call("123456");
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.peekServerPairing).toHaveBeenCalledWith("123456");
    // Le code, le logiciel de la liaison et l'adresse publique (sans « / » final) sont passés à l'installateur.
    expect(body).toContain("$code = '123456'");
    expect(body).toContain("$lgo = 'lgpi'");
    expect(body).toContain("$serveur = 'https://pharmaboost.app'");
    expect(body).toContain("install-windows.ps1");
  });

  it("vérifie le code SANS le consommer : seul le service de lecture est appelé", async () => {
    mocks.peekServerPairing.mockResolvedValue({ lgo: "autre" });
    await call("123456");
    expect(mocks.peekServerPairing).toHaveBeenCalledTimes(1);
    expect(mocks.pairAgent).not.toHaveBeenCalled();
  });

  it("le script ne contient aucun nom d'officine, même si le service en laissait passer un", async () => {
    mocks.peekServerPairing.mockResolvedValue({ lgo: "lgpi", pharmacyName: "Pharmacie du Port", pharmacyId: "ph_secret" });
    const body = await (await call("123456")).text();
    expect(body).not.toContain("Pharmacie du Port");
    expect(body).not.toContain("ph_secret");
  });

  it("vérifie les droits d'administrateur avant d'installer, et le dit en rouge", async () => {
    mocks.peekServerPairing.mockResolvedValue({ lgo: "lgpi" });
    const body = await (await call("123456")).text();
    expect(body).toContain("Ouvrez PowerShell en tant qu'administrateur");
    expect(body.indexOf("IsInRole")).toBeLessThan(body.indexOf("Invoke-WebRequest"));
  });

  it("une autre adresse publique : c'est celle-là que le serveur appellera", async () => {
    mocks.resolvePublicBaseUrl.mockReturnValue({ url: "http://192.168.1.20:3000", reach: "LAN", secure: false });
    mocks.peekServerPairing.mockResolvedValue({ lgo: "winpharma" });
    const body = await (await call("123456")).text();
    expect(body).toContain("$serveur = 'http://192.168.1.20:3000'");
    expect(body).toContain("$lgo = 'winpharma'");
  });

  it("un code invalide ou expiré : un message rouge servi en 200 (jamais un script d'installation)", async () => {
    mocks.peekServerPairing.mockResolvedValue(null);
    const response = await call("123456");
    const body = await response.text();
    expectSeenByPowerShell(response);
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body).toMatch(/^Write-Host '.*n''est plus valable.*' -ForegroundColor Red\n$/);
    expect(body).toContain("Préparer l''installation du serveur");
    expect(body).not.toContain("Invoke-WebRequest");
  });

  it("un code qui n'a pas la forme d'un code : même réponse", async () => {
    mocks.peekServerPairing.mockResolvedValue(null);
    for (const code of ["abc", "12345", "1234567", "123456; calc"]) {
      const response = await call(code);
      expectSeenByPowerShell(response);
      expect(await response.text()).toContain("n''est plus valable");
      expect(mocks.peekServerPairing).toHaveBeenLastCalledWith(code);
    }
  });

  it("trop d'essais depuis la même adresse : le message est servi en 200, et le code n'est même pas regardé", async () => {
    mocks.rateLimited.mockReturnValue(true);
    const response = await call("123456");
    const body = await response.text();
    expectSeenByPowerShell(response);
    expect(body).toMatch(/^Write-Host '.*Trop d''essais.*' -ForegroundColor Red\n$/);
    expect(body).not.toContain("Invoke-WebRequest");
    expect(mocks.peekServerPairing).not.toHaveBeenCalled();
    expect(mocks.rateLimited).toHaveBeenCalledWith("installer-serveur:203.0.113.7", expect.any(Number), expect.any(Number));
  });

  it.each([
    ["un code mort", () => mocks.peekServerPairing.mockResolvedValue(null)],
    ["trop d'essais", () => mocks.rateLimited.mockReturnValue(true)],
  ])("un refus (%s) n'exécute rien d'autre qu'un affichage : une seule ligne, un seul Write-Host", async (_name, arrange) => {
    arrange();
    const body = await (await call("123456")).text();
    expect(body.trimEnd().split("\n")).toHaveLength(1);
    expect(body.startsWith("Write-Host ")).toBe(true);
    expect(body).not.toMatch(/\b(iex|Invoke-\w+|Start-Process|Remove-Item|New-Item)\b/i);
  });
});
