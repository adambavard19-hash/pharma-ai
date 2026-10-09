#!/usr/bin/env node
"use strict";

// agent/src/index.ts
var import_node_crypto3 = require("node:crypto");

// agent/src/douchette.ts
var import_node_child_process = require("node:child_process");
var import_node_fs = require("node:fs");
var import_node_path = require("node:path");

// agent/src/scan-detect.ts
var DEFAULTS = { maxGapMs: 120, minLength: 7, maxLength: 80, settleMs: 250 };
var ScanDetector = class {
  constructor(onScan, options = {}) {
    this.onScan = onScan;
    this.options = { ...DEFAULTS, ...options };
  }
  onScan;
  buffer = "";
  lastAt = 0;
  /** Dernière touche qui n'était pas un chiffre : une rafale qui la suit de trop près est une frappe humaine. */
  lastOtherAt = -Infinity;
  tainted = false;
  options;
  /** Une touche arrive. `key` vaut un caractère (« 3 »), « Enter », « Tab » ou autre chose. */
  feed(event) {
    const { maxGapMs, minLength } = this.options;
    if (this.buffer && event.at - this.lastAt > maxGapMs) {
      this.flushIfScan(this.lastAt);
      this.buffer = "";
    }
    if (event.key === "Enter" || event.key === "Tab") {
      this.flushIfScan(event.at);
      this.buffer = "";
      return;
    }
    if (/^[0-9A-Za-z]$/.test(event.key)) {
      if (!this.buffer) this.tainted = event.at - this.lastOtherAt < maxGapMs * 3;
      this.buffer += event.key.toUpperCase();
      this.lastAt = event.at;
      if (this.buffer.length > this.options.maxLength) this.buffer = "";
      return;
    }
    if (this.buffer && event.at - this.lastAt <= maxGapMs) {
      this.lastAt = event.at;
      return;
    }
    this.buffer = "";
    this.lastOtherAt = event.at;
    void minLength;
  }
  /** À appeler régulièrement : clôt une rafale restée sans Entrée. */
  tick(now) {
    if (this.buffer && now - this.lastAt > this.options.settleMs) {
      this.flushIfScan(this.lastAt);
      this.buffer = "";
    }
  }
  flushIfScan(at) {
    if (!this.tainted && this.buffer.length >= this.options.minLength && this.buffer.length <= this.options.maxLength) this.onScan(this.buffer, at);
    this.tainted = false;
  }
};
function normalizeScannedCode(raw) {
  const text = raw.replace(/^\](D2|C1|E0|Q3)/i, "").trim();
  if (/^\d{13}$/.test(text)) return text;
  if (/^\d{7,8}$/.test(text)) return text;
  const gs1 = /^01(\d{14})/.exec(text);
  if (gs1) {
    const gtin14 = gs1[1];
    return gtin14.startsWith("0") ? gtin14.slice(1) : gtin14;
  }
  return null;
}

// agent/src/douchette.ts
var HOOK_SCRIPT = String.raw`
$code = @"
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows.Forms;
public static class PharmaBoostHook {
  private const int WH_KEYBOARD_LL = 13;
  private const int WM_KEYDOWN = 0x0100;
  private const int WM_SYSKEYDOWN = 0x0104;
  private delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);
  private static LowLevelKeyboardProc _proc = HookCallback;
  private static IntPtr _hookId = IntPtr.Zero;
  [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
  private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);
  [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
  private static extern bool UnhookWindowsHookEx(IntPtr hhk);
  [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
  private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);
  [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
  private static extern IntPtr GetModuleHandle(string lpModuleName);
  public static void Run() {
    using (Process curProcess = Process.GetCurrentProcess())
    using (ProcessModule curModule = curProcess.MainModule) {
      _hookId = SetWindowsHookEx(WH_KEYBOARD_LL, _proc, GetModuleHandle(curModule.ModuleName), 0);
    }
    if (_hookId == IntPtr.Zero) { Console.Out.WriteLine("ERROR hook"); Console.Out.Flush(); return; }
    Console.Out.WriteLine("READY");
    Console.Out.Flush();
    Application.Run();
  }
  private static IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
    if (nCode >= 0 && (wParam == (IntPtr)WM_KEYDOWN || wParam == (IntPtr)WM_SYSKEYDOWN)) {
      int vk = Marshal.ReadInt32(lParam);
      long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
      string key;
      if (vk >= 0x30 && vk <= 0x39) key = ((char)('0' + (vk - 0x30))).ToString();
      else if (vk >= 0x60 && vk <= 0x69) key = ((char)('0' + (vk - 0x60))).ToString();
      else if (vk >= 0x41 && vk <= 0x5A) key = ((char)('A' + (vk - 0x41))).ToString();
      else if (vk == 0x0D) key = "Enter";
      else if (vk == 0x09) key = "Tab";
      else if (vk == 0x10 || vk == 0xA0 || vk == 0xA1) key = "Shift";
      else key = "Other";
      Console.Out.WriteLine("KEY " + key + " " + now);
      Console.Out.Flush();
    }
    return CallNextHookEx(_hookId, nCode, wParam, lParam);
  }
}
"@
Add-Type -TypeDefinition $code -ReferencedAssemblies System.Windows.Forms
[PharmaBoostHook]::Run()
`;
function startDouchette(configDir, handlers) {
  if (process.platform !== "win32") {
    handlers.onStatus("L'\xE9coute de la douchette n'est disponible que sous Windows.");
    return () => void 0;
  }
  const scriptPath = (0, import_node_path.join)(configDir, "pharmaboost-douchette.ps1");
  (0, import_node_fs.mkdirSync)((0, import_node_path.dirname)(scriptPath), { recursive: true });
  (0, import_node_fs.writeFileSync)(scriptPath, HOOK_SCRIPT, "utf8");
  const detector = new ScanDetector((raw, at) => {
    const code = normalizeScannedCode(raw);
    if (code) handlers.onScan(code, at);
  });
  let child = null;
  let stopped = false;
  const tick = setInterval(() => detector.tick(Date.now()), 100);
  const launch = () => {
    if (stopped) return;
    child = (0, import_node_child_process.spawn)("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let pending = "";
    child.stdout?.on("data", (chunk) => {
      pending += chunk.toString("utf8");
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? "";
      for (const line of lines) {
        if (line === "READY") handlers.onStatus("Douchette \xE9cout\xE9e.");
        else if (line.startsWith("ERROR")) handlers.onStatus(`Le hook clavier a \xE9chou\xE9 : ${line}`);
        else if (line.startsWith("KEY ")) {
          const [, key, at] = line.split(" ");
          if (key === "Shift") continue;
          detector.feed({ key: key ?? "Other", at: Number(at) || Date.now() });
        }
      }
    });
    child.stderr?.on("data", (chunk) => handlers.onStatus(`Douchette (PowerShell) : ${chunk.toString("utf8").trim().slice(0, 300)}`));
    child.on("exit", (code) => {
      if (stopped) return;
      handlers.onStatus(`L'\xE9coute de la douchette s'est arr\xEAt\xE9e (code ${code ?? "?"}) ; relance dans 10 s.`);
      setTimeout(launch, 1e4);
    });
  };
  launch();
  return () => {
    stopped = true;
    clearInterval(tick);
    child?.kill();
  };
}

// agent/src/toast.ts
var import_node_child_process2 = require("node:child_process");
var import_node_fs2 = require("node:fs");
var import_node_path2 = require("node:path");
function serializeToast(content) {
  const lines = [
    `T${content.title}`,
    `S${content.subject}`,
    `U${content.url}`,
    `D${Math.max(4, Math.min(60, Math.round(content.seconds)))}`,
    ...content.alerts.map((text) => `!${text}`),
    ...content.advice.map((text) => `+${text}`)
  ];
  return lines.map((line) => line.replace(/[\r\n]+/g, " ")).join("\r\n") + "\r\n";
}
var TOAST_SCRIPT = String.raw`
param([string]$DataFile)
$code = @"
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Windows.Forms;
public class PharmaBoostToast : Form {
  private string url = "";
  protected override bool ShowWithoutActivation { get { return true; } }
  protected override CreateParams CreateParams {
    get { CreateParams p = base.CreateParams; p.ExStyle |= 0x08000000 | 0x00000080; return p; }
  }
  public static void Show(string dataFile) {
    string[] lines = File.ReadAllLines(dataFile, System.Text.Encoding.UTF8);
    string title = "PharmaBoost", subject = "", url = "";
    int seconds = 12;
    List<string> alerts = new List<string>();
    List<string> advice = new List<string>();
    foreach (string raw in lines) {
      if (raw.Length == 0) continue;
      char k = raw[0]; string v = raw.Substring(1);
      if (k == 'T') title = v; else if (k == 'S') subject = v; else if (k == 'U') url = v;
      else if (k == 'D') int.TryParse(v, out seconds);
      else if (k == '!') alerts.Add(v); else if (k == '+') advice.Add(v);
    }
    PharmaBoostToast f = new PharmaBoostToast();
    f.url = url;
    f.Build(title, subject, alerts, advice, seconds);
    Application.Run(f);
  }
  private void Build(string title, string subject, List<string> alerts, List<string> advice, int seconds) {
    FormBorderStyle = FormBorderStyle.None; ShowInTaskbar = false; TopMost = true; StartPosition = FormStartPosition.Manual;
    BackColor = Color.FromArgb(24, 33, 31); ForeColor = Color.White; Padding = new Padding(14, 12, 14, 12);
    Width = 420; AutoSize = true; AutoSizeMode = AutoSizeMode.GrowAndShrink;
    FlowLayoutPanel panel = new FlowLayoutPanel();
    panel.FlowDirection = FlowDirection.TopDown; panel.WrapContents = false; panel.AutoSize = true; panel.Width = 392; panel.Margin = new Padding(0);
    panel.Click += OpenUrl;
    AddLabel(panel, title, new Font("Segoe UI", 9, FontStyle.Bold), Color.FromArgb(120, 200, 180));
    if (subject.Length > 0) AddLabel(panel, subject, new Font("Segoe UI", 10, FontStyle.Bold), Color.White);
    foreach (string a in alerts) AddLabel(panel, "⚠ " + a, new Font("Segoe UI", 10, FontStyle.Bold), Color.FromArgb(255, 170, 120));
    foreach (string a in advice) AddLabel(panel, "• " + a, new Font("Segoe UI", 10), Color.White);
    AddLabel(panel, "Cliquer pour ouvrir dans PharmaBoost · disparaît dans " + seconds + " s", new Font("Segoe UI", 8), Color.FromArgb(160, 170, 166));
    Controls.Add(panel);
    Click += OpenUrl;
    Rectangle area = Screen.PrimaryScreen.WorkingArea;
    Load += delegate { Location = new Point(area.Right - Width - 16, area.Bottom - Height - 16); };
    Timer t = new Timer(); t.Interval = seconds * 1000; t.Tick += delegate { Close(); }; t.Start();
  }
  private void AddLabel(FlowLayoutPanel panel, string text, Font font, Color color) {
    Label l = new Label(); l.Text = text; l.Font = font; l.ForeColor = color; l.AutoSize = true; l.MaximumSize = new Size(392, 0); l.Margin = new Padding(0, 2, 0, 2);
    l.Click += OpenUrl; panel.Controls.Add(l);
  }
  private void OpenUrl(object sender, EventArgs e) {
    if (url.Length > 0) { try { Process.Start(url); } catch {} }
    Close();
  }
}
"@
Add-Type -TypeDefinition $code -ReferencedAssemblies System.Windows.Forms,System.Drawing
[PharmaBoostToast]::Show($DataFile)
`;
var current = null;
function showToast(configDir, content, onStatus) {
  if (process.platform !== "win32") {
    onStatus(`Avis (non affich\xE9 hors Windows) : ${content.subject} \u2014 ${[...content.alerts, ...content.advice].join(" / ")}`);
    return;
  }
  (0, import_node_fs2.mkdirSync)(configDir, { recursive: true });
  const scriptPath = (0, import_node_path2.join)(configDir, "pharmaboost-avis.ps1");
  const dataPath = (0, import_node_path2.join)(configDir, `pharmaboost-avis-${Date.now()}.txt`);
  (0, import_node_fs2.writeFileSync)(scriptPath, "\uFEFF" + TOAST_SCRIPT, "utf8");
  (0, import_node_fs2.writeFileSync)(dataPath, "\uFEFF" + serializeToast(content), "utf8");
  if (current && !current.killed) current.kill();
  current = (0, import_node_child_process2.spawn)("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", scriptPath, "-DataFile", dataPath], { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
  current.stderr?.on("data", (chunk) => onStatus(`Avis (PowerShell) : ${chunk.toString("utf8").trim().slice(0, 300)}`));
  current.on("exit", () => {
    try {
      (0, import_node_fs2.unlinkSync)(dataPath);
    } catch {
    }
  });
}

// agent/src/self-update.ts
var import_node_crypto = require("node:crypto");
var import_node_fs3 = require("node:fs");
var import_node_path3 = require("node:path");
var UPDATE_CHECK_EVERY_MS = 12e4;
var QUIET_AFTER_SCAN_MS = 3e4;
var MAX_AGENT_BYTES = 3e6;
function isTrustedServer(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  } catch {
    return false;
  }
}
var sha256 = (bytes) => (0, import_node_crypto.createHash)("sha256").update(bytes).digest("hex");
function canUpdateNow(state) {
  if (state.watching || state.queuedScans > 0 || state.pendingNotices > 0) return false;
  return state.lastScanAt === null || state.now - state.lastScanAt >= QUIET_AFTER_SCAN_MS;
}
function isInstalledAgent(agentPath, configPath, platform = process.platform) {
  if (platform !== "win32" || !agentPath) return false;
  return /pharmaboost-connect\.js$/i.test(agentPath) && import_node_path3.win32.dirname(agentPath).toLowerCase() === import_node_path3.win32.dirname(configPath).toLowerCase();
}
async function selfUpdate(options) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const base = options.serverUrl.replace(/\/$/, "");
  if (!isTrustedServer(base)) return { status: "skipped", detail: "serveur non s\xFBr (ni https, ni poste de d\xE9veloppement)" };
  if (!(0, import_node_fs3.existsSync)(options.agentPath)) return { status: "skipped", detail: "fichier de l'agent introuvable" };
  try {
    const meta = await (await fetchImpl(`${base}/api/agent/version`, { signal: AbortSignal.timeout(1e4), headers: { accept: "application/json" } })).json();
    const wanted = typeof meta.sha256 === "string" ? meta.sha256.toLowerCase() : "";
    if (!/^[0-9a-f]{64}$/.test(wanted)) return { status: "skipped", detail: "empreinte annonc\xE9e illisible" };
    const current2 = sha256((0, import_node_fs3.readFileSync)(options.agentPath));
    if (current2 === wanted) return { status: "uptodate", detail: "\xE0 jour", sha: current2 };
    const dir = (0, import_node_path3.dirname)(options.agentPath);
    const refusedPath = (0, import_node_path3.join)(dir, "pharmaboost-refusee.txt");
    if ((0, import_node_fs3.existsSync)(refusedPath) && (0, import_node_fs3.readFileSync)(refusedPath, "utf8").trim() === wanted) return { status: "skipped", detail: "cette version n'a pas tenu sur ce poste : elle n'est pas r\xE9install\xE9e", sha: wanted };
    const response = await fetchImpl(`${base}/api/agent/fichiers/pharmaboost-connect.js`, { signal: AbortSignal.timeout(3e4) });
    if (!response.ok) return { status: "failed", detail: `t\xE9l\xE9chargement refus\xE9 (HTTP ${response.status})` };
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_AGENT_BYTES) return { status: "failed", detail: "fichier re\xE7u de taille anormale" };
    if (sha256(bytes) !== wanted) return { status: "failed", detail: "l'empreinte du fichier re\xE7u n'est pas celle annonc\xE9e : mise \xE0 jour ignor\xE9e" };
    const staged = `${options.agentPath}.new`;
    (0, import_node_fs3.writeFileSync)(staged, bytes);
    (0, import_node_fs3.copyFileSync)(options.agentPath, `${options.agentPath}.previous`);
    (0, import_node_fs3.copyFileSync)(staged, options.agentPath);
    (0, import_node_fs3.unlinkSync)(staged);
    (0, import_node_fs3.writeFileSync)((0, import_node_path3.join)(dir, "pharmaboost-maj.txt"), wanted);
    return { status: "updated", detail: `nouvelle version ${typeof meta.version === "string" ? meta.version : ""} install\xE9e`.trim(), sha: wanted };
  } catch (error) {
    return { status: "failed", detail: error instanceof Error ? error.message : String(error) };
  }
}

