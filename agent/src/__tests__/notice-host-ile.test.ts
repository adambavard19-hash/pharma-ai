import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { islandPageUrl, NoticeCenter, withInlineImages, type HostEntry, type HostProcess } from "../notice-center";
import { loaderArch, NOTICE_HOST_ILE_CSHARP, noticeHostIleScript, WEBVIEW2_SDK } from "../notice-host-ile";
import { ensureWebView2Sdk, sdkFilesFor } from "../webview2-sdk";
import { saleAdviceUrl } from "../sale-link";

const SDK_PUBLIC = join(process.cwd(), "public", "poste", "webview2", WEBVIEW2_SDK.version);

type FakeHost = HostProcess & { written: string[]; stdout: EventEmitter; stderr: EventEmitter; emitter: EventEmitter; killed: boolean };

function fakeHost(): FakeHost {
  const emitter = new EventEmitter();
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const stdin = new EventEmitter() as EventEmitter & { write(chunk: string): boolean };
  const written: string[] = [];
  stdin.write = (chunk: string) => { written.push(chunk); return true; };
  const host = { stdin, stdout, stderr, written, emitter, killed: false, on: (event: string, listener: (...args: unknown[]) => void) => { emitter.on(event, listener); return host; }, kill: () => { host.killed = true; emitter.emit("exit"); } };
  return host as unknown as FakeHost;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const ENTRY: HostEntry = {
  id: "vente1", reference: "ORD-1", label: "Détecté", subject: "DOLIPRANE", url: "https://pharmaboost.app/vente/vente1", signature: "s1",
  quiet: false, emailSaved: false, emailError: "", alerts: [], notes: [], questions: [], guidance: [],
  items: [{ id: "c1", drug: "DOLIPRANE", challenge: "", shortDate: "", outcome: "NONE", name: "SÉRUM", price: "5,90 €", reason: "", availability: "IN_STOCK", quantity: "3", image: "" }],
};

describe("le kit WebView2 servi par PharmaBoost", () => {
  it("les fichiers publiés ont exactement les empreintes attendues par l'agent", () => {
    for (const [name, sha] of Object.entries(WEBVIEW2_SDK.files)) {
      const bytes = readFileSync(join(SDK_PUBLIC, ...name.split("/")));
      expect(createHash("sha256").update(bytes).digest("hex"), name).toBe(sha);
    }
    expect(existsSync(join(SDK_PUBLIC, "LICENSE.txt"))).toBe(true);
  });

  it("ne demande que le chargeur de l'architecture du poste", () => {
    expect(sdkFilesFor("x64")).toEqual(["Microsoft.Web.WebView2.Core.dll", "Microsoft.Web.WebView2.WinForms.dll", "x64/WebView2Loader.dll"]);
    expect(loaderArch("ia32")).toBe("x86");
    expect(loaderArch("arm64")).toBe("arm64");
  });

  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "pb-wv2-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  const servePublic = (calls: string[], tamper = false) => (async (url: string | URL | Request) => {
    const path = String(url);
    calls.push(path);
    const name = path.split(`/${WEBVIEW2_SDK.version}/`)[1];
    const bytes = readFileSync(join(SDK_PUBLIC, ...name.split("/")));
    if (tamper) bytes[10] ^= 0xff;
    return new Response(new Uint8Array(bytes));
  }) as typeof fetch;

  it("télécharge une fois, vérifie l'empreinte, et réutilise ensuite les fichiers intacts", async () => {
    const calls: string[] = [];
    const paths = await ensureWebView2Sdk({ serverUrl: "https://pharmaboost.app/", configDir: dir, arch: "x64", fetchImpl: servePublic(calls) });
    expect(calls).toHaveLength(3);
    expect(calls[0]).toBe(`https://pharmaboost.app/poste/webview2/${WEBVIEW2_SDK.version}/Microsoft.Web.WebView2.Core.dll`);
    expect(existsSync(join(paths.loaderDir, "WebView2Loader.dll"))).toBe(true);
    await ensureWebView2Sdk({ serverUrl: "https://pharmaboost.app", configDir: dir, arch: "x64", fetchImpl: servePublic(calls) });
    expect(calls).toHaveLength(3);
    // Un fichier abîmé sur le disque est retéléchargé.
    writeFileSync(join(paths.sdkDir, "Microsoft.Web.WebView2.WinForms.dll"), "abîmé");
    await ensureWebView2Sdk({ serverUrl: "https://pharmaboost.app", configDir: dir, arch: "x64", fetchImpl: servePublic(calls) });
    expect(calls).toHaveLength(4);
  });

  it("refuse un fichier dont l'empreinte ne correspond pas", async () => {
    await expect(ensureWebView2Sdk({ serverUrl: "https://pharmaboost.app", configDir: dir, arch: "x64", fetchImpl: servePublic([], true) })).rejects.toThrow(/empreinte/);
    expect(existsSync(join(dir, "webview2", WEBVIEW2_SDK.version, "Microsoft.Web.WebView2.Core.dll"))).toBe(false);
  });
});

