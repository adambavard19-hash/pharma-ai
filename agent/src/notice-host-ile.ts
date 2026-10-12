/**
 * L'île PharmaBoost du poste de caisse : la bannière validée par le fondateur (capsule noire, notre robot dedans, tout le
 * parcours de la vente joué à l'intérieur), affichée par WebView2 — le moteur web de Windows — à partir de la MÊME page
 * que l'aperçu (`/poste/ile`). Mêmes composants, mêmes animations : le rendu est celui de la page, au pixel près.
 *
 * Un processus (PowerShell + C# compilé à la volée, comme la bannière GDI+) reste en vie tant que l'agent tourne. Il parle
 * EXACTEMENT le langage de la bannière (notice-host.ts) : il reçoit les mêmes commandes JSON sur son entrée standard et
 * les transmet telles quelles à la page ; la page répond par les mêmes mots (VENDU, NONVENDU, EMAIL, TERMINER…), qu'il
 * écrit sur sa sortie standard. L'agent ne voit aucune différence, et la bannière GDI+ reste prête à prendre le relais.
 *
 * La fenêtre :
 *  • sans bordure, toujours devant, hors de la barre des tâches, en haut au centre de l'écran (ou à droite) ;
 *  • elle ne prend JAMAIS le clavier ni le focus (WS_EX_NOACTIVATE, WM_MOUSEACTIVATE → « ne pas activer ») : la douchette
 *    et les touches vont au logiciel de gestion. Si le moteur web s'active malgré tout, la main est rendue aussitôt à la
 *    fenêtre d'avant. Seule exception, voulue : le champ « e-mail du patient » prend le clavier le temps de la saisie ;
 *  • sa FORME suit l'île : la page envoie les rectangles arrondis qu'elle occupe, la fenêtre se découpe à cette forme
 *    (Region) ; ailleurs, les clics passent au logiciel de gestion en dessous ;
 *  • elle n'ouvre que la page de l'île de PharmaBoost : toute autre navigation, nouvelle fenêtre, menu contextuel, outils
 *    de développement ou raccourcis du navigateur sont coupés.
 *
 * Les secours : moteur WebView2 absent, page injoignable ou plantage → l'agent repasse à la bannière GDI+, puis à l'ancienne
 * fenêtre, puis à la notification Windows (notice-center.ts).
 *
 * Écrit en C# 5 (Windows PowerShell 5.1) : pas d'interpolation, pas de « ?. », pas de propriétés à initialiseur.
 */

/** Le kit WebView2 (bibliothèques .NET + chargeur natif), servi par PharmaBoost et vérifié par empreinte. */
export const WEBVIEW2_SDK = {
  version: "1.0.2903.40",
  /** Chemin relatif → SHA-256. Microsoft, licence BSD (public/poste/webview2/<version>/LICENSE.txt). */
  files: {
    "Microsoft.Web.WebView2.Core.dll": "88a3b62f45225a811cdb85df6dfd95c2bff9a0e43e3b04f813b125eaca56cc9f",
    "Microsoft.Web.WebView2.WinForms.dll": "29fc954c3fde1749817d158f3dd5ebe9efd3b3ce9708d86092fb1e9f023a1cb0",
    "x64/WebView2Loader.dll": "462b36fd1be6ca9f7563466a89e57c41ef4a4def3e0a84fa885d203aea4a3aaf",
    "x86/WebView2Loader.dll": "6f59ad578fde1f65c44b6935dab0901f014b5268e056b930fb34c0919f1bf4b9",
    "arm64/WebView2Loader.dll": "cb561ae4537e39bba5dd8af1f648f189d9562b1003fd110a9e889ace527fb4e8",
  } as Record<string, string>,
} as const;

/** La taille de la fenêtre, en pixels « à 100 % » : assez pour l'île la plus grande (conseils + questions). */
export const ISLAND_WINDOW = { width: 600, height: 760, top: 6 } as const;

