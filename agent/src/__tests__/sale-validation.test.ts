import { describe, expect, it, vi } from "vitest";
import { SaleValidationWatch } from "../sale-validation";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HOOK_SCRIPT } from "../douchette";

describe("la validation d'une vente dans LGPI : deux signaux, jamais un seul", () => {
  const setup = () => {
    const validated = vi.fn();
    return { watch: new SaleValidationWatch(validated), validated };
  };

  it("vente sur ordonnance : la ligne revient à chaque boîte, l'écran de facturation reste ouvert → aucune fin (le cas de POSTE3)", () => {
    const { watch, validated } = setup();
    watch.billingState(true, 0);
    for (let t = 7_000; t <= 35_000; t += 7_000) watch.line(t);
    expect(validated).not.toHaveBeenCalled();
  });

  it("FIN Valider : la ligne, puis l'écran de facturation qui se ferme → une fin", () => {
    const { watch, validated } = setup();
    watch.billingState(true, 0);
    watch.line(10_000);
    watch.billingState(false, 10_640);
    expect(validated).toHaveBeenCalledTimes(1);
  });

  it("la fermeture lue juste avant la ligne (journal relu chaque seconde) → une fin aussi", () => {
    const { watch, validated } = setup();
    watch.billingState(true, 0);
    watch.billingState(false, 10_000);
    watch.line(10_900);
    expect(validated).toHaveBeenCalledTimes(1);
  });

  it("l'écran qui se ferme sans ligne (vente mise en attente, annulée) → rien ; une ligne trop vieille → rien", () => {
    const { watch, validated } = setup();
    watch.billingState(true, 0);
    watch.billingState(false, 5_000);
    watch.line(30_000);
    watch.billingState(true, 40_000);
    watch.line(41_000);
    watch.billingState(false, 41_000 + 61_000);
    expect(validated).not.toHaveBeenCalled();
  });

  it("titre de fenêtre introuvable (autre logiciel, LGPI fermé) → jamais de fin automatique", () => {
    const { watch, validated } = setup();
    watch.billingState(null, 0);
    watch.line(1_000);
    watch.billingState(null, 2_000);
    expect(validated).not.toHaveBeenCalled();
  });

  it("deux ventes validées de suite : deux fins", () => {
    const { watch, validated } = setup();
    watch.billingState(true, 0);
    watch.line(10_000);
    watch.billingState(false, 10_500);
    watch.billingState(true, 30_000);
    watch.line(60_000);
    watch.billingState(false, 60_400);
    expect(validated).toHaveBeenCalledTimes(2);
  });
});


describe("le crochet de la douchette lit aussi l'écran de facturation de LGPI", () => {
  it("il n'écrit que oui / non / introuvable, jamais le titre de la fenêtre", () => {
    expect(HOOK_SCRIPT).toContain('Console.Out.WriteLine("LGPI " + state');
    expect(HOOK_SCRIPT).not.toMatch(/WriteLine\([^)]*title/);
  });
});

describe.skipIf(process.env.PB_CSHARP_CHECK !== "1")("la compilation du crochet de la douchette (C# 5, .NET Framework 4.8)", () => {
  it("compile sans erreur", () => {
    const dir = mkdtempSync(join(tmpdir(), "pb-cs-hook-"));
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "Hook.cs"), /\$code = @"\n([\s\S]*?)\n"@/.exec(HOOK_SCRIPT)![1]!);
      writeFileSync(join(dir, "Check.csproj"), `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Library</OutputType><TargetFramework>net48</TargetFramework><LangVersion>5</LangVersion><ImplicitUsings>disable</ImplicitUsings><Nullable>disable</Nullable></PropertyGroup><ItemGroup><Reference Include="System.Windows.Forms" /><PackageReference Include="Microsoft.NETFramework.ReferenceAssemblies" Version="1.0.3" PrivateAssets="all" /></ItemGroup></Project>`);
      execFileSync("dotnet", ["--version"], { stdio: "ignore" });
      const result = spawnSync("dotnet", ["build", "-nologo", "-v", "q"], { cwd: dir, encoding: "utf8" });
      expect(`${result.stdout}${result.stderr}`).not.toMatch(/error CS\d+/);
      expect(result.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 240_000);
});