describe("le programme Windows de l'île", () => {
  it("est du C# 5 (Windows PowerShell 5.1) : ni interpolation, ni « ?. », ni initialiseur de propriété", () => {
    expect(NOTICE_HOST_ILE_CSHARP).not.toMatch(/\$"/);
    expect(NOTICE_HOST_ILE_CSHARP).not.toMatch(/\?\./);
    expect(NOTICE_HOST_ILE_CSHARP).not.toMatch(/\{\s*get;\s*(?:set;)?\s*\}\s*=/);
    expect(NOTICE_HOST_ILE_CSHARP).not.toMatch(/=>/);
    expect(NOTICE_HOST_ILE_CSHARP).not.toMatch(/nameof\(/);
  });

  it("ne vole jamais le clavier, n'ouvre que la page de l'île, et coupe les outils du navigateur", () => {
    expect(NOTICE_HOST_ILE_CSHARP).toContain("WS_EX_NOACTIVATE");
    expect(NOTICE_HOST_ILE_CSHARP).toContain("MA_NOACTIVATE");
    expect(NOTICE_HOST_ILE_CSHARP).toContain("ShowWithoutActivation");
    expect(NOTICE_HOST_ILE_CSHARP).toContain("e.Cancel = true");
    expect(NOTICE_HOST_ILE_CSHARP).toContain("e.Handled = true");
    for (const off of ["AreDevToolsEnabled = false", "AreDefaultContextMenusEnabled = false", "AreBrowserAcceleratorKeysEnabled = false"]) expect(NOTICE_HOST_ILE_CSHARP).toContain(off);
    // « PRET » n'est dit qu'une fois la page prête ; toute panne avant passe par la sortie d'erreur (repli de l'agent).
    expect(NOTICE_HOST_ILE_CSHARP).toMatch(/pageReady = true;\s*Out\.Word\("PRET"\)/);
  });

  it("un clic sur la carte d'un conseil : jamais de fenêtre dans l'île ; la page de la vente part au navigateur du PC (mot OUVRIR), après vérification", () => {
    expect(NOTICE_HOST_ILE_CSHARP).toContain("core.NewWindowRequested += OnNewWindowRequested;");
    const handler = NOTICE_HOST_ILE_CSHARP.slice(NOTICE_HOST_ILE_CSHARP.indexOf("private void OnNewWindowRequested("), NOTICE_HOST_ILE_CSHARP.indexOf("public static string SaleLinkFor("));
    // Aucune fenêtre, quoi qu'il arrive ; seul un clic de la personne (pas un script) ouvre quelque chose.
    expect(handler).toMatch(/\{\s*e\.Handled = true;\s*if \(!e\.IsUserInitiated\) return;/);
    expect(handler).toContain("SaleLinkFor(pageUri, e.Uri)");
    expect(handler).toContain("if (link == null) return;");
    // Un glisser de l'île n'est pas un clic ; un double-clic n'ouvre pas deux onglets.
    expect(handler).toMatch(/dragTimer\.Enabled && dragMoved\) \|\| \(now - dragEndedAt\)\.TotalMilliseconds < 400\) return;/);
    expect(handler).toMatch(/link == lastOpenUrl && \(now - lastOpenAt\)\.TotalMilliseconds < 1500\) return;/);
    expect(NOTICE_HOST_ILE_CSHARP).toMatch(/SavePosition\(\);\s*dragEndedAt = DateTime\.UtcNow;/);
    // Le navigateur peut passer devant (l'île, elle, ne prend jamais le premier plan) ; l'agent revérifie et ouvre.
    expect(handler).toContain("Native.AllowSetForegroundWindow(Native.ASFW_ANY)");
    expect(handler).toContain('Out.Word("OUVRIR " + link);');
    expect(handler).not.toMatch(/Process\.Start|cmd/);
    // Les navigations dans l'île restent bornées à sa page.
    expect(NOTICE_HOST_ILE_CSHARP).toMatch(/if \(!e\.Uri\.StartsWith\(allowedPrefix, StringComparison\.Ordinal\)\) e\.Cancel = true;/);
  });

  it("le menu de l'icône près de l'horloge propose « Ouvrir mon espace PharmaBoost » : un seul mot, ESPACE, pour l'agent", () => {
    expect(NOTICE_HOST_ILE_CSHARP).toMatch(/new ToolStripMenuItem\("Ouvrir mon espace PharmaBoost"\);\s*spaceItem\.Click \+= delegate \{ Out\.Word\("ESPACE"\); \};/);
    // Le menu garde ses autres gestes.
    expect(NOTICE_HOST_ILE_CSHARP).toContain("Remettre la bannière en haut au centre");
  });

  it("le script charge le kit et passe des chemins protégés (apostrophes doublées)", () => {
    const script = noticeHostIleScript({ sdkDir: "C:\\Users\\l'officine\\wv2", loaderDir: "C:\\wv2\\x64", userDataDir: "C:\\ile", url: "https://pharmaboost.app/poste/ile" });
    expect(script).toContain("$core = 'C:\\Users\\l''officine\\wv2\\Microsoft.Web.WebView2.Core.dll'");
    expect(script).toContain("Add-Type -Path $winforms");
    expect(script).toContain("[PharmaBoostIle.Program]::Run('https://pharmaboost.app/poste/ile', 'C:\\wv2\\x64', 'C:\\ile')");
    expect(islandPageUrl("https://pharmaboost.app/")).toBe("https://pharmaboost.app/poste/ile");
  });
});