// agent/src/notice-center.ts
var import_node_child_process3 = require("node:child_process");
var import_node_crypto2 = require("node:crypto");
var import_node_fs4 = require("node:fs");
var import_node_path4 = require("node:path");

// agent/src/notice-host.ts
var NOTICE_HOST_CSHARP = String.raw`
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace PharmaBoostAvis
{
  internal static class Native
  {
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] public static extern bool DestroyIcon(IntPtr handle);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongW")] public static extern int GetWindowLong(IntPtr hWnd, int index);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongW")] public static extern int SetWindowLong(IntPtr hWnd, int index, int value);
    public static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);
    public const uint SWP_NOSIZE = 0x1;
    public const uint SWP_NOMOVE = 0x2;
    public const uint SWP_NOACTIVATE = 0x10;
    public const uint SWP_SHOWWINDOW = 0x40;
    public const int GWL_EXSTYLE = -20;
    public const int WS_EX_NOACTIVATE = 0x08000000;
  }

  /// <summary>Un conseil de la vente : le produit, le médicament concerné, les pastilles, la réponse du pharmacien.</summary>
  public class Item
  {
    public string Id = "";
    public string Drug = "";
    public string Challenge = "";
    public string ShortDate = "";
    /// <summary>NONE (pas de réponse), SOLD (Vendu) ou NOT_SOLD (Non vendu).</summary>
    public string Outcome = "NONE";
    public string Name = "";
    public string Price = "";
    public string Reason = "";
    public string Availability = "UNKNOWN";
    public string Image = "";
  }

  /// <summary>Ce que la fenêtre affiche pour UNE vente, du premier bip à « Vente terminée ».</summary>
  public class Entry
  {
    public string Id = "";
    public string Reference = "";
    public string Label = "Détecté";
    public string Subject = "";
    public string Url = "";
    public string Signature = "";
    public bool Quiet;
    public bool EmailSaved;
    public string EmailError = "";
    public List<string> Alerts = new List<string>();
    public List<string> Notes = new List<string>();
    public List<Item> Items = new List<Item>();
    public List<string> Shown = new List<string>();
    public DateTime Since = DateTime.Now;
  }

  /// <summary>Le message de fin de vente : ce qui a été enregistré, et si un bilan est parti.</summary>
  public class DoneInfo
  {
    public string Id = "";
    public string Title = "";
    public List<string> Lines = new List<string>();
    public string Badge = "";
    public bool Warning;
  }

  internal static class Look
  {
    public static readonly Color Ink = Color.FromArgb(16, 24, 40);
    public static readonly Color Soft = Color.FromArgb(71, 84, 103);
    public static readonly Color Faint = Color.FromArgb(102, 112, 133);
    public static readonly Color Line = Color.FromArgb(234, 236, 240);
    public static readonly Color Green = Color.FromArgb(18, 128, 92);
    public static readonly Color GreenDark = Color.FromArgb(14, 107, 77);
    public static readonly Color GreenBorder = Color.FromArgb(52, 168, 124);
    public static readonly Color GreenSoft = Color.FromArgb(232, 246, 240);
    public static readonly Color Amber = Color.FromArgb(181, 71, 8);
    public static readonly Color AmberSoft = Color.FromArgb(255, 247, 232);
    public static readonly Color ChallengeBack = Color.FromArgb(255, 237, 213);
    public static readonly Color ChallengeFore = Color.FromArgb(194, 65, 12);
    public static readonly Color DateBack = Color.FromArgb(254, 226, 226);
    public static readonly Color DateFore = Color.FromArgb(185, 28, 28);

    public static GraphicsPath Round(Rectangle r, int radius)
    {
      int d = radius * 2;
      GraphicsPath path = new GraphicsPath();
      path.AddArc(r.X, r.Y, d, d, 180, 90);
      path.AddArc(r.Right - d, r.Y, d, d, 270, 90);
      path.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
      path.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
      path.CloseFigure();
      return path;
    }

    public static void Rounded(Control control, int radius)
    {
      using (GraphicsPath path = Round(new Rectangle(0, 0, control.Width, control.Height), radius))
      {
        control.Region = new Region(path);
      }
    }

    public static void Availability(string code, out string text, out Color back, out Color fore)
    {
      if (code == "IN_STOCK") { text = "En stock"; back = Color.FromArgb(220, 250, 230); fore = Color.FromArgb(6, 118, 71); }
      else if (code == "LOW_STOCK") { text = "Stock faible"; back = Color.FromArgb(254, 240, 199); fore = Color.FromArgb(181, 71, 8); }
      else if (code == "OUT_OF_STOCK") { text = "Rupture"; back = Color.FromArgb(254, 228, 226); fore = Color.FromArgb(180, 35, 24); }
      else { text = "Stock à vérifier"; back = Color.FromArgb(242, 244, 247); fore = Color.FromArgb(71, 84, 103); }
    }

    /// <summary>Le logo : un carré vert arrondi, une croix blanche.</summary>
    public static Bitmap Logo(int size)
    {
      Bitmap bmp = new Bitmap(size, size);
      using (Graphics g = Graphics.FromImage(bmp))
      {
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.Clear(Color.Transparent);
        using (GraphicsPath path = Round(new Rectangle(0, 0, size - 1, size - 1), size / 4))
        using (SolidBrush fill = new SolidBrush(GreenSoft))
        using (Pen edge = new Pen(Color.FromArgb(190, 232, 214), 1f))
        {
          g.FillPath(fill, path);
          g.DrawPath(edge, path);
        }
        int arm = Math.Max(3, size / 9);
        int span = size * 5 / 12;
        int mid = size / 2;
        using (SolidBrush cross = new SolidBrush(Green))
        {
          g.FillRectangle(cross, mid - arm, mid - span / 2, arm * 2, span);
          g.FillRectangle(cross, mid - span / 2, mid - arm, span, arm * 2);
        }
      }
      return bmp;
    }

    /// <summary>Quand un produit n'a pas de photo : un flacon gris, plutôt qu'un trou.</summary>
    public static Bitmap Bottle(int size)
    {
      Bitmap bmp = new Bitmap(size, size);
      using (Graphics g = Graphics.FromImage(bmp))
      {
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.Clear(Color.FromArgb(242, 244, 247));
        using (SolidBrush body = new SolidBrush(Color.FromArgb(208, 213, 221)))
        {
          int w = size * 40 / 100;
          int h = size * 52 / 100;
          g.FillRectangle(body, (size - w / 2) / 2, size * 14 / 100, w / 2, size * 14 / 100);
          using (GraphicsPath path = Round(new Rectangle((size - w) / 2, size * 28 / 100, w, h), Math.Max(3, size / 14)))
          {
            g.FillPath(body, path);
          }
        }
      }
      return bmp;
    }

    /// <summary>Le rond de fin de vente : une coche blanche sur fond vert (ou un point d'exclamation si quelque chose a échoué).</summary>
    public static Bitmap CheckBadge(int size, bool warning)
    {
      Bitmap bmp = new Bitmap(size, size);
      using (Graphics g = Graphics.FromImage(bmp))
      {
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.Clear(Color.Transparent);
        using (SolidBrush fill = new SolidBrush(warning ? Color.FromArgb(217, 119, 6) : Green)) { g.FillEllipse(fill, 1, 1, size - 3, size - 3); }
        using (Pen pen = new Pen(Color.White, Math.Max(3f, size / 11f)))
        {
          pen.StartCap = LineCap.Round;
          pen.EndCap = LineCap.Round;
          pen.LineJoin = LineJoin.Round;
          if (warning)
          {
            g.DrawLine(pen, size / 2, size * 28 / 100, size / 2, size * 58 / 100);
            g.DrawLine(pen, size / 2, size * 72 / 100, size / 2, size * 73 / 100);
          }
          else
          {
            g.DrawLines(pen, new Point[] { new Point(size * 28 / 100, size * 53 / 100), new Point(size * 44 / 100, size * 68 / 100), new Point(size * 72 / 100, size * 34 / 100) });
          }
        }
      }
      return bmp;
    }

    /// <summary>L'icône près de l'horloge : le logo et, en pastille rouge, le nombre de conseils en attente.</summary>
    public static Bitmap CounterIcon(int count)
    {
      Bitmap bmp = new Bitmap(32, 32);
      using (Graphics g = Graphics.FromImage(bmp))
      {
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
        g.Clear(Color.Transparent);
        using (GraphicsPath path = Round(new Rectangle(1, 3, 26, 26), 7))
        using (SolidBrush fill = new SolidBrush(Green))
        {
          g.FillPath(fill, path);
        }
        using (SolidBrush white = new SolidBrush(Color.White))
        {
          g.FillRectangle(white, 12, 8, 4, 16);
          g.FillRectangle(white, 6, 14, 16, 4);
        }
        if (count <= 0) return bmp;
        string label = count > 9 ? "9+" : count.ToString();
        using (SolidBrush red = new SolidBrush(Color.FromArgb(217, 45, 32)))
        using (Pen ring = new Pen(Color.White, 2f))
        using (Font font = new Font("Segoe UI", count > 9 ? 9f : 11f, FontStyle.Bold, GraphicsUnit.Pixel))
        using (SolidBrush ink = new SolidBrush(Color.White))
        {
          g.FillEllipse(red, 13, 0, 19, 19);
          g.DrawEllipse(ring, 13, 0, 19, 19);
          StringFormat center = new StringFormat();
          center.Alignment = StringAlignment.Center;
          center.LineAlignment = StringAlignment.Center;
          g.DrawString(label, font, ink, new RectangleF(13, 0, 19, 19), center);
        }
      }
      return bmp;
    }
  }

  /// <summary>Un bouton arrondi qui ne prend jamais le focus.</summary>
  public class PillButton : Control
  {
    private readonly bool filled;
    private readonly Color back;
    private readonly Color backHover;
    private readonly Color border;
    private bool hovered;
    /// <summary>Un bouton momentanément inutilisable : grisé, et sans effet (le clic est ignoré par celui qui l'écoute).</summary>
    public bool Muted;

    public PillButton(string text, bool filled, Color back, Color backHover, Color fore, Color border, Font font)
    {
      this.filled = filled;
      this.back = back;
      this.backHover = backHover;
      this.border = border;
      Text = text;
      ForeColor = fore;
      Font = font;
      Cursor = Cursors.Hand;
      SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
      SetStyle(ControlStyles.Selectable, false);
      TabStop = false;
    }

    protected override void OnMouseEnter(EventArgs e) { hovered = true; Invalidate(); base.OnMouseEnter(e); }
    protected override void OnMouseLeave(EventArgs e) { hovered = false; Invalidate(); base.OnMouseLeave(e); }

    protected override void OnPaint(PaintEventArgs e)
    {
      Graphics g = e.Graphics;
      g.SmoothingMode = SmoothingMode.AntiAlias;
      int radius = Math.Max(6, Height / 4);
      using (GraphicsPath path = Look.Round(new Rectangle(0, 0, Width - 1, Height - 1), radius))
      {
        using (SolidBrush fill = new SolidBrush(Muted ? Color.FromArgb(228, 231, 236) : (hovered ? backHover : back))) { g.FillPath(fill, path); }
        if (!filled && !Muted)
        {
          using (Pen pen = new Pen(border, 1.5f)) { g.DrawPath(pen, path); }
        }
      }
      TextRenderer.DrawText(g, Text, Font, new Rectangle(0, 0, Width, Height), Muted ? Color.FromArgb(120, 130, 146) : ForeColor, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis | TextFormatFlags.NoPadding);
    }
  }

  /// <summary>Une carte arrondie, fond blanc, filet clair : un conseil.</summary>
  public class Card : Panel
  {
    public Card()
    {
      DoubleBuffered = true;
      BackColor = Color.White;
    }

    protected override void OnPaint(PaintEventArgs e)
    {
      base.OnPaint(e);
      e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
      using (GraphicsPath path = Look.Round(new Rectangle(0, 0, Width - 1, Height - 1), 10))
      using (Pen pen = new Pen(Look.Line, 1.5f))
      {
        e.Graphics.DrawPath(pen, path);
      }
    }
  }

  /// <summary>
  /// La fenêtre de la vente. Elle ne prend ni le clavier ni le focus, sauf UN geste volontaire du pharmacien :
  /// cliquer dans le champ « e-mail du patient » (BeginTyping, EndTyping). Tout le reste se fait à la souris.
  /// </summary>
  public class SaleForm : Form
  {
    public event Action<string> Word;
    public event Action<Point> Moved;

    private readonly float scale;
    private readonly System.Windows.Forms.Timer typingTimer = new System.Windows.Forms.Timer();
    private Entry entry;
    private Entry deferred;
    private DoneInfo done;
    private bool dragging;
    private Point dragStart;
    private Point dragOrigin;
    private bool editing;
    private IntPtr previousForeground = IntPtr.Zero;
    private bool emailOpen;
    private string emailText = "";
    private bool emailConsent;
    private bool finishing;
    private TextBox emailBox;
    private PillButton saveButton;
    private Label emailMessage;
    public bool Reduced;
    /// <summary>Rien à conseiller : un mot de quelques secondes, sans réponse à donner ni bouton.</summary>
    public bool Quiet;
    public string Position = "milieu-droite";
    public string PositionFile = "";

    public SaleForm()
    {
      using (Graphics g = Graphics.FromHwnd(IntPtr.Zero)) { scale = g.DpiX / 96f; }
      FormBorderStyle = FormBorderStyle.None;
      ShowInTaskbar = false;
      TopMost = true;
      StartPosition = FormStartPosition.Manual;
      BackColor = Color.White;
      DoubleBuffered = true;
      typingTimer.Tick += delegate { EndTyping(true); };
    }

    protected override bool ShowWithoutActivation { get { return true; } }

    protected override CreateParams CreateParams
    {
      get
      {
        CreateParams p = base.CreateParams;
        // WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW : jamais dans la barre des tâches ni dans Alt+Tab, jamais activée.
        p.ExStyle |= 0x08000000 | 0x00000080;
        return p;
      }
    }

    protected override void WndProc(ref Message m)
    {
      // WM_MOUSEACTIVATE : même un clic sur un bouton de la fenêtre n'active pas la fenêtre (MA_NOACTIVATE).
      // Seule la saisie de l'e-mail, voulue par un clic dans son champ, a le droit d'activer.
      if (m.Msg == 0x0021 && !editing) { m.Result = (IntPtr)3; return; }
      base.WndProc(ref m);
    }

    protected override void OnDeactivate(EventArgs e)
    {
      base.OnDeactivate(e);
      // Le pharmacien a cliqué ailleurs (le logiciel de gestion) : la saisie s'arrête, la fenêtre redevient muette.
      if (editing) EndTyping(false);
    }

    private int S(int value) { return (int)Math.Round(value * scale); }
    private Font F(float points, FontStyle style) { return new Font("Segoe UI", points, style, GraphicsUnit.Point); }

    private void Say(string text)
    {
      if (Word != null) Word(text);
    }

    private static string Shorten(string text, int max)
    {
      if (text == null) return "";
      return text.Length > max ? text.Substring(0, max - 1).TrimEnd() + "…" : text;
    }

    private Label Words(Control parent, string text, Font font, Color color, int x, int y, int width)
    {
      Size size = TextRenderer.MeasureText(text, font, new Size(Math.Max(10, width - S(4)), 10000), TextFormatFlags.WordBreak);
      Label label = new Label();
      label.AutoSize = false;
      label.UseMnemonic = false;
      label.UseCompatibleTextRendering = false;
      label.Text = text;
      label.Font = font;
      label.ForeColor = color;
      label.BackColor = Color.Transparent;
      label.Location = new Point(x, y);
      label.Size = new Size(width, size.Height + S(3));
      parent.Controls.Add(label);
      return label;
    }

    /// <summary>Un lien cliquable (texte souligné, main au survol), à droite ou à gauche.</summary>
    private Label Link(Control parent, string text, int x, int y, bool alignRight, Action click)
    {
      Font font = new Font("Segoe UI", 9.5f, FontStyle.Underline | FontStyle.Bold, GraphicsUnit.Point);
      Size size = TextRenderer.MeasureText(text, font);
      Label label = new Label();
      label.AutoSize = false;
      label.UseMnemonic = false;
      label.UseCompatibleTextRendering = false;
      label.Text = text;
      label.Font = font;
      label.ForeColor = Look.Green;
      label.BackColor = Color.Transparent;
      label.Cursor = Cursors.Hand;
      label.Size = new Size(size.Width + S(4), size.Height + S(3));
      label.Location = new Point(alignRight ? x - label.Width : x, y);
      label.Click += delegate { click(); };
      parent.Controls.Add(label);
      return label;
    }

    /// <summary>Une pastille posée à la suite des autres (à partir de left), à la ligne quand la place manque.</summary>
    private void AddPill(Control parent, int left, string text, Color back, Color fore, bool bold, int maxWidth, ref int x, ref int y)
    {
      Font font = F(9f, bold ? FontStyle.Bold : FontStyle.Regular);
      Size size = TextRenderer.MeasureText(text, font);
      bool plain = back == Color.Transparent;
      int width = size.Width + (plain ? S(4) : S(18));
      if (x > 0 && x + width > maxWidth) { x = 0; y += S(24); }
      Label pill = new Label();
      pill.AutoSize = false;
      pill.UseMnemonic = false;
      pill.UseCompatibleTextRendering = false;
      pill.Text = text;
      pill.Font = font;
      pill.ForeColor = fore;
      pill.BackColor = back;
      pill.TextAlign = ContentAlignment.MiddleCenter;
      pill.Size = new Size(width, S(20));
      pill.Location = new Point(left + x, y);
      parent.Controls.Add(pill);
      if (!plain) Look.Rounded(pill, S(10));
      x += width + S(6);
    }

    private static void DisposeTree(Control control)
    {
      List<Control> children = new List<Control>();
      foreach (Control child in control.Controls) children.Add(child);
      foreach (Control child in children)
      {
        control.Controls.Remove(child);
        PictureBox picture = child as PictureBox;
        if (picture != null && picture.Image != null) { picture.Image.Dispose(); picture.Image = null; }
        DisposeTree(child);
        child.Dispose();
      }
    }

    // ------------------------------------------------------------------------------------------------------------
    // Les états de la fenêtre.
    // ------------------------------------------------------------------------------------------------------------

    /// <summary>Dessine (ou redessine, sur place) la vente. Pendant une saisie d'e-mail, la mise à jour attend la fin de la saisie.</summary>
    public void Render(Entry e)
    {
      if (editing) { deferred = e; return; }
      entry = e;
      done = null;
      finishing = false;
      Rebuild();
    }

    public void RenderDone(DoneInfo info)
    {
      if (editing) EndTyping(false);
      deferred = null;
      done = info;
      Rebuild();
    }

    public void SetReduced(bool value)
    {
      if (Reduced == value) return;
      Reduced = value;
      if (editing) EndTyping(false);
      Rebuild();
    }

    private void Rebuild()
    {
      SuspendLayout();
      DisposeTree(this);
      emailBox = null;
      saveButton = null;
      emailMessage = null;
      if (done != null) BuildDone();
      else if (entry != null && Quiet) BuildQuiet();
      else if (entry != null && Reduced) BuildReduced();
      else if (entry != null) BuildOpen();
      Look.Rounded(this, S(18));
      WireDrag(this);
      ResumeLayout(true);
      Invalidate();
      if (Visible) Clamp();
    }

    /// <summary>mode 0 : fenêtre ouverte (bouton « réduire »), 1 : réduite (bouton « agrandir »), 2 : message de fin, sans bouton.</summary>
    private int BuildHeader(int width, string subtitle, int mode)
    {
      int pad = S(14);
      PictureBox logo = new PictureBox();
      logo.Image = Look.Logo(S(36));
      logo.SizeMode = PictureBoxSizeMode.Normal;
      logo.Location = new Point(pad, S(10));
      logo.Size = new Size(S(36), S(36));
      logo.BackColor = Color.Transparent;
      Controls.Add(logo);
      int textLeft = pad + S(36) + S(10);
      Words(this, "PharmaBoost", F(12.5f, FontStyle.Bold), Look.Ink, textLeft, S(7), S(220));
      Words(this, subtitle, F(9.5f, FontStyle.Regular), Look.Faint, textLeft, S(27), width - textLeft - S(60));
      if (mode == 2) return S(56);
      PillButton toggle = new PillButton(mode == 1 ? "+" : "–", false, Color.White, Color.FromArgb(242, 244, 247), Look.Ink, Color.FromArgb(208, 213, 221), F(12f, FontStyle.Bold));
      toggle.Location = new Point(width - pad - S(30), S(13));
      toggle.Size = new Size(S(30), S(30));
      toggle.Click += delegate { SetReduced(!Reduced); };
      Controls.Add(toggle);
      return S(56);
    }

    private string SubtitleOf(Entry e)
    {
      if (e.Items.Count == 0) return e.Alerts.Count > 0 ? "À lire avant de conseiller" : "Aucun conseil à proposer";
      int open = 0;
      foreach (Item item in e.Items) { if (item.Outcome == "NONE") open++; }
      string count = e.Items.Count > 1 ? e.Items.Count + " conseils" : "1 conseil";
      return "Vente en cours · " + count + (open == 0 ? " · tous traités" : "");
    }

    private void BuildQuiet()
    {
      int width = S(380);
      int pad = S(14);
      int hh = BuildHeader(width, SubtitleOf(entry), 2);
      int y = hh;
      Words(this, entry.Label, F(9.5f, FontStyle.Regular), Look.Faint, pad, y, width - 2 * pad);
      y += S(18);
      Label subject = Words(this, entry.Subject, F(12f, FontStyle.Bold), Look.Ink, pad, y, width - 2 * pad);
      y += subject.Height + S(4);
      foreach (string note in entry.Notes)
      {
        Label line = Words(this, note, F(10.5f, FontStyle.Regular), Look.Soft, pad, y, width - 2 * pad);
        y += line.Height + S(2);
      }
      ClientSize = new Size(width, y + S(12));
    }

    private void BuildReduced()
    {
      int width = S(330);
      int hh = BuildHeader(width, SubtitleOf(entry), 1);
      ClientSize = new Size(width, hh);
    }

    private void BuildOpen()
    {
      int width = S(420);
      int pad = S(14);
      string subtitle = SubtitleOf(entry);
      int hh = BuildHeader(width, subtitle, 0);

      // Le pied : « Vente terminée », toujours visible.
      string hint = "Enregistre les résultats ; le bilan part si le patient a donné son accord.";
      Font hintFont = F(9f, FontStyle.Regular);
      Size hintSize = TextRenderer.MeasureText(hint, hintFont, new Size(width - 2 * pad - S(4), 10000), TextFormatFlags.WordBreak);
      int footerH = S(12) + S(44) + S(6) + hintSize.Height + S(10);
      int maxMiddle = (int)(Screen.PrimaryScreen.WorkingArea.Height * 0.9) - hh - footerH;
      if (maxMiddle < S(160)) maxMiddle = S(160);

      Panel scroll = new Panel();
      scroll.AutoScroll = true;
      scroll.BackColor = Color.White;
      scroll.Location = new Point(0, hh);
      int contentWidth = width - 2 * pad;
      scroll.Size = new Size(width, S(100));
      Controls.Add(scroll);
      int height = BuildMiddle(scroll, pad, contentWidth);
      if (height > maxMiddle)
      {
        DisposeTree(scroll);
        contentWidth = width - 2 * pad - SystemInformation.VerticalScrollBarWidth;
        height = BuildMiddle(scroll, pad, contentWidth);
      }
      scroll.Size = new Size(width, Math.Min(height, maxMiddle));
      scroll.AutoScrollMinSize = new Size(0, height);

      int fy = hh + scroll.Height;
      Panel line = new Panel();
      line.BackColor = Look.Line;
      line.Location = new Point(pad, fy);
      line.Size = new Size(width - 2 * pad, 1);
      Controls.Add(line);
      PillButton finish = new PillButton(finishing ? "Enregistrement…" : "Vente terminée", true, Look.Green, Look.GreenDark, Color.White, Look.Green, F(12f, FontStyle.Bold));
      finish.Location = new Point(pad, fy + S(12));
      finish.Size = new Size(width - 2 * pad, S(44));
      finish.Muted = finishing;
      finish.Click += delegate
      {
        if (finishing || entry == null) return;
        finishing = true;
        Say("TERMINER " + entry.Id);
        Rebuild();
      };
      Controls.Add(finish);
      Words(this, hint, hintFont, Look.Faint, pad, fy + S(12) + S(44) + S(6), width - 2 * pad);
      ClientSize = new Size(width, fy + footerH);
    }

    private int BuildMiddle(Panel scroll, int x, int w)
    {
      int y = S(2);
      Words(scroll, entry.Label, F(9.5f, FontStyle.Regular), Look.Faint, x, y, w);
      y += S(18);
      Label subject = Words(scroll, entry.Subject, F(12f, FontStyle.Bold), Look.Ink, x, y, w);
      y += subject.Height + S(8);

      if (entry.Alerts.Count > 0)
      {
        Panel box = new Panel();
        box.BackColor = Look.AmberSoft;
        box.Location = new Point(x, y);
        int boxY = S(8);
        foreach (string alert in entry.Alerts)
        {
          Label line = Words(box, "⚠ " + alert, F(10f, FontStyle.Bold), Look.Amber, S(12), boxY, w - S(24));
          boxY += line.Height + S(4);
        }
        box.Size = new Size(w, boxY + S(4));
        scroll.Controls.Add(box);
        Look.Rounded(box, S(10));
        y += box.Height + S(8);
      }

      if (entry.Items.Count > 0)
      {
        foreach (Item item in entry.Items)
        {
          int cardHeight = BuildCard(scroll, item, x, y, w);
          y += cardHeight + S(8);
        }
      }
      else
      {
        foreach (string note in entry.Notes)
        {
          Label line = Words(scroll, note, F(10.5f, FontStyle.Regular), Look.Soft, x, y, w);
          y += line.Height + S(2);
        }
        y += S(6);
      }

      y += BuildEmail(scroll, x, y, w) + S(10);
      return y;
    }

    private int BuildCard(Panel scroll, Item item, int x, int y, int w)
    {
      Card card = new Card();
      card.Location = new Point(x, y);
      int cp = S(10);
      int photo = S(52);
      PictureBox picture = new PictureBox();
      picture.Location = new Point(cp, cp);
      picture.Size = new Size(photo, photo);
      picture.SizeMode = PictureBoxSizeMode.Zoom;
      picture.BackColor = Color.FromArgb(242, 244, 247);
      picture.Image = LoadPhoto(item.Image, photo);
      card.Controls.Add(picture);
      Look.Rounded(picture, S(10));

      int colX = cp + photo + S(10);
      int colW = w - colX - cp;
      int cy = cp;
      Label name = Words(card, item.Name, F(11f, FontStyle.Bold), Look.Ink, colX, cy, colW);
      cy += name.Height;
      if (item.Drug.Length > 0)
      {
        Label drug = Words(card, "Pour : " + item.Drug, F(9f, FontStyle.Regular), Look.Faint, colX, cy, colW);
        cy += drug.Height;
      }
      if (item.Reason.Length > 0)
      {
        Label reason = Words(card, Shorten(item.Reason, 120), F(9.5f, FontStyle.Regular), Look.Soft, colX, cy, colW);
        cy += reason.Height;
      }
      // Les pastilles : prix, stock, challenge (orange), date courte (rouge). Jamais inventées : le serveur ne les envoie que si elles sont réelles.
      int px = 0;
      int py = cy + S(3);
      if (item.Price.Length > 0) AddPill(card, colX, item.Price, Color.Transparent, Look.Green, true, colW, ref px, ref py);
      string availabilityText; Color availabilityBack; Color availabilityFore;
      Look.Availability(item.Availability, out availabilityText, out availabilityBack, out availabilityFore);
      AddPill(card, colX, availabilityText, availabilityBack, availabilityFore, true, colW, ref px, ref py);
      if (item.Challenge.Length > 0) AddPill(card, colX, "Challenge", Look.ChallengeBack, Look.ChallengeFore, true, colW, ref px, ref py);
      if (item.ShortDate.Length > 0) AddPill(card, colX, "Date courte " + item.ShortDate, Look.DateBack, Look.DateFore, true, colW, ref px, ref py);
      int ya = Math.Max(cp + photo, py + S(20)) + S(8);

      int buttonH = S(34);
      if (item.Outcome == "NONE")
      {
        PillButton sold = new PillButton("Vendu", true, Look.Green, Look.GreenDark, Color.White, Look.Green, F(10.5f, FontStyle.Bold));
        sold.Location = new Point(cp, ya);
        sold.Size = new Size(S(98), buttonH);
        sold.Click += delegate { Choose(item, "SOLD"); };
        card.Controls.Add(sold);
        PillButton notSold = new PillButton("Non vendu", false, Color.White, Color.FromArgb(242, 244, 247), Look.Ink, Color.FromArgb(208, 213, 221), F(10.5f, FontStyle.Bold));
        notSold.Location = new Point(cp + sold.Width + S(8), ya);
        notSold.Size = new Size(S(106), buttonH);
        notSold.Click += delegate { Choose(item, "NOT_SOLD"); };
        card.Controls.Add(notSold);
      }
      else
      {
        bool isSold = item.Outcome == "SOLD";
        int cx = 0;
        int cyy = ya + S(6);
        AddPill(card, cp, isSold ? "✓ Vendu" : "Non vendu", isSold ? Color.FromArgb(220, 250, 230) : Color.FromArgb(242, 244, 247), isSold ? Color.FromArgb(6, 118, 71) : Look.Soft, true, w, ref cx, ref cyy);
        Link(card, "Modifier", cp + cx, ya + S(7), false, delegate { Choose(item, "NONE"); });
      }
      Link(card, "Voir le détail", w - cp, ya + S(7), true, delegate { Say("VOIR " + entry.Id); });

      card.Size = new Size(w, ya + buttonH + cp);
      scroll.Controls.Add(card);
      Look.Rounded(card, S(10));
      return card.Height;
    }

    private void Choose(Item item, string outcome)
    {
      if (entry == null || item.Id.Length == 0) return;
      item.Outcome = outcome;
      Say((outcome == "SOLD" ? "VENDU " : outcome == "NOT_SOLD" ? "NONVENDU " : "ANNULER ") + entry.Id + " " + item.Id);
      Rebuild();
    }

    // ------------------------------------------------------------------------------------------------------------
    // L'e-mail du patient : facultatif, avec son accord, saisi à la main.
    // ------------------------------------------------------------------------------------------------------------

    private int BuildEmail(Panel scroll, int x, int y, int w)
    {
      if (entry.EmailSaved)
      {
        Label saved = Words(scroll, "✓ E-mail enregistré · le bilan partira à la fin de la vente", F(9.5f, FontStyle.Bold), Look.GreenDark, x, y, w - S(70));
        Link(scroll, "Retirer", x + w, y, true, delegate { Say("EMAIL_RETIRER " + entry.Id); entry.EmailSaved = false; Rebuild(); });
        return saved.Height;
      }
      if (!emailOpen && entry.EmailError.Length == 0)
      {
        Words(scroll, "✉  E-mail du patient (facultatif)", F(10f, FontStyle.Regular), Look.Soft, x, y + S(2), w - S(80));
        Link(scroll, "Ajouter", x + w, y + S(1), true, delegate { emailOpen = true; Rebuild(); });
        return S(26);
      }

      Panel box = new Panel();
      box.BackColor = Look.GreenSoft;
      box.Location = new Point(x, y);
      int bp = S(12);
      int bw = w - 2 * bp;
      int by = bp;
      Label title = Words(box, "E-mail du patient", F(10.5f, FontStyle.Bold), Look.Ink, bp, by, bw);
      by += title.Height + S(2);

      emailBox = new TextBox();
      emailBox.Font = F(11f, FontStyle.Regular);
      emailBox.BorderStyle = BorderStyle.FixedSingle;
      emailBox.Location = new Point(bp, by);
      emailBox.Width = bw;
      emailBox.Text = emailText;
      emailBox.MaxLength = 160;
      emailBox.MouseDown += delegate { BeginTyping(); };
      emailBox.TextChanged += delegate
      {
        string typed = emailBox.Text;
        // Un code-barres tombé dans le champ (douchette) n'est pas une adresse : on l'efface.
        if (typed.Length >= 8 && IsAllDigits(typed)) { emailBox.Text = ""; typed = ""; }
        emailText = typed;
        RefreshSave();
      };
      emailBox.KeyDown += delegate (object sender, KeyEventArgs k)
      {
        if (k.KeyCode == Keys.Enter) { k.SuppressKeyPress = true; SaveEmail(); }
        else if (k.KeyCode == Keys.Escape) { k.SuppressKeyPress = true; LaterEmail(); }
      };
      box.Controls.Add(emailBox);
      by += emailBox.Height + S(6);

      CheckBox consent = new CheckBox();
      consent.Text = "Le patient accepte de recevoir son bilan par e-mail";
      consent.Font = F(9.5f, FontStyle.Regular);
      consent.ForeColor = Look.Ink;
      consent.BackColor = Color.Transparent;
      consent.UseCompatibleTextRendering = false;
      consent.Checked = emailConsent;
      consent.AutoSize = false;
      consent.Location = new Point(bp, by);
      consent.Size = new Size(bw, S(22));
      consent.TabStop = false;
      consent.CheckedChanged += delegate { emailConsent = consent.Checked; RefreshSave(); };
      box.Controls.Add(consent);
      by += consent.Height + S(4);

      emailMessage = Words(box, entry.EmailError, F(9.5f, FontStyle.Bold), Look.Amber, bp, by, bw);
      by += Math.Max(emailMessage.Height, S(4));

      saveButton = new PillButton("Enregistrer l'e-mail", true, Look.Green, Look.GreenDark, Color.White, Look.Green, F(10.5f, FontStyle.Bold));
      saveButton.Location = new Point(bp, by);
      saveButton.Size = new Size(bw - S(96) - S(8), S(36));
      saveButton.Click += delegate { SaveEmail(); };
      box.Controls.Add(saveButton);
      PillButton later = new PillButton("Plus tard", false, Color.White, Color.FromArgb(242, 244, 247), Look.Ink, Color.FromArgb(208, 213, 221), F(10.5f, FontStyle.Bold));
      later.Location = new Point(bp + saveButton.Width + S(8), by);
      later.Size = new Size(S(96), S(36));
      later.Click += delegate { LaterEmail(); };
      box.Controls.Add(later);
      by += S(36) + bp;
      RefreshSave();

      box.Size = new Size(w, by);
      scroll.Controls.Add(box);
      Look.Rounded(box, S(10));
      return box.Height;
    }

    private static bool IsAllDigits(string text)
    {
      foreach (char c in text) { if (c < '0' || c > '9') return false; }
      return text.Length > 0;
    }

    private static bool LooksLikeEmail(string text)
    {
      if (text.Length < 6 || text.Length > 160 || text.Contains(" ")) return false;
      int at = text.IndexOf('@');
      if (at < 1 || at != text.LastIndexOf('@')) return false;
      string domain = text.Substring(at + 1);
      int dot = domain.LastIndexOf('.');
      return dot > 0 && dot < domain.Length - 2 && !domain.Contains("..");
    }

    private void RefreshSave()
    {
      if (saveButton == null) return;
      saveButton.Muted = !(emailConsent && LooksLikeEmail(emailText.Trim()));
      saveButton.Invalidate();
    }

    private void SaveEmail()
    {
      if (entry == null) return;
      string text = emailText.Trim();
      if (!emailConsent) { if (emailMessage != null) emailMessage.Text = "Le patient doit d'abord donner son accord."; return; }
      if (!LooksLikeEmail(text)) { if (emailMessage != null) emailMessage.Text = "Cette adresse ne semble pas valide."; return; }
      string id = entry.Id;
      emailText = "";
      emailConsent = false;
      emailOpen = false;
      EndTyping(true);
      if (entry != null && entry.Id == id) entry.EmailSaved = true;
      Say("EMAIL " + id + " " + Convert.ToBase64String(Encoding.UTF8.GetBytes(text)));
      Rebuild();
    }

    private void LaterEmail()
    {
      emailOpen = false;
      emailText = "";
      emailConsent = false;
      if (entry != null) entry.EmailError = "";
      EndTyping(true);
      Rebuild();
    }

    /// <summary>
    /// Le seul moment où la fenêtre prend le clavier : le pharmacien a cliqué dans le champ de l'e-mail. Elle retient la
    /// fenêtre qui était devant (le logiciel de gestion) pour la lui rendre aussitôt la saisie finie.
    /// </summary>
    private void BeginTyping()
    {
      if (editing || emailBox == null) return;
      editing = true;
      previousForeground = Native.GetForegroundWindow();
      if (previousForeground == Handle) previousForeground = IntPtr.Zero;
      int style = Native.GetWindowLong(Handle, Native.GWL_EXSTYLE);
      Native.SetWindowLong(Handle, Native.GWL_EXSTYLE, style & ~Native.WS_EX_NOACTIVATE);
      Native.SetForegroundWindow(Handle);
      ActiveControl = emailBox;
      typingTimer.Stop();
      typingTimer.Interval = 40000;
      typingTimer.Start();
    }

    private void EndTyping(bool giveBack)
    {
      if (!editing) return;
      editing = false;
      typingTimer.Stop();
      try
      {
        int style = Native.GetWindowLong(Handle, Native.GWL_EXSTYLE);
        Native.SetWindowLong(Handle, Native.GWL_EXSTYLE, style | Native.WS_EX_NOACTIVATE);
      }
      catch (Exception) { }
      ActiveControl = null;
      if (giveBack && previousForeground != IntPtr.Zero) Native.SetForegroundWindow(previousForeground);
      previousForeground = IntPtr.Zero;
      if (deferred != null)
      {
        Entry waiting = deferred;
        deferred = null;
        Render(waiting);
      }
    }

    // ------------------------------------------------------------------------------------------------------------
    // La fin de vente.
    // ------------------------------------------------------------------------------------------------------------

    private void BuildDone()
    {
      int width = S(380);
      int pad = S(14);
      int hh = BuildHeader(width, "Vente terminée", 2);
      int y = hh + S(4);
      PictureBox badge = new PictureBox();
      badge.Image = Look.CheckBadge(S(52), done.Warning);
      badge.SizeMode = PictureBoxSizeMode.Normal;
      badge.Location = new Point(pad, y);
      badge.Size = new Size(S(52), S(52));
      badge.BackColor = Color.Transparent;
      Controls.Add(badge);
      int textX = pad + S(52) + S(12);
      int textW = width - textX - pad;
      Label title = Words(this, done.Title, F(12.5f, FontStyle.Bold), Look.Ink, textX, y, textW);
      int ty = y + title.Height + S(2);
      foreach (string text in done.Lines)
      {
        Label line = Words(this, text, F(10f, FontStyle.Regular), Look.Soft, textX, ty, textW);
        ty += line.Height;
      }
      y = Math.Max(y + S(52), ty) + S(10);
      if (done.Badge.Length > 0)
      {
        int px = 0;
        int py = y;
        AddPill(this, pad, done.Badge, Color.FromArgb(220, 250, 230), Color.FromArgb(6, 118, 71), true, width - 2 * pad, ref px, ref py);
        y += S(28);
      }
      ClientSize = new Size(width, y + S(10));
    }

    // ------------------------------------------------------------------------------------------------------------
    // La photo, le déplacement, la place à l'écran.
    // ------------------------------------------------------------------------------------------------------------

    private Image LoadPhoto(string path, int size)
    {
      if (!string.IsNullOrEmpty(path) && File.Exists(path))
      {
        try
        {
          using (FileStream stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read))
          using (Image raw = Image.FromStream(stream))
          {
            return new Bitmap(raw);
          }
        }
        catch (Exception) { }
      }
      return Look.Bottle(size);
    }

    private void WireDrag(Control parent)
    {
      foreach (Control child in parent.Controls)
      {
        if (child is PillButton || child is TextBox || child is CheckBox) continue;
        child.MouseDown += OnDragDown;
        child.MouseMove += OnDragMove;
        child.MouseUp += OnDragUp;
        WireDrag(child);
      }
    }

    protected override void OnMouseDown(MouseEventArgs e) { OnDragDown(this, e); base.OnMouseDown(e); }
    protected override void OnMouseMove(MouseEventArgs e) { OnDragMove(this, e); base.OnMouseMove(e); }
    protected override void OnMouseUp(MouseEventArgs e) { OnDragUp(this, e); base.OnMouseUp(e); }

    private void OnDragDown(object sender, MouseEventArgs e)
    {
      if (e.Button != MouseButtons.Left) return;
      dragging = true;
      dragStart = Cursor.Position;
      dragOrigin = Location;
    }

    private void OnDragMove(object sender, MouseEventArgs e)
    {
      if (!dragging) return;
      Point now = Cursor.Position;
      Location = new Point(dragOrigin.X + now.X - dragStart.X, dragOrigin.Y + now.Y - dragStart.Y);
    }

    private void OnDragUp(object sender, MouseEventArgs e)
    {
      if (!dragging) return;
      dragging = false;
      if (Moved != null) Moved(Location);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
      base.OnPaint(e);
      e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
      using (GraphicsPath path = Look.Round(new Rectangle(1, 1, Width - 3, Height - 3), S(18)))
      using (Pen pen = new Pen(Look.GreenBorder, Math.Max(2f, scale * 2f)))
      {
        e.Graphics.DrawPath(pen, path);
      }
    }

    /// <summary>L'endroit : celui que le pharmacien a choisi en la déplaçant, sinon à droite à mi-hauteur.</summary>
    public void Place()
    {
      Rectangle area = Screen.PrimaryScreen.WorkingArea;
      Point wanted = new Point(area.Right - Width - S(16), area.Top + (area.Height - Height) / 2);
      if (Position == "bas-droite") wanted = new Point(area.Right - Width - S(16), area.Bottom - Height - S(16));
      else if (Position == "haut-droite") wanted = new Point(area.Right - Width - S(16), area.Top + S(16));
      try
      {
        if (!string.IsNullOrEmpty(PositionFile) && File.Exists(PositionFile))
        {
          string[] parts = File.ReadAllText(PositionFile).Trim().Split(',');
          if (parts.Length == 2)
          {
            Point saved = new Point(int.Parse(parts[0]), int.Parse(parts[1]));
            foreach (Screen screen in Screen.AllScreens)
            {
              if (screen.WorkingArea.Contains(new Point(saved.X + Width / 2, saved.Y + S(30)))) { wanted = saved; break; }
            }
          }
        }
      }
      catch (Exception) { }
      Location = wanted;
      Clamp();
    }

    /// <summary>La fenêtre change de hauteur avec la vente : elle ne déborde jamais de l'écran où elle se trouve.</summary>
    private void Clamp()
    {
      Rectangle area = Screen.FromControl(this).WorkingArea;
      int x = Math.Min(Math.Max(Left, area.Left), Math.Max(area.Left, area.Right - Width));
      int y = Math.Min(Math.Max(Top, area.Top), Math.Max(area.Top, area.Bottom - Height));
      if (x != Left || y != Top) Location = new Point(x, y);
    }

    public void Reveal()
    {
      if (!Visible) Show();
      Native.SetWindowPos(Handle, Native.HWND_TOPMOST, 0, 0, 0, 0, Native.SWP_NOMOVE | Native.SWP_NOSIZE | Native.SWP_NOACTIVATE | Native.SWP_SHOWWINDOW);
    }
  }

  /// <summary>Le chef d'orchestre : la vente en cours, la fenêtre, l'icône près de l'horloge, la ligne de commande.</summary>
  public class Host : ApplicationContext
  {
    private static readonly TimeSpan MaxAge = TimeSpan.FromHours(3);

    private readonly NotifyIcon counter = new NotifyIcon();
    private readonly ContextMenuStrip menu = new ContextMenuStrip();
    private readonly System.Windows.Forms.Timer quietTimer = new System.Windows.Forms.Timer();
    private readonly System.Windows.Forms.Timer doneTimer = new System.Windows.Forms.Timer();
    private readonly System.Windows.Forms.Timer ageTimer = new System.Windows.Forms.Timer();
    private readonly Control ui = new Control();
    private readonly JavaScriptSerializer json = new JavaScriptSerializer();
    private SaleForm form;
    /// <summary>La vente affichée. Tant qu'elle est « ouverte », la fenêtre reste : aucun délai, jusqu'à « Vente terminée ».</summary>
    private Entry current;
    private bool sessionOpen;
    private string doneId = "";
    private IntPtr iconHandle = IntPtr.Zero;
    private string position = "milieu-droite";
    private string positionFile = "";

    public Host()
    {
      ui.CreateControl();
      IntPtr unused = ui.Handle;
      counter.Visible = false;
      counter.ContextMenuStrip = menu;
      counter.MouseClick += delegate (object sender, MouseEventArgs e) { if (e.Button == MouseButtons.Left) Expand(); };
      menu.Opening += delegate { BuildMenu(); };
      quietTimer.Tick += delegate { quietTimer.Stop(); if (!sessionOpen) End(); };
      doneTimer.Tick += delegate { doneTimer.Stop(); string finished = doneId; End(); if (finished.Length > 0) Say("FERMEE " + finished); };
      ageTimer.Interval = 60000;
      ageTimer.Tick += delegate { Expire(); };
      ageTimer.Start();

      System.Threading.Thread reader = new System.Threading.Thread(ReadLoop);
      reader.IsBackground = true;
      reader.Start();
      Say("PRET");
    }

    private static void Say(string text)
    {
      try { Console.Out.WriteLine(text); Console.Out.Flush(); } catch (Exception) { }
    }

    private void ReadLoop()
    {
      try
      {
        StreamReader input = new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false));
        string line;
        while ((line = input.ReadLine()) != null)
        {
          string copy = line;
          if (copy.Length == 0) continue;
          ui.BeginInvoke(new MethodInvoker(delegate { Handle(copy); }));
        }
      }
      catch (Exception) { }
      // La liaison avec l'agent est fermée : plus personne à servir.
      try { ui.BeginInvoke(new MethodInvoker(delegate { Quit(); })); } catch (Exception) { }
    }

    private void Handle(string line)
    {
      try
      {
        Dictionary<string, object> command = json.DeserializeObject(line) as Dictionary<string, object>;
        if (command == null) return;
        string op = Str(command, "op");
        if (op == "show")
        {
          position = Str(command, "position");
          if (position.Length == 0) position = "milieu-droite";
          positionFile = Str(command, "positionFile");
          Dictionary<string, object> raw = command.ContainsKey("entry") ? command["entry"] as Dictionary<string, object> : null;
          if (raw != null) Show(Parse(raw));
        }
        else if (op == "done")
        {
          Dictionary<string, object> raw = command.ContainsKey("info") ? command["info"] as Dictionary<string, object> : null;
          if (raw != null) Finish(ParseDone(raw));
        }
        else if (op == "remove") Remove(Str(command, "id"));
        else if (op == "quit") Quit();
      }
      catch (Exception) { Say("ERREUR commande"); }
    }

    private static string Str(Dictionary<string, object> d, string key)
    {
      object value;
      return d.TryGetValue(key, out value) && value != null ? Convert.ToString(value) : "";
    }

    private static bool Flag(Dictionary<string, object> d, string key)
    {
      string text = Str(d, key);
      return text == "True" || text == "true";
    }

    private static List<object> Seq(Dictionary<string, object> d, string key)
    {
      List<object> list = new List<object>();
      object value;
      if (d.TryGetValue(key, out value) && value is System.Collections.IEnumerable && !(value is string))
      {
        foreach (object item in (System.Collections.IEnumerable)value) list.Add(item);
      }
      return list;
    }

    private static Entry Parse(Dictionary<string, object> d)
    {
      Entry e = new Entry();
      e.Id = Str(d, "id");
      e.Reference = Str(d, "reference");
      e.Label = Str(d, "label");
      if (e.Label.Length == 0) e.Label = "Détecté";
      e.Subject = Str(d, "subject");
      e.Url = Str(d, "url");
      e.Signature = Str(d, "signature");
      e.Quiet = Flag(d, "quiet");
      e.EmailSaved = Flag(d, "emailSaved");
      e.EmailError = Str(d, "emailError");
      foreach (object a in Seq(d, "alerts")) e.Alerts.Add(Convert.ToString(a));
      foreach (object n in Seq(d, "notes")) e.Notes.Add(Convert.ToString(n));
      foreach (object o in Seq(d, "items"))
      {
        Dictionary<string, object> raw = o as Dictionary<string, object>;
        if (raw == null) continue;
        Item item = new Item();
        item.Id = Str(raw, "id");
        item.Drug = Str(raw, "drug");
        item.Challenge = Str(raw, "challenge");
        item.ShortDate = Str(raw, "shortDate");
        item.Outcome = Str(raw, "outcome");
        if (item.Outcome != "SOLD" && item.Outcome != "NOT_SOLD") item.Outcome = "NONE";
        item.Name = Str(raw, "name");
        item.Price = Str(raw, "price");
        item.Reason = Str(raw, "reason");
        item.Availability = Str(raw, "availability");
        item.Image = Str(raw, "image");
        e.Items.Add(item);
      }
      return e;
    }

    private static DoneInfo ParseDone(Dictionary<string, object> d)
    {
      DoneInfo info = new DoneInfo();
      info.Id = Str(d, "id");
      info.Title = Str(d, "title");
      info.Badge = Str(d, "badge");
      info.Warning = Flag(d, "warning");
      foreach (object line in Seq(d, "lines")) info.Lines.Add(Convert.ToString(line));
      return info;
    }

    private static string KeyOf(Item item) { return "p:" + item.Name; }

    /// <summary>
    /// Une vente arrive ou se met à jour. Une vente n'a qu'UNE fenêtre, mise à jour sur place, qui reste jusqu'à
    /// « Vente terminée ». Seule une information NOUVELLE (un autre produit, une autre alerte) rouvre la fenêtre réduite.
    /// </summary>
    private void Show(Entry entry)
    {
      Entry existing = (current != null && current.Id == entry.Id) ? current : null;
      List<string> known = new List<string>();
      if (existing != null) known.AddRange(existing.Shown);
      List<string> fresh = new List<string>();
      foreach (Item item in entry.Items) { string key = KeyOf(item); if (!known.Contains(key)) fresh.Add(key); }
      foreach (string alert in entry.Alerts) { string key = "a:" + alert; if (!known.Contains(key)) fresh.Add(key); }
      entry.Shown.AddRange(known);
      entry.Shown.AddRange(fresh);
      if (existing != null) entry.Since = existing.Since;

      doneTimer.Stop();
      doneId = "";
      bool sameSale = existing != null;
      if (entry.Quiet && !(sameSale && sessionOpen))
      {
        // Rien à conseiller : un mot de huit secondes, sans session ni compteur.
        current = entry;
        sessionOpen = false;
        EnsureForm();
        form.Reduced = false;
        form.Quiet = true;
        Present(entry);
        quietTimer.Stop();
        quietTimer.Interval = 8000;
        quietTimer.Start();
        return;
      }
      quietTimer.Stop();
      current = entry;
      sessionOpen = true;
      EnsureForm();
      form.Quiet = false;
      if (!sameSale) form.Reduced = false;
      else if (fresh.Count > 0 && form.Reduced) form.Reduced = false;
      Present(entry);
    }

    private void EnsureForm()
    {
      if (form != null && !form.IsDisposed) return;
      form = new SaleForm();
      form.Word += delegate (string word) { OnFormWord(word); };
      form.Moved += delegate (Point p) { SavePosition(p); };
    }

    private void Present(Entry entry)
    {
      EnsureForm();
      form.Position = position;
      form.PositionFile = positionFile;
      bool firstShow = !form.Visible;
      form.Render(entry);
      if (firstShow) form.Place();
      form.Reveal();
      RefreshIcon();
    }

    /// <summary>Ce que la fenêtre dit : les réponses vont à l'agent ; « Voir le détail » ouvre la vente dans PharmaBoost.</summary>
    private void OnFormWord(string word)
    {
      if (word.StartsWith("VOIR "))
      {
        Entry shown = current;
        try { if (shown != null && !string.IsNullOrEmpty(shown.Url)) Process.Start(shown.Url); } catch (Exception) { }
      }
      Say(word);
    }

    private void SavePosition(Point p)
    {
      try { if (!string.IsNullOrEmpty(positionFile)) File.WriteAllText(positionFile, p.X + "," + p.Y); } catch (Exception) { }
    }

    /// <summary>La vente est terminée : le message reste quelques secondes, puis la fenêtre s'efface et attend la suivante.</summary>
    private void Finish(DoneInfo info)
    {
      if (current == null || current.Id != info.Id || form == null || form.IsDisposed) return;
      sessionOpen = false;
      quietTimer.Stop();
      doneId = info.Id;
      form.RenderDone(info);
      form.Place();
      form.Reveal();
      RefreshIcon();
      doneTimer.Stop();
      doneTimer.Interval = 7000;
      doneTimer.Start();
    }

    private void End()
    {
      quietTimer.Stop();
      doneTimer.Stop();
      sessionOpen = false;
      doneId = "";
      current = null;
      if (form != null && !form.IsDisposed) form.Hide();
      RefreshIcon();
    }

    private void Remove(string id)
    {
      if (current != null && current.Id == id) End();
    }

    private void Expand()
    {
      if (current == null || form == null || form.IsDisposed) return;
      form.SetReduced(false);
      form.Place();
      form.Reveal();
    }

    private void Expire()
    {
      if (current != null && DateTime.Now - current.Since > MaxAge) End();
    }

    private int Unanswered()
    {
      int count = 0;
      if (current == null) return 0;
      foreach (Item item in current.Items) { if (item.Outcome == "NONE") count++; }
      return count;
    }

    private void BuildMenu()
    {
      menu.Items.Clear();
      if (current == null || !sessionOpen)
      {
        ToolStripMenuItem none = new ToolStripMenuItem("PharmaBoost — aucune vente en cours");
        none.Enabled = false;
        menu.Items.Add(none);
        return;
      }
      int open = Unanswered();
      ToolStripMenuItem title = new ToolStripMenuItem("PharmaBoost — " + open + (open > 1 ? " conseils sans réponse" : " conseil sans réponse"));
      title.Enabled = false;
      menu.Items.Add(title);
      menu.Items.Add(new ToolStripSeparator());
      menu.Items.Add("Afficher la fenêtre", null, delegate { Expand(); });
      menu.Items.Add("Réduire la fenêtre", null, delegate { if (form != null && !form.IsDisposed) form.SetReduced(true); });
      menu.Items.Add("Vente terminée", null, delegate { if (current != null) Say("TERMINER " + current.Id); });
    }

    /// <summary>L'icône près de l'horloge n'existe que pendant une vente ouverte ; elle porte le nombre de conseils sans réponse.</summary>
    private void RefreshIcon()
    {
      if (current == null || !sessionOpen)
      {
        counter.Visible = false;
        return;
      }
      int open = Unanswered();
      IntPtr previous = iconHandle;
      using (Bitmap bmp = Look.CounterIcon(open))
      {
        iconHandle = bmp.GetHicon();
        counter.Icon = Icon.FromHandle(iconHandle);
      }
      string tip = "PharmaBoost — vente en cours · " + open + (open > 1 ? " conseils sans réponse" : " conseil sans réponse");
      counter.Text = tip.Length > 63 ? tip.Substring(0, 62) + "…" : tip;
      counter.Visible = true;
      if (previous != IntPtr.Zero) Native.DestroyIcon(previous);
    }

    private void Quit()
    {
      quietTimer.Stop();
      doneTimer.Stop();
      ageTimer.Stop();
      counter.Visible = false;
      counter.Dispose();
      if (form != null && !form.IsDisposed) form.Dispose();
      ExitThread();
    }
  }

  public static class Program
  {
    public static void Run()
    {
      try { Native.SetProcessDPIAware(); } catch (Exception) { }
      Application.EnableVisualStyles();
      try { Application.SetCompatibleTextRenderingDefault(false); } catch (Exception) { }
      Application.Run(new Host());
    }
  }
}
`;
var NOTICE_HOST_SCRIPT = `$ErrorActionPreference = "Stop"
$code = @'
${NOTICE_HOST_CSHARP}
'@
Add-Type -TypeDefinition $code -ReferencedAssemblies System.Windows.Forms,System.Drawing,System.Web.Extensions
[PharmaBoostAvis.Program]::Run()
`;