export const NOTICE_HOST_ILE_CSHARP = String.raw`
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace PharmaBoostIle
{
  internal static class Native
  {
    public const int WM_MOUSEACTIVATE = 0x0021;
    public const int MA_NOACTIVATE = 3;
    public const int WS_EX_TOPMOST = 0x00000008;
    public const int WS_EX_TOOLWINDOW = 0x00000080;
    public const int WS_EX_NOACTIVATE = 0x08000000;
    public const uint GA_ROOT = 2;

    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hWnd, uint flags);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
    [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] public static extern bool SetProcessDPIAware();
  }

  /// <summary>Ce que la fenêtre écrit pour l'agent : une ligne par mot, jamais deux fils à la fois.</summary>
  internal static class Out
  {
    private static readonly object Gate = new object();
    public static void Word(string line) { lock (Gate) { Console.Out.WriteLine(line); Console.Out.Flush(); } }
    public static void Error(string line) { lock (Gate) { Console.Error.WriteLine(line); Console.Error.Flush(); } }
  }

  public sealed class IleForm : Form
  {
    private readonly string pageUrl;
    private readonly string allowedPrefix;
    private readonly string loaderDir;
    private readonly string userDataDir;
    private readonly WebView2 web;
    private readonly List<string> pending = new List<string>();
    private readonly System.Windows.Forms.Timer focusTimer = new System.Windows.Forms.Timer();
    private readonly JavaScriptSerializer json = new JavaScriptSerializer();
    private bool pageReady;
    private bool keyboard;
    private bool rightSide;
    private IntPtr lastExternal = IntPtr.Zero;
    private float scale = 1f;
    private readonly int processId;
    private NotifyIcon tray;
    private ToolStripMenuItem toggleItem;

    public IleForm(string url, string loader, string userData)
    {
      pageUrl = url;
      Uri parsed = new Uri(url);
      allowedPrefix = parsed.GetLeftPart(UriPartial.Path);
      loaderDir = loader;
      userDataDir = userData;
      processId = System.Diagnostics.Process.GetCurrentProcess().Id;
      json.MaxJsonLength = 16 * 1024 * 1024;

      FormBorderStyle = FormBorderStyle.None;
      ShowInTaskbar = false;
      TopMost = true;
      StartPosition = FormStartPosition.Manual;
      BackColor = Color.FromArgb(11, 15, 20);
      Text = "PharmaBoost";

      web = new WebView2();
      web.Dock = DockStyle.Fill;
      web.DefaultBackgroundColor = Color.Transparent;
      Controls.Add(web);

      focusTimer.Interval = 250;
      focusTimer.Tick += delegate { GuardFocus(); };
      MakeTray();
    }

    protected override bool ShowWithoutActivation { get { return true; } }

    protected override CreateParams CreateParams
    {
      get
      {
        CreateParams p = base.CreateParams;
        p.ExStyle |= Native.WS_EX_NOACTIVATE | Native.WS_EX_TOOLWINDOW | Native.WS_EX_TOPMOST;
        return p;
      }
    }

    protected override void WndProc(ref Message m)
    {
      // Un clic ne prend jamais le premier plan au logiciel de gestion (sauf pendant la saisie de l'e-mail du patient).
      if (m.Msg == Native.WM_MOUSEACTIVATE && !keyboard)
      {
        m.Result = (IntPtr)Native.MA_NOACTIVATE;
        return;
      }
      base.WndProc(ref m);
    }

    /// <summary>Place la fenêtre (en haut au centre, ou à droite) et lui donne d'abord la forme de la capsule au repos.</summary>
    public void Place(string position)
    {
      rightSide = position == "haut-droite";
      using (Graphics g = Graphics.FromHwnd(IntPtr.Zero)) { scale = g.DpiX / 96f; }
      Rectangle area = Screen.PrimaryScreen.WorkingArea;
      int width = (int)Math.Round(${ISLAND_WINDOW.width} * scale);
      int height = Math.Min((int)Math.Round(${ISLAND_WINDOW.height} * scale), area.Height - 16);
      int x = rightSide ? area.Right - width - (int)(12 * scale) : area.Left + (area.Width - width) / 2;
      int y = area.Top + (int)(${ISLAND_WINDOW.top} * scale);
      Bounds = new Rectangle(x, y, width, height);
      // Avant que la page dise sa forme : la capsule au repos (244 × 44 au centre), jamais un grand rectangle qui masquerait le logiciel.
      ApplyRegion(new List<float[]> { new float[] { (${ISLAND_WINDOW.width} - 250) / 2f, 5, 250, 50, 25 } });
    }

    public async void Start()
    {
      try
      {
        CoreWebView2Environment.SetLoaderDllFolderPath(loaderDir);
        string version = CoreWebView2Environment.GetAvailableBrowserVersionString();
        if (string.IsNullOrEmpty(version)) throw new InvalidOperationException("moteur WebView2 absent");
        CoreWebView2EnvironmentOptions options = new CoreWebView2EnvironmentOptions("--disable-features=msSmartScreenProtection --autoplay-policy=no-user-gesture-required");
        CoreWebView2Environment env = await CoreWebView2Environment.CreateAsync(null, userDataDir, options);
        await web.EnsureCoreWebView2Async(env);
        CoreWebView2 core = web.CoreWebView2;
        CoreWebView2Settings s = core.Settings;
        s.AreDevToolsEnabled = false;
        s.AreDefaultContextMenusEnabled = false;
        s.AreDefaultScriptDialogsEnabled = false;
        s.IsZoomControlEnabled = false;
        s.IsStatusBarEnabled = false;
        s.AreBrowserAcceleratorKeysEnabled = false;
        s.IsPasswordAutosaveEnabled = false;
        s.IsGeneralAutofillEnabled = false;
        core.NavigationStarting += OnNavigationStarting;
        core.NewWindowRequested += delegate(object sender, CoreWebView2NewWindowRequestedEventArgs e) { e.Handled = true; };
        core.NavigationCompleted += OnNavigationCompleted;
        core.WebMessageReceived += OnWebMessage;
        core.ProcessFailed += delegate(object sender, CoreWebView2ProcessFailedEventArgs e)
        {
          if (pageReady) Out.Word("ERREUR dessin ile : moteur arrêté (" + e.ProcessFailedKind + ")");
          else Out.Error("ERREUR ile : moteur arrêté au démarrage (" + e.ProcessFailedKind + ")");
        };
        core.Navigate(pageUrl);
        focusTimer.Start();
      }
      catch (Exception ex)
      {
        Out.Error("ERREUR ile : " + ex.GetType().Name + " — " + ex.Message);
      }
    }

    private void OnNavigationStarting(object sender, CoreWebView2NavigationStartingEventArgs e)
    {
      // Seule la page de l'île de PharmaBoost s'ouvre ici.
      if (!e.Uri.StartsWith(allowedPrefix, StringComparison.Ordinal)) e.Cancel = true;
    }

    private void OnNavigationCompleted(object sender, CoreWebView2NavigationCompletedEventArgs e)
    {
      if (!e.IsSuccess && !pageReady) Out.Error("ERREUR ile : page injoignable (" + e.WebErrorStatus + ")");
    }

    /// <summary>Une commande de l'agent : transmise telle quelle à la page (gardée tant que la page n'est pas prête).</summary>
    public void Command(string line)
    {
      if (line.Contains("\"op\":\"quit\""))
      {
        Quit();
        return;
      }
      if (line.Contains("\"op\":\"init\""))
      {
        string position = line.Contains("\"position\":\"haut-droite\"") ? "haut-droite" : "haut-centre";
        if ((position == "haut-droite") != rightSide) Place(position);
      }
      if (!pageReady)
      {
        pending.Add(line);
        return;
      }
      Post(line);
    }

    private void Post(string line)
    {
      try { web.CoreWebView2.PostWebMessageAsString(line); }
      catch (Exception ex) { Out.Error("ERREUR ile : envoi impossible (" + ex.Message + ")"); }
    }

    private void OnWebMessage(object sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
      if (!e.Source.StartsWith(allowedPrefix, StringComparison.Ordinal)) return;
      Dictionary<string, object> message;
      try { message = json.Deserialize<Dictionary<string, object>>(e.WebMessageAsJson); }
      catch (Exception) { return; }
      if (message == null || !message.ContainsKey("type")) return;
      string type = Convert.ToString(message["type"]);
      if (type == "ready")
      {
        if (pageReady) return;
        pageReady = true;
        Out.Word("PRET");
        foreach (string line in pending) Post(line);
        pending.Clear();
      }
      else if (type == "word" && message.ContainsKey("word"))
      {
        string word = Convert.ToString(message["word"]).Replace("\r", " ").Replace("\n", " ").Trim();
        if (word.Length > 0 && word.Length <= 400) Out.Word(word);
        if (!keyboard) GiveFocusBack();
      }
      else if (type == "region" && message.ContainsKey("rects"))
      {
        List<float[]> rects = new List<float[]>();
        object[] list = message["rects"] as object[];
        if (list == null) { System.Collections.ArrayList al = message["rects"] as System.Collections.ArrayList; if (al != null) list = al.ToArray(); }
        if (list == null) return;
        foreach (object item in list)
        {
          Dictionary<string, object> r = item as Dictionary<string, object>;
          if (r == null) continue;
          rects.Add(new float[] { ToF(r, "x"), ToF(r, "y"), ToF(r, "w"), ToF(r, "h"), ToF(r, "r") });
        }
        ApplyRegion(rects);
      }
      else if (type == "keyboard")
      {
        bool on = message.ContainsKey("on") && Convert.ToBoolean(message["on"]);
        keyboard = on;
        if (on)
        {
          Activate();
          web.Focus();
        }
        else GiveFocusBack();
      }
    }

    private static float ToF(Dictionary<string, object> r, string key)
    {
      return r.ContainsKey(key) ? Convert.ToSingle(r[key]) : 0f;
    }

    /// <summary>La forme de la fenêtre : l'union des rectangles arrondis de l'île (pixels CSS → pixels de l'écran).</summary>
    private void ApplyRegion(List<float[]> rects)
    {
      GraphicsPath path = new GraphicsPath();
      foreach (float[] r in rects)
      {
        float x = r[0] * scale, y = r[1] * scale, w = r[2] * scale, h = r[3] * scale;
        float d = Math.Min(Math.Min(w, h), Math.Max(0f, r[4] * scale * 2f));
        if (w <= 0 || h <= 0) continue;
        if (d < 1f) { path.AddRectangle(new RectangleF(x, y, w, h)); continue; }
        path.AddArc(x, y, d, d, 180, 90);
        path.AddArc(x + w - d, y, d, d, 270, 90);
        path.AddArc(x + w - d, y + h - d, d, d, 0, 90);
        path.AddArc(x, y + h - d, d, d, 90, 90);
        path.CloseFigure();
      }
      Region previous = Region;
      Region = new Region(path);
      if (previous != null) previous.Dispose();
      path.Dispose();
    }

    private bool IsOurs(IntPtr hwnd)
    {
      if (hwnd == IntPtr.Zero) return false;
      if (hwnd == Handle || Native.GetAncestor(hwnd, Native.GA_ROOT) == Handle) return true;
      uint pid;
      Native.GetWindowThreadProcessId(hwnd, out pid);
      return pid == (uint)processId;
    }

    /// <summary>Retient la fenêtre au premier plan (le logiciel de gestion) ; si l'île l'a prise par mégarde, la rend.</summary>
    private void GuardFocus()
    {
      IntPtr fg = Native.GetForegroundWindow();
      if (!IsOurs(fg)) { lastExternal = fg; return; }
      if (!keyboard) GiveFocusBack();
    }

    private void GiveFocusBack()
    {
      IntPtr fg = Native.GetForegroundWindow();
      if (lastExternal != IntPtr.Zero && IsOurs(fg)) Native.SetForegroundWindow(lastExternal);
    }

    private void MakeTray()
    {
      tray = new NotifyIcon();
      Bitmap bmp = new Bitmap(16, 16);
      using (Graphics g = Graphics.FromImage(bmp))
      {
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.Clear(Color.Transparent);
        using (SolidBrush dark = new SolidBrush(Color.FromArgb(11, 15, 20))) g.FillEllipse(dark, 0, 0, 15, 15);
        using (SolidBrush eye = new SolidBrush(Color.FromArgb(88, 242, 216))) { g.FillEllipse(eye, 4, 6, 3, 4); g.FillEllipse(eye, 9, 6, 3, 4); }
      }
      tray.Icon = Icon.FromHandle(bmp.GetHicon());
      tray.Text = "PharmaBoost";
      ContextMenuStrip menu = new ContextMenuStrip();
      toggleItem = new ToolStripMenuItem("Masquer la bannière");
      toggleItem.Click += delegate { ToggleVisible(); };
      menu.Items.Add(toggleItem);
      tray.ContextMenuStrip = menu;
      tray.DoubleClick += delegate { ToggleVisible(); };
      tray.Visible = true;
    }

    private void ToggleVisible()
    {
      if (Visible) { Hide(); toggleItem.Text = "Afficher la bannière"; }
      else { Show(); toggleItem.Text = "Masquer la bannière"; }
    }

    public void Quit()
    {
      focusTimer.Stop();
      if (tray != null) { tray.Visible = false; tray.Dispose(); }
      Application.ExitThread();
    }
  }

  public static class Program
  {
    public static void Run(string url, string loaderDir, string userDataDir)
    {
      try { Native.SetProcessDPIAware(); } catch (Exception) { }
      Application.EnableVisualStyles();
      IleForm form = new IleForm(url, loaderDir, userDataDir);
      form.Place("haut-centre");
      // L'entrée standard (les commandes de l'agent) est lue sur un fil à part, puis passée au fil de la fenêtre.
      Thread reader = new Thread(delegate ()
      {
        try
        {
          string line;
          while ((line = Console.In.ReadLine()) != null)
          {
            string copy = line;
            if (copy.Trim().Length == 0) continue;
            try { form.BeginInvoke((MethodInvoker)delegate { form.Command(copy); }); } catch (Exception) { }
          }
        }
        catch (Exception) { }
        try { form.BeginInvoke((MethodInvoker)delegate { form.Quit(); }); } catch (Exception) { }
      });
      reader.IsBackground = true;
      // Les commandes ne sont lues qu'une fois la fenêtre créée (BeginInvoke en a besoin) ; elles attendent dans le tuyau.
      form.Shown += delegate { form.Start(); reader.Start(); };
      Application.Run(form);
    }
  }
}
`;