describe("l'île dans le centre d'avis, et ses secours", () => {
  let dir: string;
  let hosts: FakeHost[];
  let scripts: string[];
  let logs: string[];
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "pb-ile-"));
    hosts = [];
    scripts = [];
    logs = [];
  });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  const center = (prepare: () => Promise<{ sdkDir: string; loaderDir: string }>) =>
    new NoticeCenter({ configDir: dir, serverUrl: "https://pharmaboost.app", postLabel: "Comptoir 2", log: (m) => logs.push(m), legacyShow: () => undefined, platform: "win32", prepareIsland: prepare, spawnHost: (path) => { scripts.push(path); const host = fakeHost(); hosts.push(host); return host; } });

  it("démarre l'île une fois le kit prêt, avec la commande d'ouverture de la bannière (robot du comptoir, nom du poste)", async () => {
    const notices = center(async () => ({ sdkDir: "C:\\kit", loaderDir: "C:\\kit\\x64" }));
    notices.setRobotLook(4);
    notices.warmUp();
    expect(hosts).toHaveLength(0);
    await flush();
    expect(notices.currentWindow()).toBe("ile");
    expect(scripts[0]).toMatch(/pharmaboost-ile-hote\.ps1$/);
    expect(readFileSync(scripts[0], "utf8")).toContain("PharmaBoostIle.Program");
    const init = JSON.parse(hosts[0].written[0]);
    expect(init).toMatchObject({ op: "init", look: 4, postLabel: "Comptoir 2", position: "haut-centre" });
  });

  it("une vente arrivée pendant la préparation du kit s'affiche dès que l'île est prête", async () => {
    const notices = center(async () => ({ sdkDir: "C:\\kit", loaderDir: "C:\\kit\\x64" }));
    notices.show(ENTRY);
    await flush();
    hosts[0].stdout.emit("data", "PRET\n");
    expect(hosts[0].written.some((line) => JSON.parse(line).op === "show")).toBe(true);
  });

  it("kit impossible à préparer → bannière GDI+ tout de suite", async () => {
    const notices = center(async () => { throw new Error("hors ligne"); });
    notices.warmUp();
    await flush();
    expect(notices.currentWindow()).toBe("banniere");
    expect(scripts[0]).toMatch(/pharmaboost-banniere-hote\.ps1$/);
    expect(logs.join("\n")).toMatch(/l'île ne peut pas se préparer \(hors ligne\) ; retour à la bannière/);
  });

  it("moteur absent ou page injoignable avant « PRET » → bannière GDI+, avec la vente en cours", async () => {
    const notices = center(async () => ({ sdkDir: "C:\\kit", loaderDir: "C:\\kit\\x64" }));
    notices.warmUp();
    await flush();
    notices.show(ENTRY);
    hosts[0].stderr.emit("data", "ERREUR ile : WebView2RuntimeNotFoundException\n");
    expect(notices.currentWindow()).toBe("banniere");
    expect(hosts[0].killed).toBe(true);
    expect(hosts[1].written.map((line) => JSON.parse(line).op)).toEqual(["init", "show"]);
    // La fenêtre qui a échoué n'est plus redemandée par la configuration.
    notices.configure({ window: "ile" });
    expect(notices.currentWindow()).toBe("banniere");
  });

  it("l'île qui ne sait plus se dessiner après « PRET » laisse aussi la place à la bannière", async () => {
    const notices = center(async () => ({ sdkDir: "C:\\kit", loaderDir: "C:\\kit\\x64" }));
    notices.warmUp();
    await flush();
    hosts[0].stdout.emit("data", "PRET\nERREUR dessin ile : moteur arrêté\n");
    expect(notices.currentWindow()).toBe("banniere");
  });

  it("les mots de l'île sont ceux de la bannière : l'agent les traite pareil", async () => {
    const actions: unknown[] = [];
    const notices = new NoticeCenter({ configDir: dir, serverUrl: "https://pharmaboost.app", log: () => undefined, legacyShow: () => undefined, platform: "win32", prepareIsland: async () => ({ sdkDir: "C:\\k", loaderDir: "C:\\k\\x64" }), onAction: (a) => actions.push(a), spawnHost: () => { const host = fakeHost(); hosts.push(host); return host; } });
    notices.warmUp();
    await flush();
    hosts[0].stdout.emit("data", `PRET\nVENDU vente1 c1\nEMAIL vente1 ${Buffer.from("patient@exemple.fr").toString("base64")}\nTERMINER vente1\n`);
    expect(actions).toEqual([{ kind: "sold", saleId: "vente1", adviceId: "c1" }, { kind: "email", saleId: "vente1", email: "patient@exemple.fr" }, { kind: "finish", saleId: "vente1" }]);
  });

  it("sans adresse de PharmaBoost, pas d'île : la bannière GDI+ comme avant", () => {
    const notices = new NoticeCenter({ configDir: dir, log: () => undefined, legacyShow: () => undefined, platform: "win32", spawnHost: (path) => { scripts.push(path); return fakeHost(); } });
    notices.warmUp();
    expect(notices.currentWindow()).toBe("banniere");
    expect(scripts[0]).toMatch(/pharmaboost-banniere-hote\.ps1$/);
  });
});

