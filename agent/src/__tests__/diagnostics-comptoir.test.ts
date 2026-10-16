import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { OBSERVER_SCRIPT, afterActions, collapseScanner, journalObserved, parseHookLine, renderSaleReport, type Observed } from "../diagnostic-fin-de-vente";
import { databaseKinds, inspectFile, maskHeader, maskPath, renderExpiryReport } from "../diagnostic-dates-courtes";

describe("diagnostic « fin de vente »", () => {
  it("ne garde ni nom ni valeur : titres de fenêtre et lignes de journal masqués, vocabulaire de vente en clair", () => {
    const win = parseHookLine("WIN\t1000\tjavaw\tLGPI - Facturation - DUPONT Jean 0612345678");
    expect(win).toEqual({ at: 1000, kind: "fenetre", process: "javaw", title: "LGPI - Facturation - AAAAAA Aaaa 9999999999" });
    const line = journalObserved("2026-10-16 10:12:03,120 INFO [AWT-EventQueue-0] fr.lgpi.vente.ControleurVente - Validation vente 1460746 client MARTIN");
    expect(line?.kind).toBe("journal");
    expect(line && "text" in line ? line.text : "").toContain("Validation vente 9999999 client AAAAAA");
    expect(JSON.stringify(line)).not.toMatch(/MARTIN|1460746/);
  });

  it("une rafale de caractères rapides est la douchette ; une frappe lente reste « caractère », sans valeur", () => {
    const fast = Array.from({ length: 13 }, (_, i): Observed => ({ at: 1000 + i * 10, kind: "touche", key: "caractère" }));
    const slow: Observed[] = [{ at: 5000, kind: "touche", key: "caractère" }, { at: 5400, kind: "touche", key: "caractère" }];
    const out = collapseScanner([...fast, ...slow]);
    expect(out.map((e) => (e.kind === "touche" ? e.key : e.kind))).toEqual(["douchette", "caractère", "caractère"]);
  });

  it("relie ce que le journal écrit dans les 3 secondes après Entrée, une touche F ou un clic", () => {
    const at = Date.parse("2026-10-16T10:12:02.500");
    const journal = journalObserved("2026-10-16 10:12:03,000 INFO [main] fr.lgpi.Vente - Fin de la vente")!;
    const far = journalObserved("2026-10-16 10:12:30,000 INFO [main] fr.lgpi.Vente - Autre chose")!;
    const result = afterActions([{ at, kind: "touche", key: "F12" }, journal, far, { at: at + 60_000, kind: "clic", button: "gauche" }]);
    expect(result.find((r) => r.action === "touche F12")?.shapes[0]?.text).toContain("Fin de la vente");
    expect(result.find((r) => r.action === "touche F12")?.shapes).toHaveLength(1);
    const report = renderSaleReport({ computer: "POSTE1", started: new Date(at), ended: new Date(at + 1000), journal: "C:\\var\\log\\lgpi\\lgpi.log", events: [{ at, kind: "touche", key: "F12" }, journal], hookOk: true, errors: [] }).join("\n");
    expect(report).toContain("touche F12 — 1 fois");
  });

  it("le crochet n'écrit jamais la valeur d'une touche de caractère", () => {
    expect(OBSERVER_SCRIPT).toContain('return "caractère";');
    expect(OBSERVER_SCRIPT).not.toMatch(/ToUnicode|MapVirtualKey/);
  });
});

describe("diagnostic « dates courtes »", () => {
  it("masque les chemins et les en-têtes, garde le vocabulaire des colonnes", () => {
    expect(maskPath("C:\\Users\\Durand\\Desktop\\export_peremption-2026.csv")).toBe("C:\\Users\\Aaaaaa\\Desktop\\export_peremption-9999.csv");
    expect(maskHeader("CIP13;Libellé;N° lot;Date péremption;Quantité;DUPONT")).toBe("CIP99;Libellé;N° lot;Date péremption;Quantité;AAAAAA");
  });

  it("ne cite que le TYPE de base, jamais l'adresse ni l'identifiant", () => {
    const kinds = databaseKinds("url=jdbc:postgresql://10.0.0.5:5432/lgpi user=admin password=secret");
    expect(kinds).toContain("jdbc:postgresql");
    expect(JSON.stringify(kinds)).not.toMatch(/10\.0|admin|secret/);
  });

  it("retient un fichier dont l'en-tête parle de péremption, ignore les autres, et n'écrit aucune ligne du fichier", () => {
    const dir = mkdtempSync(join(tmpdir(), "pb-dc-"));
    try {
      writeFileSync(join(dir, "stock.csv"), "CIP13;Libellé;Date péremption;Quantité\n3400935294227;DOLIPRANE;2027-03-31;12\n");
      writeFileSync(join(dir, "clients.csv"), "Nom;Prénom\nDUPONT;Jean\n");
      expect(inspectFile(join(dir, "stock.csv"))?.header).toBe("CIP99;Libellé;Date péremption;Quantité");
      expect(inspectFile(join(dir, "clients.csv"))).toBeNull();
      const report = renderExpiryReport({ computer: "P", now: new Date(), roots: [dir], files: [inspectFile(join(dir, "stock.csv"))!], install: [], odbc: [], programs: [], journal: [], errors: [] }).join("\n");
      expect(report).not.toMatch(/DOLIPRANE|3400935294227/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe.skipIf(process.env.PB_CSHARP_CHECK !== "1")("la compilation de l'observateur (C# 5, .NET Framework 4.8)", () => {
  it("compile sans erreur", () => {
    const dir = mkdtempSync(join(tmpdir(), "pb-cs-obs-"));
    try {
      mkdirSync(dir, { recursive: true });
      const source = /\$code = @"\n([\s\S]*?)\n"@/.exec(OBSERVER_SCRIPT)![1]!;
      writeFileSync(join(dir, "Obs.cs"), source);
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
