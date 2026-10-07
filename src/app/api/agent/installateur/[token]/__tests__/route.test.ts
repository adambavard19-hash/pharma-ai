import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * L'installateur Windows : le jeton n'est vérifié qu'ici, le fichier est le même
 * pour tout le monde, et seul son NOM porte le jeton (c'est là que l'installateur le lit).
 */

const mocks = vi.hoisted(() => ({ peekPostInstallLink: vi.fn(), resolvePublicBaseUrl: vi.fn(), readFile: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/services/stock-sync", () => ({ peekPostInstallLink: mocks.peekPostInstallLink }));
vi.mock("@/server/public-url", () => ({ resolvePublicBaseUrl: mocks.resolvePublicBaseUrl }));
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, readFile: (...args: Parameters<typeof actual.readFile>) => mocks.readFile(...args) ?? actual.readFile(...args) };
});

const route = await import("../route");
const { tokenFromInstallerName } = await import("../../../../../../../agent/src/installer");

const TOKEN = "AbCdEfGhIjKlMnOpQrSt";
const BINARY = join(process.cwd(), "agent", "installateur", "PharmaBoost-Installation.exe");
const call = (token = TOKEN) => route.GET(new Request(`http://localhost/api/agent/installateur/${token}`), { params: Promise.resolve({ token }) });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.resolvePublicBaseUrl.mockReturnValue({ url: "https://pharmaboost.app", reach: "PUBLIC", secure: true });
  mocks.readFile.mockImplementation(async (path: string) => readFileSync(path));
  mocks.peekPostInstallLink.mockResolvedValue({ pharmacyName: "Pharmacie du Port", label: "Comptoir 1", serverHostname: null, expiresAt: new Date("2026-10-15T10:00:00Z") });
});

describe("GET /api/agent/installateur/[token]", () => {
  it("lien valable : le fichier livré est l'installateur, sous un nom qui porte le jeton", async () => {
    const response = await call();
    const bytes = Buffer.from(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(mocks.peekPostInstallLink).toHaveBeenCalledWith(TOKEN);
    expect(response.headers.get("Content-Disposition")).toBe(`attachment; filename="PharmaBoost-Installation-${TOKEN}.exe"`);
    expect(response.headers.get("Content-Type")).toBe("application/vnd.microsoft.portable-executable");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Content-Length")).toBe(String(bytes.length));
    expect(bytes.equals(readFileSync(BINARY))).toBe(true);
    expect(bytes.subarray(0, 2).toString("latin1")).toBe("MZ");
  });

  it("le nom livré est celui que l'installateur sait relire : le même jeton ressort", async () => {
    const response = await call();
    const disposition = response.headers.get("Content-Disposition") ?? "";
    const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "";
    expect(tokenFromInstallerName(name)).toBe(TOKEN);
    // Et quand le navigateur ajoute « (1) » parce que le fichier existe déjà.
    expect(tokenFromInstallerName(name.replace(".exe", " (1).exe"))).toBe(TOKEN);
  });

  it("le fichier est le même pour toutes les officines : seuls le nom et l'en-tête changent", async () => {
    const first = Buffer.from(await (await call("AAAAAAAAAAAAAAAAAAAAAAAA")).arrayBuffer());
    const second = Buffer.from(await (await call("BBBBBBBBBBBBBBBBBBBBBBBB")).arrayBuffer());
    expect(first.equals(second)).toBe(true);
  });

  it("lien expiré, déjà utilisé ou inconnu : aucun octet de l'installateur, retour à la page du lien qui l'explique", async () => {
    mocks.peekPostInstallLink.mockResolvedValue(null);
    const response = await call();
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(`https://pharmaboost.app/installer/${TOKEN}`);
    expect(mocks.readFile).not.toHaveBeenCalled();
  });

  it("un jeton piégé ne sort jamais tel quel : ni en-tête, ni adresse de redirection non encodée", async () => {
    mocks.peekPostInstallLink.mockResolvedValue(null);
    const response = await call('x"\r\nSet-Cookie: a=b');
    expect(response.headers.get("Content-Disposition")).toBeNull();
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(response.headers.get("Location")).toContain("%22");
    expect(response.headers.get("Location")).not.toMatch(/[\r\n"]/);
  });

  it("installateur absent du déploiement : un 503 lisible, pas une page d'erreur", async () => {
    mocks.readFile.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    const response = await call();
    expect(response.status).toBe(503);
    expect(await response.text()).toContain("contact@pharmaboost.app");
    expect(response.headers.get("Content-Disposition")).toBeNull();
  });
});