describe("les photos de l'île", () => {
  it("passent incluses (jpeg/png seulement), jamais un chemin du disque", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    const entry = { ...ENTRY, items: [{ ...ENTRY.items[0], image: "C:\\img\\a.png" }, { ...ENTRY.items[0], id: "c2", image: "C:\\img\\b.svg" }] };
    const out = withInlineImages(entry, (path) => (path.endsWith(".png") ? png : new TextEncoder().encode("<svg/>")));
    expect(out.items[0].image).toMatch(/^data:image\/png;base64,/);
    expect(out.items[1].image).toBe("");
  });
});

/**
 * La compilation réelle, comme sur le poste (C# 5, .NET Framework 4.8, avec les bibliothèques WebView2 du kit) :
 * PB_CSHARP_CHECK=1 npx vitest run agent/src/__tests__/notice-host-ile.test.ts
 */
describe.skipIf(process.env.PB_CSHARP_CHECK !== "1")("la compilation du programme de l'île (C# 5, .NET Framework 4.8, WebView2)", () => {
  it("compile sans erreur", () => {
    const dir = mkdtempSync(join(tmpdir(), "pb-cs-ile-"));
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "Ile.cs"), NOTICE_HOST_ILE_CSHARP);
      const ref = (name: string) => `<Reference Include="${name.replace(".dll", "")}"><HintPath>${join(SDK_PUBLIC, name)}</HintPath></Reference>`;
      writeFileSync(
        join(dir, "Check.csproj"),
        `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Library</OutputType><TargetFramework>net48</TargetFramework><LangVersion>5</LangVersion><ImplicitUsings>disable</ImplicitUsings><Nullable>disable</Nullable></PropertyGroup><ItemGroup><Reference Include="System.Windows.Forms" /><Reference Include="System.Drawing" /><Reference Include="System.Web.Extensions" />${ref("Microsoft.Web.WebView2.Core.dll")}${ref("Microsoft.Web.WebView2.WinForms.dll")}<PackageReference Include="Microsoft.NETFramework.ReferenceAssemblies" Version="1.0.3" PrivateAssets="all" /></ItemGroup></Project>`,
      );
      execFileSync("dotnet", ["--version"], { stdio: "ignore" });
      const result = spawnSync("dotnet", ["build", "-nologo", "-v", "q"], { cwd: dir, encoding: "utf8" });
      expect(`${result.stdout}${result.stderr}`).not.toMatch(/error CS\d+/);
      expect(result.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 240_000);
});

