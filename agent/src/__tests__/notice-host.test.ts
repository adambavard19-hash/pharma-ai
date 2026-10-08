import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NOTICE_HOST_CSHARP, NOTICE_HOST_SCRIPT } from "../notice-host";

/**
 * La fenêtre d'avis est du code Windows : aucun essai ici ne la dessine. Ces tests fixent ce qu'on peut garantir sans
 * Windows — ce qu'elle ne fait jamais (prendre le clavier, masquer la caisse), ce qu'elle montre, et que son code
 * compile avec le langage de Windows PowerShell 5.1 (C# 5).
 */
describe("la fenêtre d'avis ne gêne jamais le logiciel de gestion", () => {
  it("ne s'active jamais : style « sans activation », clic « ne pas activer », aucun appel qui prend le focus", () => {
    expect(NOTICE_HOST_CSHARP).toContain("ShowWithoutActivation { get { return true; } }");
    expect(NOTICE_HOST_CSHARP).toContain("p.ExStyle |= 0x08000000 | 0x00000080");
    expect(NOTICE_HOST_CSHARP).toMatch(/m\.Msg == 0x0021\) \{ m\.Result = \(IntPtr\)3; return; \}/);
    expect(NOTICE_HOST_CSHARP).toContain("SWP_NOACTIVATE");
    for (const forbidden of [/\.Activate\(/, /\.Focus\(/, /SetForegroundWindow/, /BringToFront/, /SendKeys/, /\.Select\(\)/, /ShowDialog/, /MessageBox/, /keybd_event/, /SendInput/]) {
      expect(NOTICE_HOST_CSHARP, String(forbidden)).not.toMatch(forbidden);
    }
  });

  it("n'écrit ni ne lit rien d'autre que sa position retenue, n'ouvre que l'adresse du conseil", () => {
    expect(NOTICE_HOST_CSHARP).toContain("File.WriteAllText(positionFile");
    expect([...NOTICE_HOST_CSHARP.matchAll(/File\.(WriteAll|Delete|Move|Copy|Create|Append)/g)]).toHaveLength(1);
    expect(NOTICE_HOST_CSHARP).toContain("Process.Start(entry.Url)");
    expect([...NOTICE_HOST_CSHARP.matchAll(/Process\.Start\(/g)]).toHaveLength(1);
    expect(NOTICE_HOST_CSHARP).not.toMatch(/WebClient|HttpClient|Socket|TcpClient|Registry/);
  });

  it("se pose à droite à mi-hauteur par défaut — le bas de l'écran porte les boutons de facturation du LGO — et se déplace", () => {
    expect(NOTICE_HOST_CSHARP).toContain('public string Position = "milieu-droite"');
    expect(NOTICE_HOST_CSHARP).toContain("area.Top + (area.Height - Height) / 2");
    expect(NOTICE_HOST_CSHARP).toContain("OnDragMove");
    expect(NOTICE_HOST_CSHARP).toContain("Moved(Location)");
  });

  it("n'ouvre jamais deux fenêtres pour une vente, et ne rouvre que sur du nouveau", () => {
    expect(NOTICE_HOST_CSHARP).toContain("if (existing != null && fresh.Count == 0)");
    expect(NOTICE_HOST_CSHARP).toContain("if (existing == null && wasDismissed && fresh.Count == 0) return;");
    expect([...NOTICE_HOST_CSHARP.matchAll(/new ToastForm\(\)/g)]).toHaveLength(1);
  });
});

describe("ce que la fenêtre montre", () => {
  it("les deux gestes de la maquette, le doute du pharmacien, et la disponibilité", () => {
    for (const text of ["Voir le conseil", "Ignorer", "Suggestion à vérifier par le pharmacien", "En stock", "Stock faible", "Rupture", "Stock à vérifier", "Conseil disponible", "conseils disponibles", "PharmaBoost"]) {
      expect(NOTICE_HOST_CSHARP, text).toContain(text);
    }
    expect(NOTICE_HOST_CSHARP).toContain("Ce conseil reste disponible près de l'horloge.");
  });

  it("garde le conseil près de l'horloge avec un compteur, qui se retire quand plus rien n'attend", () => {
    expect(NOTICE_HOST_CSHARP).toContain("counter.Visible = false");
    expect(NOTICE_HOST_CSHARP).toContain("conseils en attente");
    expect(NOTICE_HOST_CSHARP).toContain("Tout ignorer");
    expect(NOTICE_HOST_CSHARP).toContain("count > 9 ? \"9+\"");
    expect(NOTICE_HOST_CSHARP).toContain("Native.DestroyIcon(previous)");
  });

  it("répond à l'agent par des mots simples", () => {
    for (const word of ["PRET", "VOIR ", "IGNORER ", "ATTENTE "]) expect(NOTICE_HOST_CSHARP).toContain(`Say("${word}`);
  });
});

describe("le script PowerShell qui la lance", () => {
  it("compile le C# tel quel, avec les trois assemblages utiles, puis lance la fenêtre", () => {
    expect(NOTICE_HOST_SCRIPT.startsWith('$ErrorActionPreference = "Stop"\n$code = @\'\n')).toBe(true);
    expect(NOTICE_HOST_SCRIPT).toContain("Add-Type -TypeDefinition $code -ReferencedAssemblies System.Windows.Forms,System.Drawing,System.Web.Extensions");
    expect(NOTICE_HOST_SCRIPT.trimEnd().endsWith("[PharmaBoostAvis.Program]::Run()")).toBe(true);
    expect(NOTICE_HOST_SCRIPT).toContain(NOTICE_HOST_CSHARP);
  });

  it("le texte du C# ne peut pas casser son enveloppe : aucun $ ni accent grave, aucune ligne qui ferme la chaîne PowerShell", () => {
    expect(NOTICE_HOST_CSHARP).not.toContain("`");
    expect(NOTICE_HOST_CSHARP).not.toContain("$");
    expect(NOTICE_HOST_CSHARP.split("\n").some((line) => line.startsWith("'@"))).toBe(false);
  });

  it("n'emploie aucune des nouveautés de C# 6 ou plus, que Windows PowerShell 5.1 ne compile pas", () => {
    const code = NOTICE_HOST_CSHARP.replace(/"(?:[^"\\]|\\.)*"/g, '""');
    expect(code, "interpolation").not.toMatch(/\$"/);
    expect(code, "?.").not.toMatch(/\w\?\./);
    expect(code, "?[").not.toMatch(/\w\?\[/);
    expect(code, "=> (membre à corps d'expression, lambda avec =>)").not.toMatch(/\)\s*=>\s*[^{]/);
    expect(code, "nameof").not.toMatch(/nameof\(/);
    expect(code, "out var").not.toMatch(/out var /);
    expect(code, "is not / switch expressions").not.toMatch(/\bis not\b|\bswitch\s*\{/);
  });
});

/**
 * Le contrôle qui compte : le C# compile avec le compilateur de Windows PowerShell 5.1 (langage C# 5) contre
 * .NET Framework 4.8. Il demande `dotnet` et les assemblages de référence (téléchargés une fois) : il ne tourne que
 * sur demande — PB_CSHARP_CHECK=1 npx vitest run agent/src/__tests__/notice-host.test.ts — et dans l'atelier de livraison.
 */
const dotnetAsked = process.env.PB_CSHARP_CHECK === "1";
describe.skipIf(!dotnetAsked)("la compilation du code Windows (C# 5, .NET Framework 4.8)", () => {
  it("compile sans erreur", () => {
    const dir = mkdtempSync(join(tmpdir(), "pb-cs-"));
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "NoticeHost.cs"), NOTICE_HOST_CSHARP);
      writeFileSync(
        join(dir, "Check.csproj"),
        `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Library</OutputType><TargetFramework>net48</TargetFramework><LangVersion>5</LangVersion><ImplicitUsings>disable</ImplicitUsings><Nullable>disable</Nullable></PropertyGroup><ItemGroup><Reference Include="System.Windows.Forms" /><Reference Include="System.Drawing" /><Reference Include="System.Web.Extensions" /><PackageReference Include="Microsoft.NETFramework.ReferenceAssemblies" Version="1.0.3" PrivateAssets="all" /></ItemGroup></Project>`,
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