// agent/src/notice-center.ts
var DEFAULT_NOTICE_SECONDS = 30;
var POSITIONS = ["milieu-droite", "bas-droite", "haut-droite"];
function euros(cents) {
  if (cents === null || cents === void 0 || cents <= 0) return "";
  return `${(cents / 100).toFixed(2).replace(".", ",")} \u20AC`;
}
var AVAILABILITIES = /* @__PURE__ */ new Set(["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK", "UNKNOWN"]);
function referenceOf(title) {
  return title.replace(/^PharmaBoost\s*·\s*/, "").trim();
}
var oneLine = (text) => text.replace(/[\r\n\u2028\u2029]+/g, " ").trim();
function frenchDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}
function buildHostEntry(input) {
  const { body } = input;
  const images = input.images ?? /* @__PURE__ */ new Map();
  const structured = body.items ?? [];
  const items = structured.map((item) => ({
    id: item.id ?? "",
    drug: oneLine(item.drug ?? ""),
    challenge: oneLine(item.challenge ?? ""),
    shortDate: frenchDate(item.shortDateOn),
    outcome: item.outcome === "SOLD" || item.outcome === "NOT_SOLD" ? item.outcome : "NONE",
    name: oneLine(item.name),
    price: euros(item.priceCents),
    reason: oneLine(item.reason ?? ""),
    availability: AVAILABILITIES.has(item.availability) ? item.availability : "UNKNOWN",
    image: item.imageUrl && images.get(item.imageUrl) || ""
  }));
  const legacyOnly = body.items === void 0 && body.advice.length > 0;
  const alerts = [...body.alerts.map(oneLine), ...input.problem ? [oneLine(input.problem)] : []];
  const notes = items.length === 0 && !legacyOnly ? body.advice.map(oneLine) : [];
  const finalItems = legacyOnly ? body.advice.map((text) => ({ id: "", drug: "", challenge: "", shortDate: "", outcome: "NONE", name: oneLine(text), price: "", reason: "", availability: "UNKNOWN", image: "" })) : items;
  return {
    id: input.prescriptionId,
    reference: referenceOf(body.title),
    label: body.detectedLabel ?? "D\xE9tect\xE9",
    subject: oneLine(body.subject),
    url: `${input.serverUrl.replace(/\/$/, "")}/vente/${input.prescriptionId}`,
    signature: body.signature,
    quiet: finalItems.length === 0 && alerts.length === 0,
    emailSaved: body.followUp?.emailSaved === true,
    emailError: oneLine(input.emailError ?? ""),
    alerts,
    notes,
    items: finalItems
  };
}
function ordinalFr(rank) {
  return rank === 1 ? "1er" : `${rank}e`;
}
var plural = (count, one, many) => `${count} ${count > 1 ? many : one}`;
function buildDoneInfo(input) {
  const { result } = input;
  const lines = [];
  if (result.proposed === 0) lines.push("Aucun conseil \xE0 enregistrer.");
  else {
    lines.push([plural(result.sold, "vendu", "vendus"), `${result.notSold} non vendu${result.notSold > 1 ? "s" : ""}`, `${result.unanswered} sans r\xE9ponse`].join(" \xB7 "));
  }
  let warning = false;
  if (result.report === "SENT") lines.push("\u2713 Bilan envoy\xE9 au patient.");
  else if (result.report === "SIMULATED") lines.push("Bilan pr\xE9par\xE9 (l'envoi d'e-mails est en mode test).");
  else if (result.report === "FAILED") {
    lines.push("\u26A0 Le bilan n'a pas pu \xEAtre envoy\xE9 au patient.");
    warning = true;
  } else if (input.emailWasSaved) lines.push("Aucun bilan envoy\xE9 : aucun produit n'a \xE9t\xE9 vendu.");
  return {
    id: input.saleId,
    title: "Vente termin\xE9e \u2014 r\xE9sultats enregistr\xE9s",
    lines,
    badge: result.sold > 0 && result.soldToday && result.soldToday > 0 ? `${ordinalFr(result.soldToday)} conseil vendu aujourd'hui` : "",
    warning
  };
}
function legacyContentOf(entry, seconds) {
  const advice = entry.items.length > 0 ? entry.items.map((item) => [item.name, item.price, item.reason].filter(Boolean).join(" \xB7 ")) : entry.notes;
  return { title: `PharmaBoost \xB7 ${entry.reference}`, subject: entry.subject, alerts: entry.alerts, advice, url: entry.url, seconds };
}
function encodeCommand(command) {
  return `${JSON.stringify(command).replace(/[\u2028\u2029]/g, " ")}
`;
}
var IMAGE_HOSTS = /* @__PURE__ */ new Set(["images.openbeautyfacts.org", "images.openfoodfacts.org", "images.openproductsfacts.org", "static.openfoodfacts.org"]);
var IMAGE_MAX_BYTES = 6e5;
var IMAGE_CACHE_MAX_FILES = 60;
function imageSource(raw, serverUrl) {
  if (!raw) return null;
  let url;
  let own = "";
  try {
    own = new URL(serverUrl).hostname;
    url = new URL(raw, serverUrl.replace(/\/?$/, "/"));
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (!IMAGE_HOSTS.has(url.hostname) && url.hostname !== own) return null;
  if (/\.(svg|webp|avif|gif|ico)$/i.test(url.pathname)) return null;
  return url.toString();
}
function sniff(bytes) {
  if (bytes.length > 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "jpg";
  if (bytes.length > 8 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) return "png";
  return null;
}
var cacheKey = (source) => (0, import_node_crypto2.createHash)("sha1").update(source).digest("hex").slice(0, 20);
function cachedImage(dir, source) {
  for (const extension of ["jpg", "png"]) {
    const path = (0, import_node_path4.join)(dir, `${cacheKey(source)}.${extension}`);
    if ((0, import_node_fs4.existsSync)(path)) return path;
  }
  return null;
}
function pruneCache(dir) {
  try {
    const files = (0, import_node_fs4.readdirSync)(dir).map((name) => ({ name, at: (0, import_node_fs4.statSync)((0, import_node_path4.join)(dir, name)).mtimeMs })).sort((a, b) => b.at - a.at);
    for (const old of files.slice(IMAGE_CACHE_MAX_FILES)) (0, import_node_fs4.unlinkSync)((0, import_node_path4.join)(dir, old.name));
  } catch {
  }
}
async function fetchImage(source, serverUrl, dir, fetchImpl = fetch) {
  const hit = cachedImage(dir, source);
  if (hit) return hit;
  try {
    const response = await fetchImpl(source, { signal: AbortSignal.timeout(4e3), headers: { accept: "image/jpeg,image/png" } });
    if (!response.ok) return null;
    if (response.url && imageSource(response.url, serverUrl) === null) return null;
    const declared = Number(response.headers.get("content-length") ?? "0");
    if (declared > IMAGE_MAX_BYTES) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > IMAGE_MAX_BYTES) return null;
    const kind = sniff(bytes);
    if (!kind) return null;
    (0, import_node_fs4.mkdirSync)(dir, { recursive: true });
    const path = (0, import_node_path4.join)(dir, `${cacheKey(source)}.${kind}`);
    (0, import_node_fs4.writeFileSync)(path, bytes);
    pruneCache(dir);
    return path;
  } catch {
    return null;
  }
}
var NoticeCenter = class {
  constructor(options) {
    this.options = options;
  }
  options;
  host = null;
  ready = false;
  broken = false;
  forcedLegacy = false;
  startTimer = null;
  lastEntry = null;
  stderrText = "";
  /** Les ventes que la fenêtre garde ouvertes (jusqu'à « Vente terminée »), d'après ce qu'elle a répondu. */
  held = /* @__PURE__ */ new Map();
  get platform() {
    return this.options.platform ?? process.platform;
  }
  get seconds() {
    return this.options.seconds ?? DEFAULT_NOTICE_SECONDS;
  }
  /** Les réglages du poste (durée, endroit), relus à chaque avis : le fichier de configuration peut changer. */
  configure(preferences) {
    if (preferences.legacy !== void 0) this.forcedLegacy = preferences.legacy;
    if (preferences.seconds !== void 0) this.options.seconds = Math.max(5, Math.min(120, Math.round(preferences.seconds)));
    if (preferences.position !== void 0 && POSITIONS.includes(preferences.position)) this.options.position = preferences.position;
  }
  /**
   * Lance la fenêtre sans rien afficher. Sa préparation (PowerShell, compilation du code : quelques secondes) se fait
   * alors pendant que le serveur analyse la vente, et non après : le premier conseil de la journée n'attend plus.
   */
  warmUp() {
    if (this.platform !== "win32" || this.broken || this.forcedLegacy) return;
    this.ensureHost();
  }
  /** Les ventes que la fenêtre garde ouvertes. */
  ids() {
    return [...this.held.keys()];
  }
  /** Montre (ou met à jour) le conseil d'une vente. */
  show(entry) {
    this.lastEntry = entry;
    if (this.platform !== "win32") {
      this.options.log(`Avis (non affich\xE9 hors Windows) : ${entry.subject} \u2014 ${[...entry.alerts, ...entry.items.map((item) => item.name), ...entry.notes].join(" / ")}`);
      return;
    }
    if (this.broken || this.forcedLegacy) {
      this.options.legacyShow(legacyContentOf(entry, 15));
      return;
    }
    if (!this.ensureHost()) {
      this.options.legacyShow(legacyContentOf(entry, 15));
      return;
    }
    if (!entry.quiet) this.held.set(entry.id, entry.signature);
    this.send({ op: "show", entry, position: this.options.position ?? "milieu-droite", positionFile: (0, import_node_path4.join)(this.options.configDir, "pharmaboost-avis-position.txt") });
  }
  /** « Vente terminée » est enregistrée : la fenêtre montre le message de fin, puis s'efface et attend la vente suivante. */
  done(info) {
    this.held.delete(info.id);
    if (this.platform !== "win32" || this.broken || this.forcedLegacy || !this.host) {
      this.options.log(`Vente termin\xE9e : ${info.title} \u2014 ${info.lines.join(" / ")}${info.badge ? ` \u2014 ${info.badge}` : ""}`);
      return;
    }
    this.send({ op: "done", info });
  }
  /** La fenêtre passe à une autre vente : l'ancienne n'est plus suivie ici (la fenêtre, elle, n'est pas touchée). */
  forget(id) {
    this.held.delete(id);
  }
  /** La vente est close : son conseil n'a plus lieu d'être. */
  remove(id) {
    if (!this.held.delete(id)) return;
    this.send({ op: "remove", id });
  }
  stop() {
    if (this.startTimer) clearTimeout(this.startTimer);
    if (this.host) {
      this.send({ op: "quit" });
      try {
        this.host.kill();
      } catch {
      }
    }
    this.host = null;
    this.ready = false;
  }
  send(command) {
    if (!this.host) return;
    try {
      this.host.stdin.write(encodeCommand(command));
    } catch (error) {
      this.options.log(`Avis : \xE9criture impossible (${error instanceof Error ? error.message : String(error)}).`);
    }
  }
  /** Lance la fenêtre si elle ne tourne pas. Renvoie faux quand elle ne pourra pas tourner : on se replie. */
  ensureHost() {
    if (this.host) return true;
    try {
      (0, import_node_fs4.mkdirSync)(this.options.configDir, { recursive: true });
      const scriptPath = (0, import_node_path4.join)(this.options.configDir, "pharmaboost-avis-hote.ps1");
      (0, import_node_fs4.writeFileSync)(scriptPath, `\uFEFF${NOTICE_HOST_SCRIPT}`, "utf8");
      const host = this.options.spawnHost ? this.options.spawnHost(scriptPath) : this.spawnReal(scriptPath);
      this.host = host;
      this.ready = false;
      this.stderrText = "";
      host.stdin.on("error", () => {
      });
      host.stdout.on("data", (chunk) => this.onOutput(String(chunk)));
      host.stderr.on("data", (chunk) => this.onError(String(chunk)));
      host.on("exit", () => this.onExit());
      host.on("error", (error) => this.giveUp(`le processus n'a pas d\xE9marr\xE9 (${error.message})`));
      this.startTimer = setTimeout(() => {
        if (!this.ready) this.giveUp("la fen\xEAtre n'a pas d\xE9marr\xE9 \xE0 temps");
      }, this.options.startTimeoutMs ?? 6e4);
      this.startTimer.unref?.();
      return true;
    } catch (error) {
      this.giveUp(error instanceof Error ? error.message : String(error));
      return false;
    }
  }
  spawnReal(scriptPath) {
    const child = (0, import_node_child_process3.spawn)("powershell.exe", ["-STA", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", scriptPath], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    return child;
  }
  onOutput(text) {
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      if (line === "PRET") {
        this.ready = true;
        if (this.startTimer) clearTimeout(this.startTimer);
        this.options.log("Avis : fen\xEAtre pr\xEAte.");
      } else {
        this.onWord(line);
      }
    }
  }
  /** Un mot de la fenêtre : la réponse du pharmacien à un geste. Un mot inconnu est ignoré, jamais une panne. */
  onWord(line) {
    const [word, saleId = "", argument = ""] = line.split(" ");
    const act = (action) => {
      try {
        this.options.onAction?.(action);
      } catch (error) {
        this.options.log(`Avis : action ${word} impossible (${error instanceof Error ? error.message : String(error)}).`);
      }
    };
    if (!saleId && word !== "ERREUR") return;
    if (word === "VENDU" && argument) act({ kind: "sold", saleId, adviceId: argument });
    else if (word === "NONVENDU" && argument) act({ kind: "not_sold", saleId, adviceId: argument });
    else if (word === "ANNULER" && argument) act({ kind: "undo", saleId, adviceId: argument });
    else if (word === "EMAIL" && argument) {
      const email = Buffer.from(argument, "base64").toString("utf8").trim();
      if (email && email.length <= 200 && !/[\r\n\s]/.test(email)) act({ kind: "email", saleId, email });
    } else if (word === "EMAIL_RETIRER") act({ kind: "email_remove", saleId });
    else if (word === "TERMINER") act({ kind: "finish", saleId });
    else if (word === "VOIR") act({ kind: "view", saleId });
    else if (word === "FERMEE") this.held.delete(saleId);
    else if (word === "ERREUR") this.options.log(`Avis : ${line}`);
  }
  onError(text) {
    this.stderrText = `${this.stderrText}${text}`.slice(0, 600);
    if (!this.ready) this.giveUp(`erreur au d\xE9marrage : ${this.stderrText.replace(/\s+/g, " ").trim()}`);
    else this.options.log(`Avis (PowerShell) : ${text.trim().slice(0, 300)}`);
  }
  onExit() {
    const wasReady = this.ready;
    this.host = null;
    this.ready = false;
    this.held.clear();
    if (!wasReady && !this.broken) this.giveUp("la fen\xEAtre s'est arr\xEAt\xE9e avant d'\xEAtre pr\xEAte");
    else if (wasReady) this.options.log("Avis : la fen\xEAtre s'est arr\xEAt\xE9e ; elle red\xE9marrera au prochain conseil.");
  }
  /** La nouvelle fenêtre ne peut pas tourner sur ce poste : on garde l'ancienne, et on le dit. */
  giveUp(reason) {
    if (this.broken) return;
    this.broken = true;
    if (this.startTimer) clearTimeout(this.startTimer);
    this.options.log(`Avis : la nouvelle fen\xEAtre ne d\xE9marre pas (${reason}) ; retour \xE0 l'ancienne fen\xEAtre.`);
    const host = this.host;
    this.host = null;
    this.ready = false;
    if (host) {
      try {
        host.kill();
      } catch {
      }
    }
    if (this.lastEntry) this.options.legacyShow(legacyContentOf(this.lastEntry, 15));
  }
};

// agent/src/scan-queue.ts
function createScanQueue(send) {
  const pending = [];
  let flushing = null;
  async function drain() {
    while (pending.length > 0) {
      await send(pending[0]);
      pending.shift();
    }
  }
  return {
    push(scan) {
      pending.push(scan);
    },
    flush() {
      flushing ??= drain().finally(() => {
        flushing = null;
      });
      return flushing;
    },
    get size() {
      return pending.length;
    }
  };
}

// agent/src/installer.ts
var INSTALLER_FILE_PREFIX = "PharmaBoost-Installation-";
var INSTALLER_EXIT = {
  ok: 0,
  /** Ni jeton dans le nom du fichier, ni code saisi. */
  noCode: 2,
  /** Le serveur a répondu non : lien expiré, déjà utilisé, code inconnu. */
  refused: 3,
  /** PharmaBoost n'a pas pu être joint : Internet, pare-feu, proxy. */
  unreachable: 4
};
function isInstallCode(value) {
  return /^\d{6}$/.test(value) || /^[A-Za-z0-9_-]{16,64}$/.test(value);
}
function tokenFromInstallerName(fileName) {
  const base = fileName.split(/[\\/]/).pop() ?? "";
  const match = new RegExp(`^${INSTALLER_FILE_PREFIX}([A-Za-z0-9_-]+)(?=$|[\\s.(])`, "i").exec(base);
  return match && isInstallCode(match[1]) ? match[1] : null;
}
function normalizeInstallCode(input) {
  const text = input.trim();
  if (!text) return null;
  const link = /\/(?:installer|installateur)\/([A-Za-z0-9_-]+)\/?(?:[?#].*)?$/i.exec(text);
  if (link) return isInstallCode(link[1]) ? link[1] : null;
  const digits = text.replace(/[\s.-]/g, "");
  if (/^\d{6}$/.test(digits)) return digits;
  return isInstallCode(text) ? text : null;
}
function resolveInstallCode(input) {
  if (input.typed && input.typed.trim()) return normalizeInstallCode(input.typed);
  return input.fileName ? tokenFromInstallerName(input.fileName) : null;
}

// agent/src/status.ts
var import_node_fs5 = require("node:fs");
var import_node_path5 = require("node:path");
var STATUS_FILE_NAME = "pharmaboost-statut.json";
function statusFilePath(configPath) {
  return (0, import_node_path5.join)((0, import_node_path5.dirname)(configPath), STATUS_FILE_NAME);
}
function stateForFailure(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /révoquée/i.test(message) ? "revoque" : "hors-ligne";
}
function writeStatus(configPath, status) {
  const target = statusFilePath(configPath);
  try {
    (0, import_node_fs5.mkdirSync)((0, import_node_path5.dirname)(target), { recursive: true });
    const temporary = `${target}.tmp`;
    (0, import_node_fs5.writeFileSync)(temporary, JSON.stringify(status));
    (0, import_node_fs5.renameSync)(temporary, target);
  } catch {
  }
}

// agent/src/robot.ts
var import_node_fs6 = require("node:fs");
function compileRobotPattern(pattern) {
  if (!pattern.trim()) return { ok: false, error: "Indiquez l'expression qui d\xE9signe le code produit." };
  let regex;
  try {
    regex = new RegExp(pattern, "g");
  } catch (error) {
    return { ok: false, error: `Expression illisible : ${error instanceof Error ? error.message : String(error)}` };
  }
  if (new RegExp(`${pattern}|`).exec("")?.length === 1) return { ok: false, error: "L'expression doit avoir un groupe de capture : (\\d{13}) par exemple." };
  return { ok: true, regex };
}
function extractRobotCodes(line, regex) {
  const codes = [];
  regex.lastIndex = 0;
  for (let match = regex.exec(line); match; match = regex.exec(line)) {
    if (match[0] === "") regex.lastIndex += 1;
    const code = match[1] ? normalizeScannedCode(match[1]) : null;
    if (code && !codes.includes(code)) codes.push(code);
  }
  return codes;
}
var LineBuffer = class {
  rest = "";
  push(chunk) {
    const parts = (this.rest + chunk).split(/\r?\n/);
    this.rest = parts.pop() ?? "";
    if (this.rest.length > 64 * 1024) this.rest = this.rest.slice(-4096);
    return parts;
  }
};
var POLL_MS = 1e3;
var MAX_READ_BYTES = 1024 * 1024;
function startRobotJournal(config, handlers) {
  const compiled = compileRobotPattern(config.pattern);
  if (!compiled.ok) {
    handlers.onStatus(`Robot : ${compiled.error}`);
    return () => void 0;
  }
  const regex = compiled.regex;
  const lines = new LineBuffer();
  let offset = null;
  let announcedMissing = false;
  const poll = () => {
    try {
      if (!(0, import_node_fs6.existsSync)(config.path)) {
        if (!announcedMissing) handlers.onStatus(`Robot : le fichier ${config.path} n'existe pas (encore).`);
        announcedMissing = true;
        offset = null;
        return;
      }
      announcedMissing = false;
      const size = (0, import_node_fs6.statSync)(config.path).size;
      if (offset === null) {
        offset = size;
        handlers.onStatus(`Robot : lecture de ${config.path} \xE0 partir de maintenant.`);
        return;
      }
      if (size < offset) offset = 0;
      if (size === offset) return;
      const length = Math.min(size - offset, MAX_READ_BYTES);
      const buffer = Buffer.alloc(length);
      const fd = (0, import_node_fs6.openSync)(config.path, "r");
      try {
        (0, import_node_fs6.readSync)(fd, buffer, 0, length, offset);
      } finally {
        (0, import_node_fs6.closeSync)(fd);
      }
      offset += length;
      const at = Date.now();
      for (const line of lines.push(buffer.toString("latin1"))) {
        for (const code of extractRobotCodes(line, regex)) handlers.onScan(code, at);
      }
    } catch (error) {
      handlers.onStatus(`Robot : ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  const timer = setInterval(poll, POLL_MS);
  poll();
  return () => clearInterval(timer);
}
var CrossSourceDedupe = class {
  constructor(windowMs = 45e3) {
    this.windowMs = windowMs;
  }
  windowMs;
  last = /* @__PURE__ */ new Map();
  /** Vrai si ce code vient d'être annoncé par une autre source. Sinon l'enregistre et rend faux. */
  isDuplicate(code, source, at) {
    const previous = this.last.get(code);
    if (previous && previous.source !== source && at - previous.at <= this.windowMs) return true;
    this.last.set(code, { source, at });
    if (this.last.size > 500) {
      for (const [key, value] of this.last) if (at - value.at > this.windowMs) this.last.delete(key);
    }
    return false;
  }
};
function dryRunRobotFile(path, pattern, maxBytes = 5 * 1024 * 1024) {
  const compiled = compileRobotPattern(pattern);
  if (!compiled.ok) return compiled;
  if (!(0, import_node_fs6.existsSync)(path)) return { ok: false, error: `Le fichier ${path} n'existe pas.` };
  const size = (0, import_node_fs6.statSync)(path).size;
  const length = Math.min(size, maxBytes);
  const buffer = Buffer.alloc(length);
  const fd = (0, import_node_fs6.openSync)(path, "r");
  try {
    (0, import_node_fs6.readSync)(fd, buffer, 0, length, size - length);
  } finally {
    (0, import_node_fs6.closeSync)(fd);
  }
  const lines = buffer.toString("latin1").split(/\r?\n/);
  const codes = [];
  for (const line of lines) codes.push(...extractRobotCodes(line, compiled.regex));
  return { ok: true, lines: lines.length, codes };
}

// agent/src/index.ts
var import_node_fs7 = require("node:fs");
var import_node_os = require("node:os");
var import_node_path6 = require("node:path");
var VERSION = "0.7.0";
var CONFIG_PATH = process.env.PHARMABOOST_CONNECT_CONFIG ?? (0, import_node_path6.join)(process.cwd(), "pharmaboost-connect.json");
var LOG_PATH = (0, import_node_path6.join)((0, import_node_path6.dirname)(CONFIG_PATH), "pharmaboost-connect.log");
var LOG_MAX_BYTES = 2 * 1024 * 1024;
var SETTLE_MS = 1e4;
var CHECK_MS = 3e4;
var DEFAULT_EXPORT = process.platform === "win32" ? "C:\\PharmaBoost\\Export" : (0, import_node_path6.join)(process.cwd(), "export");
var DEFAULT_SCANS = process.platform === "win32" ? "C:\\PharmaBoost\\Ordonnances" : null;
var notice = null;
function log(message) {
  const line = `${(/* @__PURE__ */ new Date()).toISOString()} ${message}`;
  console.log(line);
  try {
    (0, import_node_fs7.mkdirSync)((0, import_node_path6.dirname)(LOG_PATH), { recursive: true });
    if ((0, import_node_fs7.existsSync)(LOG_PATH) && (0, import_node_fs7.statSync)(LOG_PATH).size > LOG_MAX_BYTES) (0, import_node_fs7.renameSync)(LOG_PATH, `${LOG_PATH}.1`);
    (0, import_node_fs7.appendFileSync)(LOG_PATH, `${line}
`);
  } catch {
  }
}
function setNotice(value) {
  if (value !== notice) log(value ? `\xC0 signaler : ${value}` : "Plus rien \xE0 signaler.");
  notice = value;
}
function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : void 0;
}
function readConfig() {
  if (!(0, import_node_fs7.existsSync)(CONFIG_PATH)) return null;
  return JSON.parse((0, import_node_fs7.readFileSync)(CONFIG_PATH, "utf8"));
}
function writeConfig(config) {
  (0, import_node_fs7.mkdirSync)((0, import_node_path6.dirname)(CONFIG_PATH), { recursive: true });
  (0, import_node_fs7.writeFileSync)(CONFIG_PATH, JSON.stringify(config, null, 2));
}
async function api(config, path, init) {
  return fetch(`${config.serverUrl.replace(/\/$/, "")}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${config.agentKey}`, "X-Agent-Version": VERSION, ...init.headers ?? {} }
  });
}
async function pairPost() {
  const paired = await requestPostPairing(arg("poste") ?? "", arg("serveur") ?? "https://pharmaboost.app", arg("lgo") ?? "lgpi");
  log(`Poste ${paired.postLabel || (0, import_node_os.hostname)()} reli\xE9 \xE0 ${paired.pharmacyName || "l'officine"}. Configuration \xE9crite dans ${CONFIG_PATH}.`);
}
var PairingError = class extends Error {
  constructor(message, kind) {
    super(message);
    this.kind = kind;
    this.name = "PairingError";
  }
  kind;
};
async function requestPostPairing(code, serverUrl, lgo) {
  let response;
  try {
    response = await fetch(`${serverUrl.replace(/\/$/, "")}/api/agent/pair`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, role: "poste", hostname: (0, import_node_os.hostname)(), version: VERSION })
    });
  } catch (error) {
    throw new PairingError(`PharmaBoost est injoignable (${error instanceof Error ? error.message : String(error)}).`, "unreachable");
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok || !body.agentKey) {
    throw new PairingError(body.error ?? `Appairage refus\xE9 (HTTP ${response.status}).`, response.status >= 500 ? "unreachable" : "refused");
  }
  const pharmacyName = body.pharmacyName ?? "";
  const postLabel = body.postLabel ?? "";
  writeConfig({ serverUrl, agentKey: body.agentKey, role: "poste", lgo, exportPath: null, scansPath: null, intervalSeconds: 300, pharmacyName, postLabel });
  return { pharmacyName, postLabel };
}
async function installFromInstaller() {
  const code = resolveInstallCode({ fileName: arg("installer"), typed: arg("code") });
  if (!code) {
    log("Installation : aucun code d'installation dans le nom du fichier, et aucun code saisi.");
    return INSTALLER_EXIT.noCode;
  }
  try {
    const paired = await requestPostPairing(code, arg("serveur") ?? "https://pharmaboost.app", arg("lgo") ?? "lgpi");
    log(`Installation : poste ${paired.postLabel || (0, import_node_os.hostname)()} reli\xE9 \xE0 ${paired.pharmacyName || "l'officine"}.`);
    return INSTALLER_EXIT.ok;
  } catch (error) {
    log(`Installation : ${error instanceof Error ? error.message : String(error)}`);
    return error instanceof PairingError && error.kind === "unreachable" ? INSTALLER_EXIT.unreachable : INSTALLER_EXIT.refused;
  }
}
async function sendScan(config, code, scannedAt) {
  const response = await api(config, "/api/agent/scans", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, post: (0, import_node_os.hostname)(), scannedAt })
  });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401) throw new Error("cl\xE9 du poste r\xE9voqu\xE9e");
  if (response.status === 422) {
    log(`Bip ignor\xE9 (${code}) : ${body.error ?? "code inconnu"}`);
    return;
  }
  if (!response.ok || !body.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
  log(`Bip ${code} \u2192 ${body.drugName ?? "?"} (${body.reference ?? "?"}, ${body.lineCount ?? "?"} ligne(s)).`);
  lastScanAt = Date.now();
  notices.warmUp();
  if (body.prescriptionId) watchPrescription(body.prescriptionId);
}
var lastScanAt = null;
var nextUpdateCheck = Date.now() + 45e3;
var restartWhenIdle = false;
async function checkForUpdate(config, scans) {
  const sessionActive = () => watched !== null && Date.now() - watched.lastChange < SESSION_IDLE_MS;
  const idle = () => canUpdateNow({ watching: sessionActive(), queuedScans: scans.size, lastScanAt, pendingNotices: sessionActive() ? notices.ids().length : 0, now: Date.now() });
  const restart = () => {
    log("Mise \xE0 jour automatique : red\xE9marrage de l'agent.");
    notices.stop();
    process.exit(0);
  };
  if (restartWhenIdle && idle()) restart();
  if (Date.now() < nextUpdateCheck) return;
  nextUpdateCheck = Date.now() + UPDATE_CHECK_EVERY_MS;
  const agentPath = process.argv[1];
  if (!isInstalledAgent(agentPath, CONFIG_PATH) || config.affichage?.miseAJourAuto === false) return;
  const result = await selfUpdate({ serverUrl: config.serverUrl, agentPath });
  if (result.status === "failed") log(`Mise \xE0 jour automatique impossible : ${result.detail}`);
  if (result.status !== "updated") return;
  log(`Mise \xE0 jour automatique : ${result.detail}.`);
  if (idle()) restart();
  restartWhenIdle = true;
  log("Elle prendra effet d\xE8s qu'aucune vente n'est en cours.");
}
var IMAGES_DIR = (0, import_node_path6.join)((0, import_node_path6.dirname)(CONFIG_PATH), "avis-images");
var notices = new NoticeCenter({
  configDir: (0, import_node_path6.dirname)(CONFIG_PATH),
  log: (message) => log(message),
  legacyShow: (content) => showToast((0, import_node_path6.dirname)(CONFIG_PATH), content, log),
  onAction: (action) => {
    void handleAction(action);
  }
});
function applyDisplayPreferences(config) {
  const wanted = config.affichage;
  notices.configure({
    seconds: typeof wanted?.secondes === "number" ? wanted.secondes : DEFAULT_NOTICE_SECONDS,
    position: wanted?.position && POSITIONS.includes(wanted.position) ? wanted.position : "milieu-droite",
    legacy: wanted?.ancienne === true
  });
}
var SESSION_MAX_MS = 3 * 60 * 6e4;
var SESSION_IDLE_MS = 10 * 6e4;
var SESSION_CALM_MS = 3 * 6e4;
var watched = null;
var activeConfig = null;
function watchPrescription(prescriptionId) {
  const same = watched?.prescriptionId === prescriptionId;
  if (watched && !same) notices.forget(watched.prescriptionId);
  const now = Date.now();
  watched = { prescriptionId, since: same ? watched.since : now, lastChange: now, shownSignature: same ? watched.shownSignature : null, body: same ? watched.body : null, images: same ? watched.images : /* @__PURE__ */ new Map() };
}
async function pollNotice(config) {
  await dropClosedNotices(config);
  if (!watched) return;
  if (Date.now() - watched.since > SESSION_MAX_MS) {
    notices.remove(watched.prescriptionId);
    watched = null;
    return;
  }
  const response = await api(config, `/api/agent/conseil?prescription=${encodeURIComponent(watched.prescriptionId)}`, { method: "GET" });
  if (response.status === 404) {
    watched = null;
    return;
  }
  if (!response.ok) return;
  const body = await response.json();
  if (!body.ok) return;
  if (body.state === "CLOSED") {
    notices.remove(watched.prescriptionId);
    watched = null;
    return;
  }
  if (body.state !== "READY" || body.signature === watched.shownSignature) return;
  watched.shownSignature = body.signature;
  watched.lastChange = Date.now();
  applyDisplayPreferences(config);
  await showBody(config, watched.prescriptionId, body, {});
  log(`Avis affich\xE9 : ${body.subject} \u2014 ${body.alerts.length} alerte(s), ${(body.items ?? []).length || body.advice.length} conseil(s).`);
}
async function showBody(config, prescriptionId, body, extras) {
  const current2 = watched?.prescriptionId === prescriptionId ? watched : null;
  if (current2) current2.body = body;
  const known = current2 ? current2.images : /* @__PURE__ */ new Map();
  const missing = [];
  for (const item of body.items ?? []) {
    const source = imageSource(item.imageUrl, config.serverUrl);
    if (!item.imageUrl || !source || known.has(item.imageUrl)) continue;
    const hit = cachedImage(IMAGES_DIR, source);
    if (hit) known.set(item.imageUrl, hit);
    else missing.push({ imageUrl: item.imageUrl, source });
  }
  notices.show(buildHostEntry({ prescriptionId, serverUrl: config.serverUrl, body, images: known, ...extras }));
  if (missing.length > 0) void completeImages(config, prescriptionId, body, known, missing);
}
async function completeImages(config, prescriptionId, body, known, missing) {
  let added = 0;
  for (const { imageUrl, source } of missing) {
    const path = await fetchImage(source, config.serverUrl, IMAGES_DIR);
    if (path) {
      known.set(imageUrl, path);
      added += 1;
    }
  }
  if (added > 0 && watched?.prescriptionId === prescriptionId && watched.body === body) notices.show(buildHostEntry({ prescriptionId, serverUrl: config.serverUrl, body, images: known }));
}
async function refreshNow(config, extras = {}) {
  if (!watched) return;
  const prescriptionId = watched.prescriptionId;
  const response = await api(config, `/api/agent/conseil?prescription=${encodeURIComponent(prescriptionId)}`, { method: "GET" });
  if (!response.ok) return;
  const body = await response.json();
  if (!body.ok || body.state !== "READY" || watched?.prescriptionId !== prescriptionId) return;
  watched.shownSignature = body.signature;
  watched.lastChange = Date.now();
  await showBody(config, prescriptionId, body, extras);
}
async function postJson(config, path, payload) {
  const response = await api(config, path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  return { status: response.status, body: await response.json().catch(() => null) };
}
async function handleAction(action) {
  const config = activeConfig;
  if (!config || action.kind === "view") return;
  if (watched) watched.lastChange = Date.now();
  try {
    if (action.kind === "sold" || action.kind === "not_sold" || action.kind === "undo") {
      const outcome = action.kind === "sold" ? "SOLD" : action.kind === "not_sold" ? "NOT_SOLD" : "NONE";
      const result = await postJson(config, "/api/agent/conseil/decision", { prescription: action.saleId, recommendation: action.adviceId, outcome });
      log(`Conseil ${action.adviceId} \u2192 ${outcome} : ${result.body?.ok ? "enregistr\xE9" : result.body?.error ?? `HTTP ${result.status}`}.`);
      await refreshNow(config, result.body?.ok ? {} : { problem: result.body?.error ?? "La r\xE9ponse n'a pas pu \xEAtre enregistr\xE9e." });
    } else if (action.kind === "email" || action.kind === "email_remove") {
      const email = action.kind === "email" ? action.email : null;
      const result = await postJson(config, "/api/agent/conseil/email", { prescription: action.saleId, email, consent: email !== null });
      log(email ? `E-mail du patient : ${result.body?.ok ? "enregistr\xE9 (avec son accord)" : result.body?.error ?? `HTTP ${result.status}`}.` : "E-mail du patient retir\xE9.");
      await refreshNow(config, result.body?.ok ? {} : { emailError: result.body?.error ?? "L'adresse n'a pas pu \xEAtre enregistr\xE9e." });
    } else if (action.kind === "finish") {
      const emailWasSaved = watched?.body?.followUp?.emailSaved === true;
      const result = await postJson(config, "/api/agent/conseil/terminer", { prescription: action.saleId });
      if (result.body?.ok) {
        log(`Vente termin\xE9e : ${result.body.sold} vendu(s), ${result.body.notSold} non vendu(s), ${result.body.unanswered} sans r\xE9ponse ; bilan : ${result.body.report}.`);
        notices.done(buildDoneInfo({ saleId: action.saleId, result: result.body, emailWasSaved }));
        if (watched?.prescriptionId === action.saleId) watched = null;
      } else {
        log(`Vente termin\xE9e impossible : ${result.body?.error ?? `HTTP ${result.status}`}.`);
        await refreshNow(config, { problem: "La fin de la vente n'a pas pu \xEAtre enregistr\xE9e. R\xE9essayez dans un instant." });
      }
    }
  } catch (error) {
    log(`Action ${action.kind} : ${error instanceof Error ? error.message : String(error)}`);
    await refreshNow(config, { problem: "Pas de connexion \xE0 PharmaBoost : ce geste n'a pas \xE9t\xE9 enregistr\xE9." }).catch(() => void 0);
  }
}
var lastClosedCheck = 0;
async function dropClosedNotices(config) {
  if (Date.now() - lastClosedCheck < 3e4) return;
  lastClosedCheck = Date.now();
  for (const id of notices.ids()) {
    if (watched?.prescriptionId === id) continue;
    const response = await api(config, `/api/agent/conseil?prescription=${encodeURIComponent(id)}`, { method: "GET" });
    if (response.status === 404) {
      notices.remove(id);
      continue;
    }
    if (!response.ok) continue;
    const state = (await response.json().catch(() => ({}))).state;
    if (state === "CLOSED") notices.remove(id);
  }
}
async function postHeartbeat(config) {
  const response = await api(config, "/api/agent/heartbeat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version: VERSION, hostname: (0, import_node_os.hostname)(), notice })
  });
  if (response.status === 401) throw new Error("cl\xE9 du poste r\xE9voqu\xE9e");
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await response.json().catch(() => ({}));
  return { exportPath: body.exportPath ?? null, syncRequestedAt: body.syncRequestedAt ?? null };
}
async function runPost(config) {
  log(`PharmaBoost Connect ${VERSION} \u2014 poste de caisse ${(0, import_node_os.hostname)()} \u2014 journal : ${LOG_PATH}`);
  const scans = createScanQueue((scan) => sendScan(config, scan.code, scan.scannedAt));
  const dedupe = new CrossSourceDedupe();
  const accept = (source) => (code, at) => {
    if (dedupe.isDuplicate(code, source, at)) {
      log(`${source === "robot" ? "Robot" : "Bip"} ${code} ignor\xE9 : d\xE9j\xE0 annonc\xE9 \xE0 l'instant par ${source === "robot" ? "la douchette" : "le robot"}.`);
      return;
    }
    scans.push({ code, scannedAt: new Date(at).toISOString() });
    scans.flush().catch((error) => log(`Bip en attente : ${error instanceof Error ? error.message : String(error)}`));
  };
  startDouchette((0, import_node_path6.dirname)(CONFIG_PATH), { onScan: accept("douchette"), onStatus: (message) => log(message) });
  if (config.robot) startRobotJournal(config.robot, { onScan: accept("robot"), onStatus: (message) => log(message) });
  let lastHeartbeat = 0;
  let lastStockCheck = 0;
  let handledSyncRequest = null;
  let forceSync = false;
  const reportState = (etat) => writeStatus(CONFIG_PATH, { etat, at: (/* @__PURE__ */ new Date()).toISOString(), version: VERSION, poste: config.postLabel || (0, import_node_os.hostname)(), officine: config.pharmacyName ?? null, notice });
  for (; ; ) {
    try {
      activeConfig = config;
      if (scans.size > 0) await scans.flush();
      await pollNotice(config);
      await checkForUpdate(config, scans);
      if (Date.now() - lastHeartbeat > 6e4) {
        let settings;
        try {
          settings = await postHeartbeat(config);
        } catch (error) {
          reportState(stateForFailure(error));
          lastHeartbeat = Date.now() - 45e3;
          throw error;
        }
        reportState("ok");
        lastHeartbeat = Date.now();
        if (settings.exportPath !== (config.exportPath ?? null)) {
          config = { ...config, exportPath: settings.exportPath };
          writeConfig(config);
          log(settings.exportPath ? `Export de stock \xE0 surveiller : ${settings.exportPath}` : "Ce poste n'envoie plus de stock.");
          lastStockCheck = 0;
        }
        if (settings.syncRequestedAt && settings.syncRequestedAt !== handledSyncRequest) {
          handledSyncRequest = settings.syncRequestedAt;
          forceSync = true;
          lastStockCheck = 0;
        }
      }
      if (config.exportPath && Date.now() - lastStockCheck > CHECK_MS) {
        config = await syncStock(config, forceSync);
        forceSync = false;
        lastStockCheck = Date.now();
      }
    } catch (error) {
      log(`Erreur : ${error instanceof Error ? error.message : String(error)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, watched ? Date.now() - watched.lastChange > SESSION_CALM_MS ? 8e3 : 2e3 : 3e3));
  }
}
function testRobot() {
  const path = arg("test-robot") ?? "";
  const result = dryRunRobotFile(path, arg("motif") ?? "");
  if (!result.ok) {
    console.log(result.error);
    process.exitCode = 1;
    return;
  }
  console.log(`${result.lines} ligne(s) lue(s), ${result.codes.length} code(s) produit trouv\xE9(s).`);
  for (const code of result.codes.slice(0, 50)) console.log(`  ${code}`);
  if (result.codes.length === 0) console.log("Aucun code : l'expression ne correspond \xE0 rien, ou le fichier ne contient pas encore de dispensation.");
}
function enableRobot() {
  const config = readConfig();
  if (!config || config.role !== "poste") {
    console.log("Ce poste n'est pas encore reli\xE9 \xE0 PharmaBoost.");
    process.exitCode = 1;
    return;
  }
  const path = arg("robot") ?? "";
  const pattern = arg("motif") ?? "";
  const compiled = compileRobotPattern(pattern);
  if (!path || !compiled.ok) {
    console.log(!path ? "Indiquez le fichier \xE0 lire." : compiled.error);
    process.exitCode = 1;
    return;
  }
  writeConfig({ ...config, robot: { kind: "journal", path, pattern } });
  console.log(`Robot branch\xE9 : ${path}. Quittez PharmaBoost (ic\xF4ne pr\xE8s de l'horloge) puis relancez-le.`);
}
function testAffichage() {
  let config = null;
  try {
    config = readConfig();
  } catch {
  }
  if (config) applyDisplayPreferences(config);
  const entry = {
    id: "essai",
    reference: "ESSAI",
    label: "M\xE9dicament d\xE9tect\xE9",
    subject: "DOLIPRANE 1000 mg \xB7 AMOXICILLINE 1 g",
    url: `${config?.serverUrl.replace(/\/$/, "") ?? "https://pharmaboost.app"}/vente/nouvelle`,
    signature: "essai",
    quiet: false,
    emailSaved: false,
    emailError: "",
    alerts: [],
    notes: [],
    items: [
      { id: "essai-1", drug: "AMOXICILLINE 1 g", challenge: "Challenge probiotiques", shortDate: "30/11/2026", outcome: "NONE", name: "PROBIOTIQUE 30 g\xE9lules", price: "14,90 \u20AC", reason: "Prot\xE9ger la flore pendant l'antibiotique", availability: "IN_STOCK", image: "" },
      { id: "essai-2", drug: "DOLIPRANE 1000 mg", challenge: "", shortDate: "", outcome: "NONE", name: "S\xC9RUM PHYSIOLOGIQUE 30 unidoses", price: "5,90 \u20AC", reason: "", availability: "LOW_STOCK", image: "" }
    ]
  };
  notices.show(entry);
  console.log("Une vente d'exemple doit appara\xEEtre \xE0 droite de l'\xE9cran, \xE0 mi-hauteur (d\xE9pla\xE7able \xE0 la souris).");
  console.log("Elle reste ouverte : essayez \xAB Vendu \xBB, \xAB Non vendu \xBB, le bouton \xAB \u2013 \xBB qui la r\xE9duit. Rien n'est envoy\xE9.");
  setTimeout(() => {
    notices.stop();
    process.exit(0);
  }, 75e3);
}
function testDouchette() {
  console.log("Passez une bo\xEEte \xE0 la douchette. Chaque code lu s'affiche ci-dessous. Ctrl+C pour arr\xEAter.");
  startDouchette((0, import_node_path6.dirname)(CONFIG_PATH), {
    onScan: (code) => console.log(`${(/* @__PURE__ */ new Date()).toLocaleTimeString("fr-FR")}  BIP  ${code}`),
    onStatus: (message) => console.log(`  ${message}`)
  });
}
async function pair() {
  const code = arg("appairer");
  const serverUrl = arg("serveur") ?? "https://pharmaboost.app";
  const lgo = arg("lgo") ?? "autre";
  const exportPath = arg("export") ?? DEFAULT_EXPORT;
  const scansPath = arg("scans") ?? DEFAULT_SCANS;
  for (const dir of [exportPath, scansPath]) {
    if (dir) {
      try {
        (0, import_node_fs7.mkdirSync)(dir, { recursive: true });
      } catch {
      }
    }
  }
  const response = await fetch(`${serverUrl.replace(/\/$/, "")}/api/agent/pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, lgo, hostname: (0, import_node_os.hostname)(), version: VERSION, exportPath, scansPath })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok || !body.agentKey) throw new Error(body.error ?? `Appairage refus\xE9 (HTTP ${response.status}).`);
  writeConfig({ serverUrl, agentKey: body.agentKey, lgo, exportPath, scansPath, intervalSeconds: body.intervalSeconds ?? 300 });
  log(`Appair\xE9 avec ${body.pharmacyName ?? "l'officine"}. Configuration \xE9crite dans ${CONFIG_PATH}. Export surveill\xE9 : ${exportPath}${scansPath ? ` \u2014 scans : ${scansPath}` : ""}.`);
}
function latestExport(dir) {
  if (!(0, import_node_fs7.existsSync)(dir)) return null;
  const st = (0, import_node_fs7.statSync)(dir);
  if (st.isFile()) return { path: dir, mtime: st.mtimeMs, size: st.size };
  const files = (0, import_node_fs7.readdirSync)(dir).filter((name) => /\.(csv|txt|xlsx|xls|pdf)$/i.test(name) && !name.startsWith("~$")).map((name) => {
    const s = (0, import_node_fs7.statSync)((0, import_node_path6.join)(dir, name));
    return { path: (0, import_node_path6.join)(dir, name), mtime: s.mtimeMs, size: s.size };
  }).sort((a, b) => b.mtime - a.mtime);
  return files[0] ?? null;
}
var lastStamp = null;
async function syncStock(config, force) {
  if (!config.exportPath) return config;
  if (!(0, import_node_fs7.existsSync)(config.exportPath)) {
    setNotice(`Le dossier d'export ${config.exportPath} n'existe pas sur ${(0, import_node_os.hostname)()}.`);
    return config;
  }
  const file = latestExport(config.exportPath);
  if (!file) {
    setNotice(`Aucun export dans ${config.exportPath}. Enregistrez-y l'\xE9dition de stock de votre logiciel.`);
    return config;
  }
  if (Date.now() - file.mtime < SETTLE_MS) return config;
  const stamp = `${file.path}:${file.mtime}:${file.size}`;
  if (!force && stamp === lastStamp) return config;
  lastStamp = stamp;
  const bytes = (0, import_node_fs7.readFileSync)(file.path);
  const hash = (0, import_node_crypto3.createHash)("sha256").update(bytes).digest("hex");
  if (hash === config.lastExportHash) {
    if (notice?.startsWith("Aucun export") || notice?.startsWith("Le dossier")) setNotice(null);
    return config;
  }
  const form = new FormData();
  form.set("file", new Blob([bytes]), (0, import_node_path6.basename)(file.path));
  const response = await api(config, "/api/agent/stock", { method: "POST", body: form });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok) {
    setNotice(`Export refus\xE9 (${(0, import_node_path6.basename)(file.path)}) : ${body.error ?? `HTTP ${response.status}`}`);
    return config;
  }
  setNotice(null);
  log(`Stock synchronis\xE9 : ${body.lines ?? "?"} ligne(s), ${body.created ?? 0} cr\xE9\xE9e(s), ${body.updated ?? 0} mise(s) \xE0 jour (${(0, import_node_path6.basename)(file.path)}).`);
  return { ...config, lastExportHash: hash };
}
async function syncScans(config) {
  if (!config.scansPath || !(0, import_node_fs7.existsSync)(config.scansPath)) return config;
  const sent = new Set(config.sentScans ?? []);
  const files = (0, import_node_fs7.readdirSync)(config.scansPath).filter((name) => /\.(pdf|jpe?g|png|webp)$/i.test(name)).map((name) => ({ path: (0, import_node_path6.join)(config.scansPath, name), stat: (0, import_node_fs7.statSync)((0, import_node_path6.join)(config.scansPath, name)) })).filter(({ stat }) => Date.now() - stat.mtimeMs > SETTLE_MS).sort((a, b) => a.stat.mtimeMs - b.stat.mtimeMs);
  let next = config;
  for (const { path, stat } of files) {
    const key = `${(0, import_node_path6.basename)(path)}:${stat.size}`;
    if (sent.has(key)) continue;
    const mime = { ".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" }[(0, import_node_path6.extname)(path).toLowerCase()] ?? "application/octet-stream";
    const form = new FormData();
    form.set("file", new Blob([(0, import_node_fs7.readFileSync)(path)], { type: mime }), (0, import_node_path6.basename)(path));
    const response = await api(config, "/api/agent/prescriptions", { method: "POST", body: form });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) {
      log(`Scan refus\xE9 (${(0, import_node_path6.basename)(path)}) : ${body.error ?? `HTTP ${response.status}`}`);
      continue;
    }
    sent.add(key);
    next = { ...next, sentScans: [...sent].slice(-2e3) };
    writeConfig(next);
    log(`Ordonnance envoy\xE9e : ${(0, import_node_path6.basename)(path)} \u2192 ${body.reference ?? "?"} (${body.lines ?? 0} ligne(s) lue(s)).`);
  }
  return next;
}
async function heartbeat(config) {
  const response = await api(config, "/api/agent/heartbeat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version: VERSION, hostname: (0, import_node_os.hostname)(), exportPath: config.exportPath, scansPath: config.scansPath, notice })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok) {
    log(`Signe de vie refus\xE9 (HTTP ${response.status}) : la cl\xE9 est-elle r\xE9voqu\xE9e ?`);
    return config;
  }
  const updated = {
    ...config,
    intervalSeconds: body.intervalSeconds ?? config.intervalSeconds,
    exportPath: body.exportPath ?? config.exportPath,
    scansPath: body.scansPath ?? config.scansPath
  };
  if (JSON.stringify(updated) !== JSON.stringify(config)) writeConfig(updated);
  return updated;
}
async function run() {
  let config = readConfig();
  if (!config) throw new Error(`Aucune configuration (${CONFIG_PATH}). Lancez d'abord : --appairer CODE --serveur URL --lgo LGO --export DOSSIER (serveur) ou --poste CODE --serveur URL (poste de caisse)`);
  if (config.role === "poste") return runPost(config);
  log(`PharmaBoost Connect ${VERSION} \u2014 ${config.lgo} \u2014 export : ${config.exportPath ?? "non configur\xE9"} \u2014 scans : ${config.scansPath ?? "non configur\xE9s"} \u2014 journal : ${LOG_PATH}`);
  let lastHeartbeat = 0;
  let lastCheck = 0;
  let lastFullCheck = 0;
  for (; ; ) {
    try {
      if (Date.now() - lastCheck > CHECK_MS) {
        const force = Date.now() - lastFullCheck > config.intervalSeconds * 1e3;
        const before = config.lastExportHash;
        config = await syncStock(config, force);
        if (config.lastExportHash !== before) writeConfig(config);
        lastCheck = Date.now();
        if (force) lastFullCheck = Date.now();
      }
      if (Date.now() - lastHeartbeat > 6e4) {
        config = await heartbeat(config);
        lastHeartbeat = Date.now();
      }
      config = await syncScans(config);
    } catch (error) {
      log(`Erreur : ${error instanceof Error ? error.message : String(error)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5e3));
  }
}
if (arg("appairer")) {
  pair().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
} else if (process.argv.includes("--test-robot")) {
  testRobot();
} else if (process.argv.includes("--robot")) {
  enableRobot();
} else if (process.argv.includes("--installer")) {
  installFromInstaller().then((code) => {
    process.exitCode = code;
  });
} else if (arg("poste")) {
  pairPost().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
} else if (process.argv.includes("--test-douchette")) {
  testDouchette();
} else if (process.argv.includes("--test-affichage")) {
  testAffichage();
} else if (process.argv.includes("--version")) {
  console.log(VERSION);
} else {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