/**
 * La vérification de l'adresse par l'hôte Windows, EXÉCUTÉE (le C# de `SaleLinkFor`, tel quel, dans un petit programme
 * .NET) et comparée à celle de l'agent : les deux acceptent et refusent les mêmes adresses.
 * PB_CSHARP_CHECK=1 npx vitest run agent/src/__tests__/notice-host-ile.test.ts
 */
describe.skipIf(process.env.PB_CSHARP_CHECK !== "1")("l'adresse d'un conseil vue par l'hôte Windows (C# exécuté)", () => {
  it("accepte la page d'une vente du serveur de l'île, refuse tout le reste — comme l'agent", () => {
    const start = NOTICE_HOST_ILE_CSHARP.indexOf("public static string SaleLinkFor(");
    let depth = 0;
    let end = NOTICE_HOST_ILE_CSHARP.indexOf("{", start);
    for (; end < NOTICE_HOST_ILE_CSHARP.length; end += 1) {
      if (NOTICE_HOST_ILE_CSHARP[end] === "{") depth += 1;
      if (NOTICE_HOST_ILE_CSHARP[end] === "}" && --depth === 0) break;
    }
    const method = NOTICE_HOST_ILE_CSHARP.slice(start, end + 1);
    const server = "https://pharmaboost.app";
    const sale = "cmg1vente0001abcd";
    const advice = "cmg1conseil002xyz";
    const candidates = [
      `${server}/vente/${sale}?conseil=${advice}#conseil-${advice}`,
      `${server}/vente/${sale}?conseil=${advice}`,
      `${server}/vente/${sale}#conseil-${advice}`,
      `${server}/vente/${sale}`,
      `https://PharmaBoost.app/vente/${sale}`,
      `https://pharmaboost.app.evil.fr/vente/${sale}`,
      `https://evil.fr/vente/${sale}`,
      `https://pharmaboost.app:8443/vente/${sale}`,
      `http://pharmaboost.app/vente/${sale}`,
      `https://user:pass@pharmaboost.app/vente/${sale}`,
      `${server}/admin`,
      `${server}/vente/${sale}/fin`,
      `${server}/vente/../admin`,
      `${server}/vente/${sale}%2F..%2Fadmin`,
      `${server}/vente/${sale}?conseil=${advice}&next=https://evil.fr`,
      `${server}/vente/${sale}?conseil=${advice}#conseil-autre`,
      `${server}/vente/${sale}#ailleurs`,
      "javascript:alert(1)",
      "file:///C:/Windows/System32/cmd.exe",
      `${server}/vente/${sale} & calc.exe`,
      "/vente/relative",
      `${server}/vente/${"x".repeat(400)}`,
    ];
    const dir = mkdtempSync(join(tmpdir(), "pb-cs-lien-"));
    try {
      writeFileSync(
        join(dir, "Lien.cs"),
        `using System;\nusing System.Text.RegularExpressions;\npublic static class Lien\n{\n${method}\n  public static void Main(string[] args)\n  {\n    Uri page = new Uri(args[0]);\n    string line;\n    while ((line = Console.ReadLine()) != null) { string link = SaleLinkFor(page, line); Console.WriteLine(link == null ? "NULL" : link); }\n  }\n}\n`,
      );
      writeFileSync(join(dir, "Lien.csproj"), `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><LangVersion>5</LangVersion><ImplicitUsings>disable</ImplicitUsings><Nullable>disable</Nullable></PropertyGroup></Project>`);
      const result = spawnSync("dotnet", ["run", "-v", "q", "--", `${server}/poste/ile`], { cwd: dir, encoding: "utf8", input: `${candidates.join("\n")}\n` });
      expect(result.status, `${result.stdout}${result.stderr}`).toBe(0);
      const lines = result.stdout.trim().split(/\r?\n/).slice(-candidates.length);
      const fromCsharp = Object.fromEntries(candidates.map((candidate, index) => [candidate, lines[index] === "NULL" ? null : lines[index]]));
      const fromAgent = Object.fromEntries(candidates.map((candidate) => [candidate, saleAdviceUrl(server, candidate)]));
      expect(fromCsharp).toEqual(fromAgent);
      // Et ce n'est pas « tout refusé » : les quatre premières (et le nom en majuscules) passent, réécrites.
      expect(Object.values(fromCsharp).filter(Boolean)).toHaveLength(5);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 240_000);
});
