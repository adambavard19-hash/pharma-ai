import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BANNER, csColor } from "../banner-design";
import { NOTICE_HOST_CSHARP, NOTICE_HOST_SCRIPT } from "../notice-host";

/**
 * La bannière est du code Windows : aucun essai ici ne la dessine (l'aperçu pour Mac, banner-preview.ts, reproduit son dessin). Ces tests
 * fixent ce qu'on peut garantir sans Windows — ce qu'elle ne fait jamais (prendre le clavier, masquer la caisse), ce qu'elle montre,
 * qu'elle suit le design partagé, et que son code compile avec le langage de Windows PowerShell 5.1 (C# 5).
 */

/** Le corps d'une méthode C# du fichier, repéré par sa signature (jusqu'à la méthode suivante au même retrait). */
function methodBody(name: string): string {
  const start = NOTICE_HOST_CSHARP.search(new RegExp(`\\n    (?:private|public|protected)[^\\n]* ${name}\\(`));
  expect(start, name).toBeGreaterThan(-1);
  const rest = NOTICE_HOST_CSHARP.slice(start + 1);
  const end = rest.search(/\n    (?:private|public|protected)[^\n]*\(/);
  return end === -1 ? rest : rest.slice(0, end + 1);
}

/** Le texte d'une classe C# (de sa déclaration à la suivante au même retrait). */
function classBody(name: string): string {
  const start = NOTICE_HOST_CSHARP.search(new RegExp(`\\n  (?:public|internal) (?:static )?(?:class|struct) ${name}\\b`));
  expect(start, name).toBeGreaterThan(-1);
  const rest = NOTICE_HOST_CSHARP.slice(start + 1);
  const end = rest.search(/\n  (?:\[|\/\/\/|public|internal)/);
  return end === -1 ? rest : rest.slice(0, end + 1);
}

const banner = classBody("BannerForm");
const email = classBody("EmailForm");

describe("la bannière ne gêne jamais le logiciel de gestion", () => {
  it("ne s'active jamais : style « sans activation », clic « ne pas activer », aucun appel qui prend le focus", () => {
    expect(banner).toContain("ShowWithoutActivation { get { return true; } }");
    expect(banner).toContain("p.ExStyle |= 0x08000000 | 0x00000080 | 0x00080000");
    expect(banner).toMatch(/m\.Msg == 0x0021\) \{ m\.Result = \(IntPtr\)3; return; \}/);
    expect(NOTICE_HOST_CSHARP).toContain("SWP_NOACTIVATE");
    for (const forbidden of [/\.Activate\(/, /\.Focus\(/, /BringToFront/, /SendKeys/, /\.Select\(\)/, /ShowDialog/, /MessageBox/, /keybd_event/, /SendInput/]) {
      expect(NOTICE_HOST_CSHARP, String(forbidden)).not.toMatch(forbidden);
    }
    // Chaque remise « au premier plan » se fait sans activation.
    for (const call of NOTICE_HOST_CSHARP.match(/Native\.SetWindowPos\([^;]*;/g) ?? []) expect(call).toContain("SWP_NOACTIVATE");
  });

  it("la bannière elle-même ne prend JAMAIS le clavier : seul le champ e-mail le fait, sur un clic dans son champ", () => {
    expect(banner).not.toContain("SetForegroundWindow");
    expect(banner).not.toContain("GetForegroundWindow");
    expect(banner).not.toContain("TextBox");
    expect(banner).not.toContain("WS_EX_NOACTIVATE)");
    // Dans le champ e-mail : l'activation n'existe que dans BeginTyping / EndTyping.
    const begin = methodBody("BeginTyping");
    const end = methodBody("EndTyping");
    expect(begin).toContain("Native.SetForegroundWindow(Handle)");
    expect(begin).toContain("& ~Native.WS_EX_NOACTIVATE");
    expect(end).toContain("| Native.WS_EX_NOACTIVATE");
    expect(end).toContain("Native.SetForegroundWindow(previousForeground)");
    const outside = NOTICE_HOST_CSHARP.replace(begin, "").replace(end, "");
    expect(outside.match(/SetForegroundWindow\(/g) ?? []).toHaveLength(1); // la déclaration native
    expect(email).toContain("emailBox.MouseDown += delegate { BeginTyping(); };");
    expect([...NOTICE_HOST_CSHARP.matchAll(/BeginTyping\(\);/g)]).toHaveLength(1);
    expect(email).toMatch(/m\.Msg == 0x0021 && !editing\) \{ m\.Result = \(IntPtr\)3; return; \}/);
  });

  it("rend le clavier dans tous les cas : Enregistrer, Plus tard, Échap, un clic ailleurs, fermeture, quarante secondes sans rien taper", () => {
    expect(email).toContain("protected override void OnDeactivate");
    expect(email).toContain("typingTimer.Interval = 40000");
    expect(email).toContain("k.KeyCode == Keys.Escape");
    expect(methodBody("SaveEmail")).toContain("EndTyping(true)");
    expect(methodBody("LaterEmail")).toContain("EndTyping(true)");
    expect(methodBody("OnFormClosing")).toContain("EndTyping(true)");
  });

  it("un code-barres tombé dans le champ de l'e-mail est effacé, jamais enregistré", () => {
    expect(email).toContain("typed.Length >= 8 && IsAllDigits(typed)");
  });

  it("n'enregistre l'adresse qu'avec l'accord du patient (case cochée) et une adresse bien formée", () => {
    const save = methodBody("SaveEmail");
    expect(save).toContain("if (!emailConsent)");
    expect(save).toContain("!LooksLikeEmail(text)");
    expect(save.indexOf("emailConsent")).toBeLessThan(save.indexOf('Word("EMAIL "'));
    expect(NOTICE_HOST_CSHARP).toContain("Le patient accepte de recevoir son bilan par e-mail");
  });

  it("n'écrit ni ne lit rien d'autre que sa position retenue, n'ouvre que l'adresse de la vente", () => {
    expect(NOTICE_HOST_CSHARP).toContain("File.WriteAllText(positionFile");
    expect([...NOTICE_HOST_CSHARP.matchAll(/File\.(WriteAll|Delete|Move|Copy|Create|Append)/g)]).toHaveLength(1);
    expect(NOTICE_HOST_CSHARP).toContain("Process.Start(url)");
    expect([...NOTICE_HOST_CSHARP.matchAll(/Process\.Start\(/g)]).toHaveLength(1);
    expect(NOTICE_HOST_CSHARP).not.toMatch(/WebClient|HttpClient|Socket|TcpClient|Registry/);
  });

  it("se pose en haut à droite, SOUS la barre de titre du logiciel de gestion (ses boutons Réduire/Fermer restent libres), se déplace, et ne déborde pas", () => {
    expect(banner).toContain('private string position = "haut-droite"');
    expect(banner).toContain("area.Top + SystemInformation.CaptionHeight + S(10)");
    expect(banner).toContain("protected override void OnMouseMove");
    expect(banner).toContain("private void ClampAnchor()");
    expect(banner).toContain("area.Height * 0.9f");
    expect(banner).toContain("if (top + cardHeight > limit)");
    // Un fichier à elle : l'ancienne position (mi-hauteur) ne la déplace pas.
    expect(banner).not.toContain("pharmaboost-avis-position");
  });

  it("ne reste jamais « toujours au premier plan » en doublon : une seule fenêtre de bannière, une seule de champ e-mail", () => {
    expect([...NOTICE_HOST_CSHARP.matchAll(/new BannerForm\(\)/g)]).toHaveLength(1);
    expect([...NOTICE_HOST_CSHARP.matchAll(/new EmailForm\(/g)]).toHaveLength(1);
    expect(NOTICE_HOST_CSHARP).toContain("if (email != null && !email.IsDisposed)");
  });
});

describe("une bannière moderne, pas une fenêtre Windows", () => {
  it("est une fenêtre « à calque » dont chaque pixel porte sa transparence, dessinée en GDI+ à l'échelle de l'affichage", () => {
    expect(banner).toContain("0x00080000"); // WS_EX_LAYERED
    expect(banner).toContain("Native.UpdateLayeredWindow(Handle, screenDc, ref target, ref size, memoryDc, ref source, 0, ref blend, 2)");
    expect(banner).toContain("PixelFormat.Format32bppPArgb");
    expect(banner).toContain("blend.AlphaFormat = 1");
    expect(banner).toContain("g.ScaleTransform(scale, scale)");
    expect(banner).toContain("SmoothingMode.AntiAlias");
    expect(banner).toContain("TextRenderingHint.AntiAliasGridFit");
    expect(banner).toContain("Native.DeleteObject(bitmap)");
    expect(NOTICE_HOST_CSHARP).toContain("Native.SetProcessDPIAware()");
    expect(NOTICE_HOST_CSHARP).toContain("g.DpiX / 96f");
    // Aucun contrôle Windows classique dans la bannière : ni bouton, ni étiquette, ni barre.
    expect(banner).not.toMatch(/new (Button|Label|Panel|ToolStrip|StatusStrip|MenuStrip|ToolTip)\(/);
    expect(banner).toContain("FormBorderStyle = FormBorderStyle.None");
  });

  it("dessine coins arrondis, ombre douce, reflet de verre, liseré lumineux, mascotte animée", () => {
    expect(banner).toContain("Gfx.Round(x, y, w, h, Dim.Radius)");
    expect(banner).toContain("private void DrawShadow");
    expect(banner).toContain("PathGradientBrush");
    expect(banner).toContain("Color.FromArgb(30, 255, 255, 255)");
    expect(NOTICE_HOST_CSHARP).toContain("internal static class Mascot");
    expect(NOTICE_HOST_CSHARP).toContain("Math.Sin(t * 2.2)"); // elle respire
    expect(NOTICE_HOST_CSHARP).toContain("(t % 4.6) > 4.46"); // elle cligne des yeux
    for (const mood of ["idle", "alert", "think", "idea", "happy"]) expect(NOTICE_HOST_CSHARP).toContain(`"${mood}"`);
  });

  it("s'anime avec douceur : taille qui glisse, contenu qui se fond, 15 images/s au repos et 40 en mouvement", () => {
    expect(banner).toContain("Math.Pow(1.0 - Tim.Ease, dt * 60.0)");
    expect(banner).toContain("fade = Math.Min(1f, fade + (float)(dt / 0.2))");
    expect(BANNER.timing.idleFps).toBe(15);
    expect(BANNER.timing.motionFps).toBe(40);
    expect(banner).toContain("1000 / Tim.MotionFps : 1000 / Tim.IdleFps");
  });

  it("choisit une police moderne présente sur Windows 10 et 11, avec repli", () => {
    expect(NOTICE_HOST_CSHARP).toContain('{ "Segoe UI", "Tahoma", "Arial" }');
  });

  it("se remet devant les autres fenêtres « toujours au premier plan », sans jamais prendre le focus", () => {
    expect(banner).toContain("now - lastTop > 2.0");
    expect(banner).toContain("Native.HWND_TOPMOST");
  });
});

describe("le design partagé : la bannière et l'aperçu disent la même chose", () => {
  it("chaque couleur du design est une constante du code Windows, à l'identique", () => {
    for (const [key, value] of Object.entries(BANNER.colors)) {
      if (key === "cardAlpha") continue;
      expect(NOTICE_HOST_CSHARP, key).toContain(`public static readonly Color ${key.charAt(0).toUpperCase()}${key.slice(1)} = ${csColor(value as string)};`);
    }
    expect(NOTICE_HOST_CSHARP).toContain(`public const double CardAlpha = ${BANNER.colors.cardAlpha};`);
  });

  it("chaque cote, durée et phrase du design est une constante du code Windows", () => {
    for (const [key, value] of Object.entries(BANNER.sizes)) expect(NOTICE_HOST_CSHARP, key).toContain(`public const int ${key.charAt(0).toUpperCase()}${key.slice(1)} = ${value};`);
    for (const [key, value] of Object.entries(BANNER.timing)) expect(NOTICE_HOST_CSHARP, key).toContain(`${key.charAt(0).toUpperCase()}${key.slice(1)} = ${value};`);
    for (const [key, value] of Object.entries(BANNER.text)) expect(NOTICE_HOST_CSHARP, key).toContain(`public const string ${key.charAt(0).toUpperCase()}${key.slice(1)} = ${JSON.stringify(value)};`);
  });

  it("les phrases et pastilles de la maquette : En attente de scan…, Scan détecté !, conseils disponibles, Challenge, Date courte, En stock, Vendu, Non vendu, Vente terminée !", () => {
    const text = BANNER.text;
    expect(text.idle).toBe("En attente de scan…");
    expect(text.scanTitle).toBe("Scan détecté !");
    expect(text.scanSub).toBe("Analyse en cours…");
    expect(text.readyMany).toBe("{n} conseils disponibles");
    expect(text.readyButton).toBe("Voir les conseils");
    expect(text.duringSale).toBe("Pendant la vente");
    expect([text.challenge, text.shortDate, text.inStock]).toEqual(["Challenge", "Date courte", "En stock"]);
    expect([text.sold, text.notSold]).toEqual(["Vendu", "Non vendu"]);
    expect(text.emailAdd).toBe("Ajouter l'e-mail du patient");
    expect(text.doneTitle).toBe("Vente terminée !");
  });

  it("le design reste raisonnable : une bannière fine au repos, ouverte sur un côté de l'écran, jamais plus large que 600 px", () => {
    const { sizes } = BANNER;
    expect(sizes.widthIdle).toBeLessThanOrEqual(420);
    expect(sizes.heightIdle).toBeLessThanOrEqual(110);
    expect(sizes.widthExpanded).toBeLessThanOrEqual(600);
    expect(sizes.heightReduced).toBeLessThan(sizes.heightIdle);
    expect(BANNER.timing.readyPauseMs).toBeLessThan(2000);
  });
});

describe("ce que la bannière montre et fait", () => {
  it("reste ouverte pendant toute la vente : seuls « rien à ajouter » (8 s) et le message de fin (7 s) s'effacent seuls, plus un plafond de trois heures", () => {
    expect(BANNER.timing.quietMs).toBe(8000);
    expect(BANNER.timing.doneMs).toBe(7000);
    expect(banner).toContain("age * 1000.0 > Tim.QuietMs");
    expect(banner).toContain("age * 1000.0 > Tim.DoneMs");
    expect(banner).toContain("TimeSpan.FromHours(3)");
    // Pas d'autre minuterie qui rangerait la vente.
    expect([...banner.matchAll(/SetState\(St\.Idle\)/g)].length).toBeLessThanOrEqual(6);
    expect(banner).not.toContain("hideTimer");
  });

  it("s'agrandit toute seule aux conseils (« prête » puis ouverte), se réduit, se masque, se verrouille — et seul un conseil NOUVEAU la rouvre", () => {
    expect(banner).toContain("if (!sameSale) { userReduced = false; SetState(St.Ready); }");
    expect(banner).toContain("else if (fresh.Count > 0) { userReduced = false; if (state != St.Expanded) SetState(St.Expanded); }");
    expect(banner).toContain("if (state == St.Ready && age * 1000.0 > Tim.ReadyPauseMs) SetState(St.Expanded)");
    for (const name of ["SetReduced", "HideByUser", "SetPinned", "Reveal"]) expect(banner).toContain(`public void ${name}(`);
    // Masquée à la main, elle ne revient que pour une AUTRE vente avec conseil.
    expect(banner).toContain("if (hidden && hiddenSale != e.Id) { hidden = false; ShowCard(); }");
    // Verrouillée, on ne la déplace plus.
    expect(banner).toContain("if (pressed == null && !pinned)");
  });

  it("l'icône près de l'horloge reste toujours là : c'est le moyen de retrouver une bannière masquée", () => {
    expect(NOTICE_HOST_CSHARP).toContain("tray.Visible = true;");
    expect(NOTICE_HOST_CSHARP).toContain("banner.Reveal()");
    expect(NOTICE_HOST_CSHARP).toContain("Native.DestroyIcon(previous)");
    expect(NOTICE_HOST_CSHARP).toContain('count > 9 ? "9+"');
    for (const item of ["Afficher la bannière", "Réduire la bannière", "Masquer la bannière", "Verrouiller la position", "Vente terminée"]) expect(NOTICE_HOST_CSHARP).toContain(item);
  });

  it("réagit au scan, aux conseils, à la fin de vente : commandes scan, show, done, remove, init", () => {
    for (const op of ["init", "scan", "show", "done", "remove", "quit"]) expect(NOTICE_HOST_CSHARP).toContain(`op == "${op}"`);
    expect(banner).toContain("public void BeginScan()");
    expect(banner).toContain("if (sessionOpen) { analyzing = true; return; }");
  });

  it("répond à l'agent par les mêmes mots simples que l'ancienne fenêtre, et signale une erreur de dessin", () => {
    for (const word of ["PRET", "VENDU ", "NONVENDU ", "ANNULER ", "EMAIL ", "EMAIL_RETIRER ", "TERMINER ", "FERMEE ", "VOIR ", "ERREUR dessin "]) expect(NOTICE_HOST_CSHARP, word).toContain(`"${word}`);
    expect(banner).toContain("catch (Exception problem) { Fail(problem); }");
  });

  it("« Vendu » et « Non vendu » ne se déduisent de rien : seul un clic les envoie", () => {
    const choose = methodBody("Choose");
    expect(choose).toContain('"VENDU "');
    expect(choose).toContain('"NONVENDU "');
    expect(choose).toContain('"ANNULER "');
    expect([...banner.matchAll(/Choose\(h\.Item, "/g)]).toHaveLength(3);
  });

  it("montre pour chaque conseil : photo, nom, prix, « Pour : médicament », raison, pastilles Challenge / Date courte / stock, réponse", () => {
    const row = methodBody("PaintRow");
    for (const part of ["DrawPhoto(", "item.Name", "item.Price", "Txt.ForDrug + item.Drug", "item.Reason", "BuildPills(", '"vendu"', '"nonvendu"', '"modifier"']) expect(row, part).toContain(part);
    const pills = methodBody("BuildPills");
    expect(pills).toContain("item.Challenge.Length > 0");
    expect(pills).toContain("item.ShortDate.Length > 0");
    expect(pills).toContain("Txt.Challenge");
    expect(pills).toContain("Txt.ShortDate + \" \" + ShortDay(item.ShortDate)");
    expect(methodBody("Availability")).toContain("Txt.InStock");
  });

  it("garde l'e-mail du patient (avec accord), « Voir le détail » et « Vente terminée » à portée de clic", () => {
    const footer = methodBody("PaintFooter");
    for (const part of ['"email"', '"emailRemove"', '"detail"', '"finish"', "Txt.EmailAdd", "Txt.Detail", "Txt.Finish"]) expect(footer, part).toContain(part);
    expect(methodBody("Perform")).toContain('Say("TERMINER " + entry.Id)');
    expect(methodBody("Perform")).toContain('Say("EMAIL_RETIRER " + entry.Id)');
    expect(methodBody("Perform")).toContain('Say("VOIR " + entry.Id)');
  });

  it("une longue vente défile (molette) au lieu de déborder de l'écran, et le pied (e-mail, Vente terminée) reste toujours visible", () => {
    expect(banner).toContain("protected override void OnMouseWheel");
    expect(banner).toContain("float maxScroll = Math.Max(0f, listHeight - viewH)");
    expect(banner).toContain("g.SetClip(view, CombineMode.Intersect)");
    expect(banner).toContain("float footerTop = panelY + panelH - footer;");
  });

  it("le message de fin : grande coche verte qui se trace, étincelles, lignes et badge fournis par l'agent", () => {
    const doneDraw = methodBody("PaintDone");
    for (const part of ["Gfx.Tick(", "done.Lines", "done.Badge", "done.Warning", "Txt.DoneTitle"]) expect(doneDraw, part).toContain(part);
  });
});

describe("l'arbre de questions dans la bannière", () => {
  it("dessine les questions et un bouton par choix, et envoie REPONSE « question:choix » à l'agent", () => {
    expect(NOTICE_HOST_CSHARP).toContain("class Question");
    expect(NOTICE_HOST_CSHARP).toContain('Seq(d, "questions")');
    expect(NOTICE_HOST_CSHARP).toContain('Say("REPONSE " + entry.Id + " " + tag)');
    expect(NOTICE_HOST_CSHARP).toContain('h.Kind == "answer"');
  });

  it("un choix se coche tout de suite à l'écran (choix multiple : il bascule ; choix unique : il remplace), avant la réponse du serveur", () => {
    const body = methodBody("Answer");
    expect(body).toContain("c.Selected = !c.Selected");
    expect(body).toContain("if (!q.Multi) c.Selected = false");
  });

  it("la hauteur de la liste compte les questions : la bannière s'agrandit pour les montrer", () => {
    expect(methodBody("ListHeight")).toContain("QuestionsHeight(measure, inner)");
    expect(methodBody("PaintList")).toContain("PaintQuestions(");
  });

  it("une vente sans conseil mais avec une question affiche « Une question à poser », pas « Rien à ajouter »", () => {
    expect(methodBody("ReadyTitle")).toContain("Txt.QuestionTitle");
    expect(BANNER.text.questionTitle).toBe("Une question à poser");
  });

  it("la pastille de stock porte le stock exact : « Stock faible · 3 »", () => {
    expect(methodBody("Availability")).toContain('Txt.LowStock + (quantity.Length > 0 ? " · " + quantity : "")');
    expect(methodBody("Availability")).toContain('Txt.InStock + (quantity.Length > 0 ? " · " + quantity : "")');
  });
});

describe("le script PowerShell qui la lance", () => {
  it("compile le C# tel quel, avec les trois assemblages utiles, puis lance la bannière", () => {
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
    expect(code, "initialiseur de propriété automatique").not.toMatch(/\{\s*get;\s*(?:set;)?\s*\}\s*=/);
  });
});

/**
 * Le contrôle qui compte : le C# compile avec le compilateur de Windows PowerShell 5.1 (langage C# 5) contre .NET Framework 4.8. Il
 * demande `dotnet` et les assemblages de référence (téléchargés une fois) : il ne tourne que sur demande —
 * PB_CSHARP_CHECK=1 npx vitest run agent/src/__tests__/notice-host.test.ts — et dans l'atelier de livraison.
 */
const dotnetAsked = process.env.PB_CSHARP_CHECK === "1";
describe.skipIf(!dotnetAsked)("la compilation du code Windows (C# 5, .NET Framework 4.8)", () => {
  it("compile sans erreur ni avertissement", () => {
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