/** Une chaîne PowerShell entre apostrophes : l'apostrophe se double. */
const psQuote = (value: string) => `'${value.replace(/'/g, "''")}'`;

/**
 * Le script PowerShell qui charge le kit WebView2, compile ce C# et ouvre l'île. Lancé avec -STA (Windows Forms). Une
 * erreur (kit illisible, compilation, moteur absent, page injoignable) sort sur la sortie d'erreur AVANT « PRET » :
 * l'agent la voit et repasse à la bannière GDI+.
 */
export function noticeHostIleScript(input: { sdkDir: string; loaderDir: string; userDataDir: string; url: string }): string {
  const core = `${input.sdkDir}\\Microsoft.Web.WebView2.Core.dll`;
  const winforms = `${input.sdkDir}\\Microsoft.Web.WebView2.WinForms.dll`;
  return `$ErrorActionPreference = "Stop"
$core = ${psQuote(core)}
$winforms = ${psQuote(winforms)}
Add-Type -Path $core
Add-Type -Path $winforms
$code = @'
${NOTICE_HOST_ILE_CSHARP}
'@
Add-Type -TypeDefinition $code -ReferencedAssemblies System.Windows.Forms,System.Drawing,System.Web.Extensions,$core,$winforms
[PharmaBoostIle.Program]::Run(${psQuote(input.url)}, ${psQuote(input.loaderDir)}, ${psQuote(input.userDataDir)})
`;
}

/** Le dossier du chargeur natif pour l'architecture du processus PowerShell (x64 le plus souvent). */
export function loaderArch(arch: string): "x64" | "x86" | "arm64" {
  if (arch === "arm64") return "arm64";
  if (arch === "ia32" || arch === "x86") return "x86";
  return "x64";
}
