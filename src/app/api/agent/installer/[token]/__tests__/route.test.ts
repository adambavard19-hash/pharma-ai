import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * L'installateur d'un poste de comptoir : le raccourci « Stock PharmaBoost »
 * n'est demandé que si le serveur de l'officine est déjà relié, et les noms
 * d'officine et de poste ne deviennent jamais des commandes.
 */

const mocks = vi.hoisted(() => ({ peekPostInstallLink: vi.fn(), resolvePublicBaseUrl: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/services/stock-sync", () => ({ peekPostInstallLink: mocks.peekPostInstallLink }));
vi.mock("@/server/public-url", () => ({ resolvePublicBaseUrl: mocks.resolvePublicBaseUrl }));

const route = await import("../route");

const TOKEN = "AbCdEfGhIjKlMnOpQrSt";
const call = (token = TOKEN) => route.GET(new Request(`http://localhost/api/agent/installer/${token}`), { params: Promise.resolve({ token }) });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.resolvePublicBaseUrl.mockReturnValue({ url: "https://pharmaboost.app", reach: "PUBLIC", secure: true });
});

describe("GET /api/agent/installer/[token]", () => {
  it("avec un serveur relié : le poste reçoit le dossier partagé du serveur", async () => {
    mocks.peekPostInstallLink.mockResolvedValue({ pharmacyName: "Pharmacie du Port", label: "Comptoir 1", serverHostname: "SRV-PHARMA" });
    const response = await call();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.peekPostInstallLink).toHaveBeenCalledWith(TOKEN);
    expect(body).toContain(`-Code '${TOKEN}' -Serveur $serveur -DossierStock '\\\\SRV-PHARMA\\PharmaBoost'`);
    expect(body).toContain("install-poste-windows.ps1");
    expect(body).toContain("Write-Host 'PharmaBoost Connect : poste « Comptoir 1 », Pharmacie du Port'");
  });

  it("sans serveur relié : pas de raccourci demandé, et pas d'erreur", async () => {
    mocks.peekPostInstallLink.mockResolvedValue({ pharmacyName: "Pharmacie du Port", label: null, serverHostname: null });
    const response = await call();
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).not.toContain("-DossierStock");
    expect(body).toContain(`-Code '${TOKEN}' -Serveur $serveur\n`);
  });

  it("l'installation de l'existant est conservée : téléchargement du programme et de l'installateur de poste", async () => {
    mocks.peekPostInstallLink.mockResolvedValue({ pharmacyName: "P", label: null, serverHostname: null });
    const body = await (await call()).text();
    expect(body).toContain('$serveur = \'https://pharmaboost.app\'');
    expect(body).toContain("/api/agent/fichiers/pharmaboost-connect.js");
    expect(body).toContain("/api/agent/fichiers/install-poste-windows.ps1");
    expect(body).toContain('[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12');
  });

  it("un nom d'officine ou de poste piégé reste un texte : jamais une commande", async () => {
    mocks.peekPostInstallLink.mockResolvedValue({ pharmacyName: 'Pharma $(calc) "x"', label: "a'\nRemove-Item C:\\ -Recurse", serverHostname: "SRV;calc" });
    const body = await (await call()).text();
    expect(body.split("\n").some((line) => line.startsWith("Remove-Item"))).toBe(false);
    expect(body).toContain("Write-Host 'PharmaBoost Connect : poste « a'' Remove-Item C:\\ -Recurse », Pharma $(calc) \"x\"'");
    // Un nom de machine douteux n'est jamais recopié.
    expect(body).not.toContain("-DossierStock");
    expect(body).not.toContain("SRV;calc");
  });

  it("un lien invalide ou expiré : un message rouge servi en 200, pas de script d'installation", async () => {
    mocks.peekPostInstallLink.mockResolvedValue(null);
    const response = await call("trop-court");
    const body = await response.text();
    // `irm … | iex` : Invoke-RestMethod lève une exception sur un statut d'erreur et ne passerait jamais le message à iex.
    expect(response.status).toBe(200);
    expect(response.ok).toBe(true);
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body).toMatch(/^Write-Host '.*n''est plus valable.*' -ForegroundColor Red\n$/);
    expect(body).not.toContain("Invoke-WebRequest");
    expect(body.trimEnd().split("\n")).toHaveLength(1);
  });
});
