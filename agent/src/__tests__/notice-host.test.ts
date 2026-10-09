import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NOTICE_HOST_CSHARP, NOTICE_HOST_SCRIPT } from "../notice-host";

/**
 * La fenêtre de la vente est du code Windows : aucun essai ici ne la dessine. Ces tests fixent ce qu'on peut garantir sans
 * Windows — ce qu'elle ne fait jamais (prendre le clavier, masquer la caisse), ce qu'elle montre, et que son code
 * compile avec le langage de Windows PowerShell 5.1 (C# 5).
 */
/** Le corps d'une méthode C# du fichier, repéré par sa signature (jusqu'à la méthode suivante au même retrait). */
function methodBody(name: string): string {
  const start = NOTICE_HOST_CSHARP.search(new RegExp(`\\n    (?:private|public|protected)[^\\n]* ${name}\\(`));
  expect(start, name).toBeGreaterThan(-1);
  const rest = NOTICE_HOST_CSHARP.slice(start + 1);
  const end = rest.search(/\n    (?:private|public|protected)[^\n]*\(/);
  return end === -1 ? rest : rest.slice(0, end + 1);
}

describe("la fenêtre de la vente ne gêne jamais le logiciel de gestion", () => {
  it("ne s'active jamais : style « sans activation », clic « ne pas activer », aucun appel qui prend le focus hors de la saisie de l'e-mail", () => {
    expect(NOTICE_HOST_CSHARP).toContain("ShowWithoutActivation { get { return true; } }");
    expect(NOTICE_HOST_CSHARP).toContain("p.ExStyle |= 0x08000000 | 0x00000080");
    expect(NOTICE_HOST_CSHARP).toMatch(/m\.Msg == 0x0021 && !editing\) \{ m\.Result = \(IntPtr\)3; return; \}/);
    expect(NOTICE_HOST_CSHARP).toContain("SWP_NOACTIVATE");
    for (const forbidden of [/\.Activate\(/, /\.Focus\(/, /BringToFront/, /SendKeys/, /\.Select\(\)/, /ShowDialog/, /MessageBox/, /keybd_event/, /SendInput/]) {
      expect(NOTICE_HOST_CSHARP, String(forbidden)).not.toMatch(forbidden);
    }
  });

  it("n'a qu'UNE exception : le clic dans le champ e-mail donne le clavier, et la fin de la saisie le rend", () => {
    // SetForegroundWindow et le retrait du style « sans activation » n'existent que dans BeginTyping / EndTyping.
    const begin = methodBody("BeginTyping");
    const end = methodBody("EndTyping");
    expect(begin).toContain("Native.SetForegroundWindow(Handle)");
    expect(begin).toContain("& ~Native.WS_EX_NOACTIVATE");
    expect(end).toContain("| Native.WS_EX_NOACTIVATE");
    expect(end).toContain("Native.SetForegroundWindow(previousForeground)");
    const outside = NOTICE_HOST_CSHARP.replace(begin, "").replace(end, "");
    expect(outside.match(/SetForegroundWindow\(/g) ?? []).toHaveLength(1); // la déclaration native
    expect(outside).not.toMatch(/WS_EX_NOACTIVATE\)?;?\s*$/m);
    expect(NOTICE_HOST_CSHARP).toContain("emailBox.MouseDown += delegate { BeginTyping(); };");
    expect([...NOTICE_HOST_CSHARP.matchAll(/BeginTyping\(\);/g)]).toHaveLength(1);
  });

  it("rend le clavier dans tous les cas : Enregistrer, Plus tard, Échap, un clic ailleurs, quarante secondes sans rien taper", () => {
    expect(NOTICE_HOST_CSHARP).toContain("protected override void OnDeactivate");
    expect(NOTICE_HOST_CSHARP).toContain("typingTimer.Interval = 40000");
    expect(NOTICE_HOST_CSHARP).toContain("k.KeyCode == Keys.Escape");
    expect(methodBody("SaveEmail")).toContain("EndTyping(true)");
    expect(methodBody("LaterEmail")).toContain("EndTyping(true)");
  });

  it("un code-barres tombé dans le champ de l'e-mail est effacé, jamais enregistré", () => {
    expect(NOTICE_HOST_CSHARP).toContain("typed.Length >= 8 && IsAllDigits(typed)");
  });

  it("n'enregistre l'adresse qu'avec l'accord du patient (case cochée) et une adresse bien formée", () => {
    const save = methodBody("SaveEmail");
    expect(save).toContain("if (!emailConsent)");
    expect(save).toContain("!LooksLikeEmail(text)");
    expect(save.indexOf("emailConsent")).toBeLessThan(save.indexOf('Say("EMAIL "'));
    expect(NOTICE_HOST_CSHARP).toContain("Le patient accepte de recevoir son bilan par e-mail");
  });

  it("n'écrit ni ne lit rien d'autre que sa position retenue, n'ouvre que l'adresse de la vente", () => {
    expect(NOTICE_HOST_CSHARP).toContain("File.WriteAllText(positionFile");
    expect([...NOTICE_HOST_CSHARP.matchAll(/File\.(WriteAll|Delete|Move|Copy|Create|Append)/g)]).toHaveLength(1);
    expect(NOTICE_HOST_CSHARP).toContain("Process.Start(shown.Url)");
    expect([...NOTICE_HOST_CSHARP.matchAll(/Process\.Start\(/g)]).toHaveLength(1);
    expect(NOTICE_HOST_CSHARP).not.toMatch(/WebClient|HttpClient|Socket|TcpClient|Registry/);
  });

  it("se pose à droite à mi-hauteur par défaut — le bas de l'écran porte les boutons de facturation du LGO — se déplace, et ne déborde pas", () => {
    expect(NOTICE_HOST_CSHARP).toContain('public string Position = "milieu-droite"');
    expect(NOTICE_HOST_CSHARP).toContain("area.Top + (area.Height - Height) / 2");
    expect(NOTICE_HOST_CSHARP).toContain("OnDragMove");
    expect(NOTICE_HOST_CSHARP).toContain("Moved(Location)");
    expect(NOTICE_HOST_CSHARP).toContain("private void Clamp()");
    expect(NOTICE_HOST_CSHARP).toContain("WorkingArea.Height * 0.9");
  });

  it("n'ouvre jamais deux fenêtres pour une vente, la met à jour sur place, et ne rouvre une fenêtre réduite que sur du nouveau", () => {
    expect([...NOTICE_HOST_CSHARP.matchAll(/new SaleForm\(\)/g)]).toHaveLength(1);
    expect(NOTICE_HOST_CSHARP).toContain("else if (fresh.Count > 0 && form.Reduced) form.Reduced = false;");
    expect(NOTICE_HOST_CSHARP).toContain("if (editing) { deferred = e; return; }");
  });
});

describe("la fenêtre reste ouverte pendant toute la vente", () => {
  it("n'a plus aucun délai de fermeture : seuls le mot de huit secondes (rien à conseiller) et le message de fin (sept secondes) s'effacent seuls", () => {
    expect(NOTICE_HOST_CSHARP).not.toContain("hideTimer");
    expect(NOTICE_HOST_CSHARP).not.toContain("Tuck");
    expect(NOTICE_HOST_CSHARP).not.toContain('Say("ATTENTE');
    expect(NOTICE_HOST_CSHARP).toContain("quietTimer.Interval = 8000");
    expect(NOTICE_HOST_CSHARP).toContain("doneTimer.Interval = 7000");
    expect(NOTICE_HOST_CSHARP).toContain("TimeSpan.FromHours(3)");
  });

  it("peut être réduite à une barre, et rouverte d'un clic ou depuis l'icône près de l'horloge", () => {
    expect(NOTICE_HOST_CSHARP).toContain("public void SetReduced(bool value)");
    expect(NOTICE_HOST_CSHARP).toContain("private void BuildReduced()");
    expect(NOTICE_HOST_CSHARP).toContain("Réduire la fenêtre");
    expect(NOTICE_HOST_CSHARP).toContain("Afficher la fenêtre");
  });

  it("l'icône près de l'horloge n'existe que pendant une vente ouverte", () => {
    expect(NOTICE_HOST_CSHARP).toContain("if (current == null || !sessionOpen)");
    expect(NOTICE_HOST_CSHARP).toContain("counter.Visible = false");
    expect(NOTICE_HOST_CSHARP).toContain("Native.DestroyIcon(previous)");
    expect(NOTICE_HOST_CSHARP).toContain('count > 9 ? "9+"');
  });
});

describe("ce que la fenêtre montre", () => {
  it("les libellés de la maquette : conseils, pastilles, réponses, e-mail, fin de vente", () => {
    for (const text of ["Vendu", "Non vendu", "Voir le détail", "Modifier", "Challenge", "Date courte ", "En stock", "Stock faible", "Rupture", "Stock à vérifier", "Pour : ", "PharmaBoost", "Vente en cours", "E-mail du patient", "Enregistrer l'e-mail", "Plus tard", "Vente terminée", "E-mail enregistré"]) {
      expect(NOTICE_HOST_CSHARP, text).toContain(text);
    }
    // Plus de bouton « Voir le conseil » : les conseils s'affichent d'eux-mêmes.
    expect(NOTICE_HOST_CSHARP).not.toContain("Voir le conseil");
  });

  it("la pastille « Challenge » est orange et la « Date courte » rouge", () => {
    expect(NOTICE_HOST_CSHARP).toContain("ChallengeBack = Color.FromArgb(255, 237, 213)");
    expect(NOTICE_HOST_CSHARP).toContain("DateBack = Color.FromArgb(254, 226, 226)");
    expect(NOTICE_HOST_CSHARP).toContain('item.Challenge.Length > 0) AddPill(card, colX, "Challenge"');
    expect(NOTICE_HOST_CSHARP).toContain('item.ShortDate.Length > 0) AddPill(card, colX, "Date courte " + item.ShortDate');
  });

  it("le message de fin : « Vente terminée — résultats enregistrés » vient de l'agent, la fenêtre l'affiche tel quel", () => {
    expect(NOTICE_HOST_CSHARP).toContain("private void BuildDone()");
    expect(NOTICE_HOST_CSHARP).toContain("done.Title");
    expect(NOTICE_HOST_CSHARP).toContain("done.Badge");
  });

  it("répond à l'agent par des mots simples", () => {
    for (const word of ["PRET", "VENDU ", "NONVENDU ", "ANNULER ", "EMAIL ", "EMAIL_RETIRER ", "TERMINER ", "FERMEE ", "VOIR "]) expect(NOTICE_HOST_CSHARP, word).toContain(`"${word}`);
  });

  it("« Vendu » et « Non vendu » ne se déduisent de rien : seul un clic les envoie", () => {
    const choose = methodBody("Choose");
    expect(choose).toContain('"VENDU "');
    expect(choose).toContain('"NONVENDU "');
    expect(choose).toContain('"ANNULER "');
    expect([...NOTICE_HOST_CSHARP.matchAll(/Choose\(item, "/g)]).toHaveLength(3);
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
