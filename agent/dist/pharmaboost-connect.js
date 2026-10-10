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

// agent/src/banner-design.ts
var BANNER = {
  colors: {
    // La carte : un bleu-vert profond, très légèrement transparent, avec un liseré qui brille.
    cardTop: "#0F3F54",
    cardBottom: "#082638",
    cardAlpha: 0.94,
    glow: "#36E8C8",
    text: "#F4FBFF",
    muted: "#A9CBD8",
    // L'accent PharmaBoost : le vert des boutons et de la coche.
    accent: "#22C88F",
    accentDark: "#14A06F",
    // Le panneau clair des conseils.
    panel: "#F5FAFC",
    ink: "#10222F",
    inkSoft: "#5A7280",
    line: "#DCE8EE",
    // Les pastilles.
    challengeBg: "#FFF0C7",
    challengeFg: "#8A5A00",
    challengeIcon: "#F2A516",
    dateBg: "#FFE1DE",
    dateFg: "#B42318",
    stockBg: "#D8F6E6",
    stockFg: "#087443",
    lowBg: "#FEF0C7",
    lowFg: "#B54708",
    outBg: "#FEE4E2",
    outFg: "#B42318",
    unknownBg: "#EAF0F3",
    unknownFg: "#475467",
    // Les réponses du pharmacien.
    soldBg: "#22C88F",
    soldFg: "#FFFFFF",
    notSoldBg: "#E6EDF1",
    notSoldFg: "#4B5F6C",
    waitingBg: "#FFF0C7",
    waitingFg: "#8A5A00",
    alertBg: "#FFF3D6",
    alertFg: "#9A5B00",
    // La mascotte.
    shellTop: "#FFFFFF",
    shellBottom: "#C4E1EC",
    shellEdge: "#8FBCD0",
    screenTop: "#0A2234",
    screenBottom: "#0E3550",
    eye: "#58F2D8",
    ear: "#27C9B0"
  },
  sizes: {
    /** Marge autour de la carte, pour l'ombre douce. */
    margin: 20,
    radius: 24,
    widthIdle: 400,
    widthReady: 400,
    widthExpanded: 520,
    widthDone: 420,
    widthReduced: 256,
    heightIdle: 100,
    heightReady: 134,
    heightDone: 132,
    heightReduced: 64,
    header: 88,
    buttonHeight: 40,
    finishHeight: 46,
    mascot: 84,
    thumb: 46,
    iconButton: 26
  },
  timing: {
    /** Le temps où « 3 conseils disponibles » reste seul, avant que la bannière s'agrandisse d'elle-même. */
    readyPauseMs: 1100,
    /** « Rien à ajouter » reste affiché ce temps, puis la bannière redevient « en attente ». */
    quietMs: 8e3,
    /** « Vente terminée ! » reste affiché ce temps. */
    doneMs: 7e3,
    /** Une analyse qui ne répond pas ne garde pas la bannière en « analyse en cours » plus longtemps. */
    scanTimeoutMs: 45e3,
    idleFps: 15,
    motionFps: 40,
    /** Part de l'écart rattrapée à chaque image quand la bannière s'agrandit ou se réduit (0 à 1). */
    ease: 0.22
  },
  text: {
    brand: "PharmaBoost",
    idle: "En attente de scan\u2026",
    scanTitle: "Scan d\xE9tect\xE9 !",
    scanSub: "Analyse en cours\u2026",
    readyOne: "1 conseil disponible",
    readyMany: "{n} conseils disponibles",
    readyButton: "Voir les conseils",
    forSaleOne: "1 conseil pour cette d\xE9livrance",
    forSaleMany: "{n} conseils pour cette d\xE9livrance",
    duringSale: "Pendant la vente",
    readFirst: "\xC0 lire avant de conseiller",
    questionTitle: "Une question \xE0 poser",
    questionSub: "Pour choisir le bon conseil",
    quiet: "Rien \xE0 ajouter",
    quietSub: "Aucun conseil pour cette vente",
    sold: "Vendu",
    notSold: "Non vendu",
    change: "Modifier",
    detail: "Voir le d\xE9tail",
    emailAdd: "Ajouter l'e-mail du patient",
    emailSaved: "E-mail enregistr\xE9",
    emailRemove: "Retirer",
    finish: "Vente termin\xE9e",
    finishing: "Enregistrement\u2026",
    doneTitle: "Vente termin\xE9e !",
    challenge: "Challenge",
    shortDate: "Date courte",
    inStock: "En stock",
    lowStock: "Stock faible",
    outOfStock: "Rupture",
    unknownStock: "Stock \xE0 v\xE9rifier",
    reducedIdle: "En attente",
    allDone: "Tous trait\xE9s",
    reducedMany: "{n} conseils",
    reducedOne: "1 conseil",
    forDrug: "Pour : ",
    pinTip: "Verrouiller la position",
    minTip: "R\xE9duire",
    closeTip: "Masquer"
  }
};
function rgbOf(hex) {
  const value = hex.replace("#", "");
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
}
function csColor(hex, alpha = 1) {
  const [r, g, b] = rgbOf(hex);
  return `Color.FromArgb(${Math.round(alpha * 255)}, ${r}, ${g}, ${b})`;
}

// agent/src/notice-host.ts
var C = BANNER.colors;
var Z = BANNER.sizes;
var T = BANNER.text;
var M = BANNER.timing;
var pascal = (key) => key.charAt(0).toUpperCase() + key.slice(1);
var cs = (value) => JSON.stringify(value);
var PALETTE = Object.entries(C).filter(([key]) => key !== "cardAlpha").map(([key, value]) => `    public static readonly Color ${pascal(key)} = ${csColor(value)};`).join("\n");
var DIMENSIONS = Object.entries(Z).map(([key, value]) => `    public const int ${pascal(key)} = ${value};`).join("\n");
var TIMINGS = Object.entries(M).map(([key, value]) => `    public const ${Number.isInteger(value) ? "int" : "double"} ${pascal(key)} = ${value};`).join("\n");
var PHRASES = Object.entries(T).map(([key, value]) => `    public const string ${pascal(key)} = ${cs(value)};`).join("\n");
var NOTICE_HOST_CSHARP = String.raw`
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Text;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace PharmaBoostAvis
{
  [StructLayout(LayoutKind.Sequential)]
  internal struct POINT
  {
    public int x;
    public int y;
    public POINT(int px, int py) { x = px; y = py; }
  }

  [StructLayout(LayoutKind.Sequential)]
  internal struct SIZE
  {
    public int cx;
    public int cy;
    public SIZE(int w, int h) { cx = w; cy = h; }
  }

  [StructLayout(LayoutKind.Sequential, Pack = 1)]
  internal struct BLENDFUNCTION
  {
    public byte BlendOp;
    public byte BlendFlags;
    public byte SourceConstantAlpha;
    public byte AlphaFormat;
  }

  internal static class Native
  {
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] public static extern bool DestroyIcon(IntPtr handle);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongW")] public static extern int GetWindowLong(IntPtr hWnd, int index);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongW")] public static extern int SetWindowLong(IntPtr hWnd, int index, int value);
    [DllImport("user32.dll")] public static extern IntPtr GetDC(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);
    [DllImport("user32.dll", SetLastError = true)] public static extern bool UpdateLayeredWindow(IntPtr hwnd, IntPtr hdcDst, ref POINT pptDst, ref SIZE psize, IntPtr hdcSrc, ref POINT pptSrc, int crKey, ref BLENDFUNCTION pblend, int dwFlags);
    [DllImport("gdi32.dll")] public static extern IntPtr CreateCompatibleDC(IntPtr hDC);
    [DllImport("gdi32.dll")] public static extern bool DeleteDC(IntPtr hdc);
    [DllImport("gdi32.dll")] public static extern IntPtr SelectObject(IntPtr hDC, IntPtr hObject);
    [DllImport("gdi32.dll")] public static extern bool DeleteObject(IntPtr hObject);
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
    /// <summary>Le stock exact de l'officine (« 3 »), ou vide quand il n'est pas connu.</summary>
    public string Quantity = "";
    public string Image = "";
  }

  /// <summary>Un choix de réponse à une question du comptoir (« Dos », « Fièvre »…).</summary>
  public class Choice
  {
    public string Key = "";
    public string Label = "";
    public bool Selected;
  }

  /// <summary>Une question de l'arbre du comptoir : « Pourquoi le patient prend-il DOLIPRANE ? », avec un bouton par choix.</summary>
  public class Question
  {
    public string Node = "";
    public string Text = "";
    public bool Multi;
    public List<Choice> Choices = new List<Choice>();
  }

  /// <summary>Ce que la bannière affiche pour UNE vente, du premier bip à « Vente terminée ».</summary>
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
    public List<Question> Questions = new List<Question>();
    public List<string> Guidance = new List<string>();
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

  /// <summary>Une zone cliquable de la bannière, refaite à chaque image.</summary>
  internal class Hit
  {
    public RectangleF R;
    public string Kind = "";
    public Item Item;
    public string Tip = "";
    /// <summary>Pour un bouton de réponse : « question:choix ».</summary>
    public string Tag = "";
  }

  /// <summary>Les couleurs du design (banner-design.ts).</summary>
  internal static class Pal
  {
${PALETTE}
    public const double CardAlpha = ${C.cardAlpha};
  }

  /// <summary>Les cotes du design, en pixels à 100 % d'affichage.</summary>
  internal static class Dim
  {
${DIMENSIONS}
  }

  internal static class Tim
  {
${TIMINGS}
  }

  /// <summary>Les phrases du design.</summary>
  internal static class Txt
  {
${PHRASES}
  }

  internal static class St
  {
    public const int Idle = 0;
    public const int Scanning = 1;
    public const int Ready = 2;
    public const int Expanded = 3;
    public const int Done = 4;
    public const int Quiet = 5;
  }

  /// <summary>Les outils de dessin : pinceaux et polices en réserve, formes arrondies, textes, pastilles, petites icônes.</summary>
  internal static class Gfx
  {
    private static readonly Dictionary<int, SolidBrush> brushes = new Dictionary<int, SolidBrush>();
    private static readonly Dictionary<string, Font> fonts = new Dictionary<string, Font>();
    private static string face = null;
    public static readonly StringFormat Left = Make(StringAlignment.Near, true);
    public static readonly StringFormat Center = Make(StringAlignment.Center, true);
    public static readonly StringFormat Right = Make(StringAlignment.Far, true);
    public static readonly StringFormat Wrap = Make(StringAlignment.Near, false);
    /// <summary>La transparence du contenu qui apparaît (0 à 1) : les textes d'un nouvel état se fondent.</summary>
    public static float Fade = 1f;

    private static StringFormat Make(StringAlignment align, bool single)
    {
      StringFormat format = new StringFormat(StringFormat.GenericTypographic);
      format.Alignment = align;
      format.LineAlignment = StringAlignment.Near;
      format.Trimming = single ? StringTrimming.EllipsisCharacter : StringTrimming.Word;
      if (single) format.FormatFlags |= StringFormatFlags.NoWrap;
      return format;
    }

    /// <summary>La police : Segoe UI (présente sur Windows 10 et 11), sinon la plus proche qui existe.</summary>
    public static string Face()
    {
      if (face != null) return face;
      string[] wanted = new string[] { "Segoe UI", "Tahoma", "Arial" };
      face = "Arial";
      try
      {
        using (InstalledFontCollection installed = new InstalledFontCollection())
        {
          foreach (string name in wanted)
          {
            bool found = false;
            foreach (FontFamily family in installed.Families) { if (family.Name == name) { found = true; break; } }
            if (found) { face = name; break; }
          }
        }
      }
      catch (Exception) { }
      return face;
    }

    public static Font Fnt(float pixels, FontStyle style)
    {
      string key = pixels + "|" + (int)style;
      Font font;
      if (!fonts.TryGetValue(key, out font))
      {
        font = new Font(Face(), pixels, style, GraphicsUnit.Pixel);
        fonts[key] = font;
      }
      return font;
    }

    public static Color Fx(Color color)
    {
      if (Fade >= 0.999f) return color;
      return Color.FromArgb((int)Math.Round(color.A * Fade), color);
    }

    public static SolidBrush Brs(Color color)
    {
      int key = color.ToArgb();
      SolidBrush brush;
      if (!brushes.TryGetValue(key, out brush))
      {
        brush = new SolidBrush(color);
        brushes[key] = brush;
      }
      return brush;
    }

    /// <summary>Vide la réserve de pinceaux quand elle grossit : appelé entre deux images, jamais pendant.</summary>
    public static void Trim()
    {
      if (brushes.Count < 300) return;
      foreach (SolidBrush brush in brushes.Values) brush.Dispose();
      brushes.Clear();
    }

    public static GraphicsPath Round(float x, float y, float w, float h, float r)
    {
      GraphicsPath path = new GraphicsPath();
      w = Math.Max(w, 1f);
      h = Math.Max(h, 1f);
      r = Math.Min(r, Math.Min(w, h) / 2f);
      if (r < 0.75f) { path.AddRectangle(new RectangleF(x, y, w, h)); return path; }
      float d = r * 2f;
      path.AddArc(x, y, d, d, 180, 90);
      path.AddArc(x + w - d, y, d, d, 270, 90);
      path.AddArc(x + w - d, y + h - d, d, d, 0, 90);
      path.AddArc(x, y + h - d, d, d, 90, 90);
      path.CloseFigure();
      return path;
    }

    public static void Fill(Graphics g, Color color, float x, float y, float w, float h, float r)
    {
      using (GraphicsPath path = Round(x, y, w, h, r)) { g.FillPath(Brs(color), path); }
    }

    public static void Gradient(Graphics g, Color top, Color bottom, float x, float y, float w, float h, float r)
    {
      if (w < 1f || h < 1f) return;
      using (GraphicsPath path = Round(x, y, w, h, r))
      using (LinearGradientBrush brush = new LinearGradientBrush(new RectangleF(x, y - 0.5f, w, h + 1f), top, bottom, LinearGradientMode.Vertical))
      {
        g.FillPath(brush, path);
      }
    }

    public static void Stroke(Graphics g, Color color, float width, float x, float y, float w, float h, float r)
    {
      using (GraphicsPath path = Round(x, y, w, h, r))
      using (Pen pen = new Pen(color, width)) { g.DrawPath(pen, path); }
    }

    public static void Disc(Graphics g, Color color, float cx, float cy, float radius)
    {
      g.FillEllipse(Brs(color), cx - radius, cy - radius, radius * 2f, radius * 2f);
    }

    public static Pen Line(Color color, float width)
    {
      Pen pen = new Pen(color, width);
      pen.StartCap = LineCap.Round;
      pen.EndCap = LineCap.Round;
      pen.LineJoin = LineJoin.Round;
      return pen;
    }

    /// <summary>Un texte dans un cadre ; trop long, il se termine par « … ».</summary>
    public static void Text(Graphics g, string text, Font font, Color color, float x, float y, float w, float h, StringFormat format)
    {
      if (string.IsNullOrEmpty(text) || w < 2f) return;
      g.DrawString(text, font, Brs(Fx(color)), new RectangleF(x, y, w, h), format);
    }

    public static float Measure(Graphics g, string text, Font font)
    {
      if (string.IsNullOrEmpty(text)) return 0f;
      return g.MeasureString(text, font, 10000, StringFormat.GenericTypographic).Width;
    }

    /// <summary>La hauteur d'un texte qui passe à la ligne dans une largeur donnée.</summary>
    public static float MeasureHeight(Graphics g, string text, Font font, float width)
    {
      if (string.IsNullOrEmpty(text)) return 0f;
      return g.MeasureString(text, font, (int)Math.Max(20f, width), Wrap).Height + 2f;
    }

    public static string Shorten(string text, int max)
    {
      if (text == null) return "";
      return text.Length > max ? text.Substring(0, max - 1).TrimEnd() + "…" : text;
    }

    // ------------------------------------------------------------------------------------------------------------
    // Les petites icônes, toutes dessinées : aucune police de symboles.
    // ------------------------------------------------------------------------------------------------------------

    /// <summary>Une coche. progress (0 à 1) la trace peu à peu.</summary>
    public static void Tick(Graphics g, Color color, float cx, float cy, float size, float width, float progress)
    {
      PointF a = new PointF(cx - size * 0.32f, cy + size * 0.02f);
      PointF b = new PointF(cx - size * 0.08f, cy + size * 0.27f);
      PointF c = new PointF(cx + size * 0.34f, cy - size * 0.24f);
      float first = 0.38f;
      using (Pen pen = Line(color, width))
      {
        if (progress <= 0f) return;
        if (progress < first)
        {
          float k = progress / first;
          g.DrawLine(pen, a, new PointF(a.X + (b.X - a.X) * k, a.Y + (b.Y - a.Y) * k));
        }
        else
        {
          float k = Math.Min(1f, (progress - first) / (1f - first));
          g.DrawLines(pen, new PointF[] { a, b, new PointF(b.X + (c.X - b.X) * k, b.Y + (c.Y - b.Y) * k) });
        }
      }
    }

    public static void Cross(Graphics g, Color color, float cx, float cy, float half, float width)
    {
      using (Pen pen = Line(color, width))
      {
        g.DrawLine(pen, cx - half, cy - half, cx + half, cy + half);
        g.DrawLine(pen, cx - half, cy + half, cx + half, cy - half);
      }
    }

    public static void Star(Graphics g, Color color, float cx, float cy, float radius)
    {
      PointF[] points = new PointF[10];
      for (int i = 0; i < 10; i++)
      {
        double angle = -Math.PI / 2 + i * Math.PI / 5;
        float r = (i % 2 == 0) ? radius : radius * 0.45f;
        points[i] = new PointF(cx + (float)Math.Cos(angle) * r, cy + (float)Math.Sin(angle) * r);
      }
      g.FillPolygon(Brs(color), points);
    }

    public static void Clock(Graphics g, Color color, float cx, float cy, float radius)
    {
      using (Pen pen = Line(color, 1.5f))
      {
        g.DrawEllipse(pen, cx - radius, cy - radius, radius * 2f, radius * 2f);
        g.DrawLine(pen, cx, cy, cx, cy - radius * 0.6f);
        g.DrawLine(pen, cx, cy, cx + radius * 0.5f, cy + radius * 0.25f);
      }
    }

    public static void Bang(Graphics g, Color color, float cx, float cy, float size)
    {
      using (Pen pen = Line(color, 1.8f))
      {
        g.DrawLine(pen, cx, cy - size * 0.45f, cx, cy + size * 0.1f);
        g.DrawLine(pen, cx, cy + size * 0.38f, cx, cy + size * 0.4f);
      }
    }

    public static void Warning(Graphics g, Color color, float cx, float cy, float size)
    {
      PointF[] triangle = new PointF[] { new PointF(cx, cy - size * 0.5f), new PointF(cx + size * 0.5f, cy + size * 0.42f), new PointF(cx - size * 0.5f, cy + size * 0.42f) };
      using (Pen pen = new Pen(color, 1.8f))
      {
        pen.LineJoin = LineJoin.Round;
        g.DrawPolygon(pen, triangle);
      }
      Bang(g, color, cx, cy + size * 0.06f, size * 0.62f);
    }

    public static void Envelope(Graphics g, Color color, float cx, float cy, float w)
    {
      float h = w * 0.7f;
      using (Pen pen = Line(color, 1.5f))
      using (GraphicsPath path = Round(cx - w / 2f, cy - h / 2f, w, h, 2.5f))
      {
        g.DrawPath(pen, path);
        g.DrawLines(pen, new PointF[] { new PointF(cx - w / 2f + 1f, cy - h / 2f + 1.5f), new PointF(cx, cy + h * 0.1f), new PointF(cx + w / 2f - 1f, cy - h / 2f + 1.5f) });
      }
    }

    public static void Pin(Graphics g, Color color, float cx, float cy, float size, bool filled)
    {
      using (Pen pen = Line(color, 1.6f))
      {
        float head = size * 0.28f;
        if (filled) g.FillEllipse(Brs(color), cx - head, cy - size * 0.38f, head * 2f, head * 2f);
        else g.DrawEllipse(pen, cx - head, cy - size * 0.38f, head * 2f, head * 2f);
        g.DrawLine(pen, cx, cy + size * 0.12f, cx, cy + size * 0.42f);
      }
    }

    public static void Minus(Graphics g, Color color, float cx, float cy, float half)
    {
      using (Pen pen = Line(color, 1.8f)) { g.DrawLine(pen, cx - half, cy, cx + half, cy); }
    }

    public static void Chevron(Graphics g, Color color, float cx, float cy, float half, bool down)
    {
      float d = down ? 1f : -1f;
      using (Pen pen = Line(color, 1.8f)) { g.DrawLines(pen, new PointF[] { new PointF(cx - half, cy - d * half * 0.45f), new PointF(cx, cy + d * half * 0.45f), new PointF(cx + half, cy - d * half * 0.45f) }); }
    }

    public static void Arrow(Graphics g, Color color, float x, float cy, float length)
    {
      using (Pen pen = Line(color, 2f))
      {
        g.DrawLine(pen, x, cy, x + length, cy);
        g.DrawLines(pen, new PointF[] { new PointF(x + length - 4.5f, cy - 4.5f), new PointF(x + length, cy), new PointF(x + length - 4.5f, cy + 4.5f) });
      }
    }

    /// <summary>Un flacon gris : la place d'un produit sans photo.</summary>
    public static void Bottle(Graphics g, float x, float y, float size)
    {
      Fill(g, Color.FromArgb(230, 238, 242), x, y, size, size, size * 0.22f);
      Color body = Color.FromArgb(190, 205, 214);
      float w = size * 0.42f;
      float h = size * 0.5f;
      Fill(g, body, x + (size - w * 0.5f) / 2f, y + size * 0.14f, w * 0.5f, size * 0.12f, 2f);
      Fill(g, body, x + (size - w) / 2f, y + size * 0.27f, w, h, size * 0.1f);
    }

    /// <summary>Une pastille : texte, fond, et une petite icône (1 étoile, 2 horloge, 3 coche, 4 point d'exclamation, 5 croix). Renvoie sa largeur.</summary>
    public static float Pill(Graphics g, float x, float y, string text, Color back, Color fore, int icon, bool draw)
    {
      Font font = Fnt(11.5f, FontStyle.Bold);
      float textWidth = Measure(g, text, font);
      float iconWidth = icon > 0 ? 15f : 0f;
      float width = 9f + iconWidth + textWidth + 10f;
      if (!draw) return width;
      Fill(g, Fx(back), x, y, width, 22f, 11f);
      float ix = x + 9f + 5f;
      float iy = y + 11f;
      if (icon == 1) Star(g, Fx(Pal.ChallengeIcon), ix, iy, 6f);
      else if (icon == 2) Clock(g, Fx(fore), ix, iy, 5.2f);
      else if (icon == 3) Tick(g, Fx(fore), ix, iy, 13f, 1.9f, 1f);
      else if (icon == 4) Bang(g, Fx(fore), ix, iy, 12f);
      else if (icon == 5) Cross(g, Fx(fore), ix, iy, 3.6f, 1.8f);
      Text(g, text, font, fore, x + 9f + iconWidth, y + 3.2f, textWidth + 4f, 18f, Left);
      return width;
    }
  }

  /// <summary>La mascotte PharmaBoost : un petit robot casqué, une croix verte, une antenne qui pulse. Dessinée en vectoriel, jamais une image.</summary>
  internal static class Mascot
  {
    /// <summary>mood : idle, alert, think, idea, happy. x, y : coin haut-gauche de la boîte carrée de côté size.</summary>
    public static void Draw(Graphics g, float x, float y, float size, string mood, double t)
    {
      float u = size / 100f;
      float bob = (float)Math.Sin(t * 2.2) * 2.2f;
      if (mood == "alert") bob = (float)Math.Sin(t * 11) * 1.2f - 1.5f;
      GraphicsState saved = g.Save();
      g.TranslateTransform(x, y + bob * u);
      g.ScaleTransform(u, u);
      Body(g, mood, t);
      g.Restore(saved);
    }

    private static void Body(Graphics g, string mood, double t)
    {
      float pulse = (float)(0.5 + 0.5 * Math.Sin(t * (mood == "think" ? 9.0 : 3.2)));
      Color lamp = mood == "alert" ? Color.FromArgb(255, 245, 176, 40) : Pal.Eye;

      // Antenne et sa petite lampe qui pulse.
      using (Pen stem = Gfx.Line(Pal.ShellEdge, 3f)) { g.DrawLine(stem, 50, 17, 50, 8); }
      Gfx.Disc(g, Color.FromArgb((int)(40 + 90 * pulse), lamp), 50, 6, 5f + 4f * pulse);
      Gfx.Disc(g, lamp, 50, 6, 3.6f);

      // Le casque : arceau et deux écouteurs.
      using (Pen band = Gfx.Line(Pal.Ear, 5f)) { g.DrawArc(band, 9, 9, 82, 70, 192, 156); }
      Gfx.Gradient(g, Pal.Ear, Color.FromArgb(255, 18, 150, 140), 3, 36, 15, 28, 7);
      Gfx.Gradient(g, Pal.Ear, Color.FromArgb(255, 18, 150, 140), 82, 36, 15, 28, 7);

      // La tête : coque claire, écran sombre.
      Gfx.Gradient(g, Pal.ShellTop, Pal.ShellBottom, 14, 16, 72, 58, 24);
      Gfx.Stroke(g, Pal.ShellEdge, 1.6f, 14, 16, 72, 58, 24);
      Gfx.Gradient(g, Pal.ScreenTop, Pal.ScreenBottom, 22, 25, 56, 40, 17);

      // Les yeux : ils clignent de temps en temps.
      bool blink = (t % 4.6) > 4.46;
      float eyeY = 42f;
      float shift = 0f;
      float eyeW = 9f;
      float eyeH = 12f;
      if (mood == "think") { shift = (float)Math.Sin(t * 2.6) * 3.5f; eyeW = 8f; eyeH = 10f; }
      if (mood == "alert") { eyeW = 11f; eyeH = 15f; }
      float[] centers = new float[] { 38f, 62f };
      foreach (float cx in centers)
      {
        if (mood == "happy" || mood == "idea")
        {
          using (Pen arc = Gfx.Line(Pal.Eye, 3.2f)) { g.DrawArc(arc, cx - 5.5f, eyeY - 4f, 11f, 10f, 190, 160); }
        }
        else
        {
          float h = blink ? 2f : eyeH;
          g.FillEllipse(Gfx.Brs(Pal.Eye), cx + shift - eyeW / 2f, eyeY - h / 2f, eyeW, h);
          if (!blink) g.FillEllipse(Gfx.Brs(Color.FromArgb(210, 255, 255, 255)), cx + shift - 3f, eyeY - eyeH / 2f + 2f, 3.2f, 3.2f);
        }
      }

      // La bouche.
      if (mood == "happy" || mood == "idea")
      {
        g.FillPie(Gfx.Brs(Pal.Eye), 41, 46, 18, 14, 0, 180);
      }
      else if (mood == "alert")
      {
        using (Pen ring = Gfx.Line(Pal.Eye, 2.4f)) { g.DrawEllipse(ring, 46, 51, 8, 9); }
      }
      else if (mood == "think")
      {
        using (Pen flat = Gfx.Line(Pal.Eye, 2.6f)) { g.DrawLine(flat, 44, 55, 56, 55); }
      }
      else
      {
        using (Pen smile = Gfx.Line(Pal.Eye, 2.6f)) { g.DrawArc(smile, 43, 47, 14, 9, 20, 140); }
      }

      // Le badge : la croix verte de la pharmacie.
      Gfx.Disc(g, Color.FromArgb(235, 255, 255, 255), 74, 69, 15f);
      using (GraphicsPath badge = new GraphicsPath())
      {
        badge.AddEllipse(60.5f, 55.5f, 27f, 27f);
        using (LinearGradientBrush fill = new LinearGradientBrush(new RectangleF(60f, 55f, 28f, 28f), Pal.Accent, Pal.AccentDark, LinearGradientMode.Vertical)) { g.FillPath(fill, badge); }
      }
      g.FillRectangle(Gfx.Brs(Color.White), 72.2f, 61f, 3.6f, 16f);
      g.FillRectangle(Gfx.Brs(Color.White), 66f, 67.2f, 16f, 3.6f);

      // Une idée : une étincelle qui scintille près de l'antenne.
      if (mood == "idea")
      {
        float twinkle = (float)(0.6 + 0.4 * Math.Sin(t * 6));
        Gfx.Star(g, Color.FromArgb((int)(255 * twinkle), 255, 214, 90), 80, 14, 6f + 2f * twinkle);
      }
    }
  }

  /// <summary>
  /// La bannière. Une fenêtre « à calque » : l'image entière (carte, ombre, texte, mascotte) est dessinée à chaque image puis posée
  /// d'un coup sur l'écran avec sa transparence par pixel. Elle ne prend jamais le clavier ni le focus.
  /// </summary>
  public class BannerForm : Form
  {
    public event Action<string> Word;
    public event Action Changed;
    public event Action EmailRequested;
    public event Action<string> DoneEnded;
    public event Action Ended;

    private readonly float scale;
    private readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();
    private readonly Stopwatch clock = Stopwatch.StartNew();
    private readonly List<Hit> hits = new List<Hit>();
    private readonly Dictionary<string, Image> photos = new Dictionary<string, Image>();
    private readonly Bitmap measureBitmap = new Bitmap(4, 4);
    private readonly Graphics measure;
    private Bitmap buffer;

    private int state = St.Idle;
    private double stateStart;
    private Entry entry;
    private DoneInfo done;
    private bool started;
    private bool sessionOpen;
    private bool analyzing;
    private bool finishing;
    private bool userReduced;
    private bool hidden;
    private bool pinned;
    private bool failed;
    private string hiddenSale = "";
    private double analyzeStart;
    private float fade = 1f;
    private float curW = Dim.WidthIdle;
    private float curH = Dim.HeightIdle;
    private bool sized;
    private float scrollY;
    private float listHeight;
    private Hit hover;
    private Hit pressed;
    private bool dragging;
    private bool dragMoved;
    private Point dragStart;
    private int dragAnchorX;
    private int dragAnchorY;
    private int anchorX;
    private int anchorY;
    private int windowX;
    private int windowY;
    private string positionFile = "";
    private string position = "haut-droite";
    private double lastTick;
    private double lastTop;

    public BannerForm()
    {
      float found = 1f;
      using (Graphics g = Graphics.FromHwnd(IntPtr.Zero)) { found = g.DpiX / 96f; }
      scale = found < 1f ? 1f : found;
      measure = Graphics.FromImage(measureBitmap);
      measure.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
      FormBorderStyle = FormBorderStyle.None;
      ShowInTaskbar = false;
      TopMost = true;
      StartPosition = FormStartPosition.Manual;
      SetStyle(ControlStyles.Selectable, false);
      timer.Interval = 60;
      timer.Tick += delegate
      {
        try { Tick(); }
        catch (Exception problem) { Fail(problem); }
      };
    }

    protected override bool ShowWithoutActivation { get { return true; } }

    protected override CreateParams CreateParams
    {
      get
      {
        CreateParams p = base.CreateParams;
        // WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW | WS_EX_LAYERED : jamais dans la barre des tâches ni dans Alt+Tab, jamais activée,
        // dessinée pixel par pixel avec sa transparence.
        p.ExStyle |= 0x08000000 | 0x00000080 | 0x00080000;
        return p;
      }
    }

    protected override void WndProc(ref Message m)
    {
      // WM_MOUSEACTIVATE : même un clic sur un bouton de la bannière n'active pas la fenêtre (MA_NOACTIVATE).
      if (m.Msg == 0x0021) { m.Result = (IntPtr)3; return; }
      base.WndProc(ref m);
    }

    protected override void OnPaintBackground(PaintEventArgs e) { }
    protected override void OnPaint(PaintEventArgs e) { }

    private int S(float value) { return (int)Math.Round(value * scale); }
    private double Now() { return clock.Elapsed.TotalSeconds; }

    private void Say(string text)
    {
      if (Word != null) Word(text);
    }

    private void Fail(Exception problem)
    {
      if (failed) return;
      failed = true;
      timer.Stop();
      string text = problem.GetType().Name + " " + problem.Message;
      Say("ERREUR dessin " + Gfx.Shorten(text.Replace("\r", " ").Replace("\n", " "), 140));
    }

    // ------------------------------------------------------------------------------------------------------------
    // Ce que l'agent demande.
    // ------------------------------------------------------------------------------------------------------------

    /// <summary>La bannière apparaît, « En attente de scan… », là où le pharmacien l'a laissée (sinon en haut à droite).</summary>
    public void Start(string file, string where)
    {
      if (!string.IsNullOrEmpty(file)) positionFile = file;
      if (!string.IsNullOrEmpty(where)) position = where;
      if (started) return;
      started = true;
      Place();
      lastTick = Now();
      stateStart = Now();
      timer.Start();
      if (!hidden) ShowCard();
    }

    public bool Started { get { return started; } }
    public bool Hidden { get { return hidden; } }
    public bool Reduced { get { return userReduced; } }
    public bool Pinned { get { return pinned; } }
    public bool SaleOpen { get { return sessionOpen && entry != null; } }
    public string SaleId { get { return entry != null ? entry.Id : ""; } }
    public string SaleUrl { get { return entry != null ? entry.Url : ""; } }

    public int Unanswered()
    {
      int count = 0;
      if (entry == null || !sessionOpen) return 0;
      foreach (Item item in entry.Items) { if (item.Outcome == "NONE") count++; }
      return count;
    }

    /// <summary>Un scan vient d'être envoyé : « Scan détecté ! Analyse en cours… ».</summary>
    public void BeginScan()
    {
      if (!started) return;
      analyzeStart = Now();
      if (sessionOpen) { analyzing = true; return; }
      SetState(St.Scanning);
    }

    /// <summary>
    /// Une vente arrive ou se met à jour. Une vente n'a qu'UNE bannière, mise à jour sur place, qui reste jusqu'à « Vente terminée ».
    /// Seule une information NOUVELLE (un autre produit, une autre alerte) rouvre la bannière réduite.
    /// </summary>
    public void ApplyEntry(Entry e)
    {
      if (!started) return;
      Entry existing = (entry != null && entry.Id == e.Id) ? entry : null;
      List<string> known = new List<string>();
      if (existing != null) known.AddRange(existing.Shown);
      List<string> fresh = new List<string>();
      foreach (Item item in e.Items) { string key = "p:" + item.Name; if (!known.Contains(key)) fresh.Add(key); }
      foreach (string alert in e.Alerts) { string key = "a:" + alert; if (!known.Contains(key)) fresh.Add(key); }
      e.Shown.AddRange(known);
      e.Shown.AddRange(fresh);
      if (existing != null) e.Since = existing.Since;
      bool sameSale = existing != null;
      analyzing = false;
      finishing = false;
      done = null;
      if (e.Quiet && !(sameSale && sessionOpen))
      {
        // Rien à conseiller : un mot de quelques secondes, sans session ni compteur.
        entry = e;
        sessionOpen = false;
        SetState(St.Quiet);
        return;
      }
      if (hidden && hiddenSale != e.Id) { hidden = false; ShowCard(); }
      entry = e;
      sessionOpen = true;
      if (!sameSale) { userReduced = false; SetState(St.Ready); }
      else if (fresh.Count > 0) { userReduced = false; if (state != St.Expanded) SetState(St.Expanded); }
      else if (state != St.Expanded && state != St.Ready) SetState(St.Expanded);
      if (Changed != null) Changed();
    }

    /// <summary>« Vente terminée » est enregistrée : le message de fin reste quelques secondes, puis la bannière redevient « en attente ».</summary>
    public void ApplyDone(DoneInfo info)
    {
      if (entry == null || entry.Id != info.Id) return;
      sessionOpen = false;
      analyzing = false;
      finishing = false;
      done = info;
      SetState(St.Done);
      if (Changed != null) Changed();
    }

    public void RemoveSale(string id)
    {
      if (entry == null || entry.Id != id) return;
      EndSale();
    }

    /// <summary>Une vente restée ouverte plus de trois heures n'est plus une vente : la bannière s'en détache.</summary>
    public void Expire()
    {
      if (entry != null && sessionOpen && DateTime.Now - entry.Since > TimeSpan.FromHours(3)) EndSale();
    }

    private void EndSale()
    {
      entry = null;
      done = null;
      sessionOpen = false;
      analyzing = false;
      finishing = false;
      SetState(St.Idle);
      if (Ended != null) Ended();
      if (Changed != null) Changed();
    }

    public void SetReduced(bool value)
    {
      if (userReduced == value) return;
      userReduced = value;
      fade = 0.3f;
      if (Changed != null) Changed();
    }

    public void SetPinned(bool value)
    {
      pinned = value;
      if (Changed != null) Changed();
    }

    /// <summary>Masquée à la main : la bannière disparaît jusqu'à la prochaine vente qui porte un conseil (ou un clic sur l'icône près de l'horloge).</summary>
    public void HideByUser()
    {
      hidden = true;
      hiddenSale = entry != null ? entry.Id : "";
      if (Visible) Hide();
      if (Changed != null) Changed();
    }

    public void Reveal()
    {
      hidden = false;
      userReduced = false;
      if (!started) return;
      fade = 0.3f;
      ShowCard();
      if (Changed != null) Changed();
    }

    private void ShowCard()
    {
      if (hidden) return;
      if (!Visible) Show();
      Native.SetWindowPos(Handle, Native.HWND_TOPMOST, 0, 0, 0, 0, Native.SWP_NOMOVE | Native.SWP_NOSIZE | Native.SWP_NOACTIVATE | Native.SWP_SHOWWINDOW);
      Redraw();
    }

    private void SetState(int next)
    {
      state = next;
      stateStart = Now();
      fade = 0.12f;
      if (next == St.Expanded) scrollY = 0f;
    }

    // ------------------------------------------------------------------------------------------------------------
    // Le temps : minuteries d'état, animation de la taille, une image par tic.
    // ------------------------------------------------------------------------------------------------------------

    private bool IsReduced { get { return userReduced && state != St.Done; } }

    private void Tick()
    {
      double now = Now();
      double dt = Math.Min(0.25, Math.Max(0.0, now - lastTick));
      lastTick = now;
      double age = now - stateStart;

      if (state == St.Ready && age * 1000.0 > Tim.ReadyPauseMs) SetState(St.Expanded);
      else if (state == St.Quiet && age * 1000.0 > Tim.QuietMs) { entry = null; SetState(St.Idle); if (Changed != null) Changed(); }
      else if (state == St.Scanning && age * 1000.0 > Tim.ScanTimeoutMs) SetState(St.Idle);
      else if (state == St.Done && age * 1000.0 > Tim.DoneMs)
      {
        string finished = done != null ? done.Id : "";
        done = null;
        entry = null;
        sessionOpen = false;
        SetState(St.Idle);
        if (DoneEnded != null) DoneEnded(finished);
        if (Ended != null) Ended();
        if (Changed != null) Changed();
      }
      if (analyzing && now - analyzeStart > Tim.ScanTimeoutMs / 1000.0) analyzing = false;

      if (fade < 1f) fade = Math.Min(1f, fade + (float)(dt / 0.2));
      bool moving = AnimateSize(dt);
      bool visible = Visible && !hidden;
      bool busy = moving || fade < 1f || dragging || state == St.Done || state == St.Scanning;
      int wanted = !visible ? 250 : (busy ? 1000 / Tim.MotionFps : 1000 / Tim.IdleFps);
      if (timer.Interval != wanted) timer.Interval = wanted;
      if (!visible) return;

      // D'autres fenêtres « toujours au premier plan » peuvent passer devant : on se remet devant, sans prendre le focus.
      if (now - lastTop > 2.0)
      {
        lastTop = now;
        ClampAnchor();
        Native.SetWindowPos(Handle, Native.HWND_TOPMOST, 0, 0, 0, 0, Native.SWP_NOMOVE | Native.SWP_NOSIZE | Native.SWP_NOACTIVATE);
      }
      Redraw();
    }

    private void Targets(out float tw, out float th)
    {
      if (IsReduced) { tw = Dim.WidthReduced; th = Dim.HeightReduced; return; }
      if (state == St.Ready) { tw = Dim.WidthReady; th = Dim.HeightReady; return; }
      if (state == St.Expanded && entry != null)
      {
        tw = Dim.WidthExpanded;
        th = ExpandedHeight(tw);
        return;
      }
      if (state == St.Done && done != null)
      {
        tw = Dim.WidthDone;
        th = DoneHeight(tw);
        return;
      }
      tw = Dim.WidthIdle;
      th = Dim.HeightIdle;
    }

    private bool AnimateSize(double dt)
    {
      float tw;
      float th;
      Targets(out tw, out th);
      if (!sized) { curW = tw; curH = th; sized = true; return false; }
      double k = 1.0 - Math.Pow(1.0 - Tim.Ease, dt * 60.0);
      bool moving = false;
      curW += (float)((tw - curW) * k);
      curH += (float)((th - curH) * k);
      if (Math.Abs(tw - curW) < 0.6f) curW = tw; else moving = true;
      if (Math.Abs(th - curH) < 0.6f) curH = th; else moving = true;
      return moving;
    }

    private float MaxCardHeight()
    {
      Rectangle area = Screen.FromPoint(new Point(anchorX - S(30), anchorY + S(20))).WorkingArea;
      return Math.Max(260f, area.Height * 0.9f / scale - 2 * Dim.Margin);
    }

    // ------------------------------------------------------------------------------------------------------------
    // Où elle est : en haut à droite, ou là où le pharmacien l'a posée.
    // ------------------------------------------------------------------------------------------------------------

    private void Place()
    {
      Rectangle area = Screen.PrimaryScreen.WorkingArea;
      // Sous la barre de titre d'un logiciel plein écran : ses boutons Réduire / Fermer restent libres.
      anchorX = area.Right - S(18);
      anchorY = area.Top + SystemInformation.CaptionHeight + S(10);
      if (position == "milieu-droite") anchorY = area.Top + area.Height / 2 - S(150);
      else if (position == "bas-droite") anchorY = area.Bottom - S(330);
      try
      {
        if (!string.IsNullOrEmpty(positionFile) && File.Exists(positionFile))
        {
          string[] parts = File.ReadAllText(positionFile).Trim().Split(',');
          if (parts.Length == 2)
          {
            Point saved = new Point(int.Parse(parts[0]), int.Parse(parts[1]));
            foreach (Screen screen in Screen.AllScreens)
            {
              if (screen.WorkingArea.Contains(new Point(saved.X - S(40), saved.Y + S(20)))) { anchorX = saved.X; anchorY = saved.Y; break; }
            }
          }
        }
      }
      catch (Exception) { }
      ClampAnchor();
    }

    private void ClampAnchor()
    {
      Rectangle area = Screen.FromPoint(new Point(anchorX - S(30), anchorY + S(20))).WorkingArea;
      if (anchorX > area.Right) anchorX = area.Right;
      if (anchorX < area.Left + S(80)) anchorX = area.Left + S(80);
      if (anchorY < area.Top) anchorY = area.Top;
      if (anchorY > area.Bottom - S(60)) anchorY = area.Bottom - S(60);
    }

    private void SavePosition()
    {
      try { if (!string.IsNullOrEmpty(positionFile)) File.WriteAllText(positionFile, anchorX + "," + anchorY); } catch (Exception) { }
    }

    /// <summary>La carte à l'écran, en pixels : pour poser le champ e-mail juste dessous.</summary>
    public Rectangle CardBounds()
    {
      return new Rectangle(windowX + S(Dim.Margin), windowY + S(Dim.Margin), S(curW), S(curH));
    }

    // ------------------------------------------------------------------------------------------------------------
    // La souris : survol, clic, déplacement, molette.
    // ------------------------------------------------------------------------------------------------------------

    private Hit HitAt(int px, int py)
    {
      float x = px / scale;
      float y = py / scale;
      for (int i = hits.Count - 1; i >= 0; i--)
      {
        if (hits[i].R.Contains(x, y)) return hits[i];
      }
      return null;
    }

    private bool InCard(int px, int py)
    {
      float x = px / scale;
      float y = py / scale;
      return x >= Dim.Margin && x <= Dim.Margin + curW && y >= Dim.Margin && y <= Dim.Margin + curH;
    }

    private static bool Same(Hit a, Hit b)
    {
      if (a == null || b == null) return a == b;
      return a.Kind == b.Kind && a.Item == b.Item && a.Tag == b.Tag;
    }

    protected override void OnMouseMove(MouseEventArgs e)
    {
      base.OnMouseMove(e);
      if (dragging)
      {
        Point now = Cursor.Position;
        if (!dragMoved && Math.Abs(now.X - dragStart.X) + Math.Abs(now.Y - dragStart.Y) < S(4)) return;
        dragMoved = true;
        anchorX = dragAnchorX + now.X - dragStart.X;
        anchorY = dragAnchorY + now.Y - dragStart.Y;
        ClampAnchor();
        Redraw();
        return;
      }
      Hit now2 = HitAt(e.X, e.Y);
      if (!Same(now2, hover))
      {
        hover = now2;
        Cursor = now2 != null ? Cursors.Hand : Cursors.Default;
        Redraw();
      }
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
      base.OnMouseDown(e);
      if (e.Button != MouseButtons.Left || !InCard(e.X, e.Y)) return;
      pressed = HitAt(e.X, e.Y);
      if (pressed == null && !pinned)
      {
        dragging = true;
        dragMoved = false;
        dragStart = Cursor.Position;
        dragAnchorX = anchorX;
        dragAnchorY = anchorY;
      }
      Redraw();
    }

    protected override void OnMouseUp(MouseEventArgs e)
    {
      base.OnMouseUp(e);
      if (e.Button != MouseButtons.Left) return;
      bool moved = dragging && dragMoved;
      dragging = false;
      Hit up = HitAt(e.X, e.Y);
      Hit down = pressed;
      pressed = null;
      if (moved) { SavePosition(); Redraw(); return; }
      if (down != null && up != null && Same(down, up)) Perform(up);
      else if (down == null && up == null && InCard(e.X, e.Y)) Backdrop();
      Redraw();
    }

    protected override void OnMouseLeave(EventArgs e)
    {
      base.OnMouseLeave(e);
      hover = null;
      pressed = null;
      Cursor = Cursors.Default;
      Redraw();
    }

    protected override void OnMouseWheel(MouseEventArgs e)
    {
      base.OnMouseWheel(e);
      if (state != St.Expanded || IsReduced) return;
      scrollY -= e.Delta / 120f * 44f;
      Redraw();
    }

    /// <summary>Un clic dans le vide de la carte : une bannière réduite ou « prête » s'ouvre.</summary>
    private void Backdrop()
    {
      if (IsReduced) { SetReduced(false); return; }
      if (state == St.Ready) SetState(St.Expanded);
    }

    private void Perform(Hit h)
    {
      if (h.Kind == "pin") SetPinned(!pinned);
      else if (h.Kind == "min") SetReduced(true);
      else if (h.Kind == "expand") SetReduced(false);
      else if (h.Kind == "close") HideByUser();
      else if (h.Kind == "see") SetState(St.Expanded);
      else if (h.Kind == "vendu") Choose(h.Item, "SOLD");
      else if (h.Kind == "nonvendu") Choose(h.Item, "NOT_SOLD");
      else if (h.Kind == "modifier") Choose(h.Item, "NONE");
      else if (h.Kind == "answer") Answer(h.Tag);
      else if (h.Kind == "detail") { if (entry != null) Say("VOIR " + entry.Id); }
      else if (h.Kind == "email") { if (EmailRequested != null) EmailRequested(); }
      else if (h.Kind == "emailRemove")
      {
        if (entry != null) { Say("EMAIL_RETIRER " + entry.Id); entry.EmailSaved = false; }
      }
      else if (h.Kind == "finish")
      {
        if (finishing || entry == null) return;
        finishing = true;
        Say("TERMINER " + entry.Id);
      }
    }

    /// <summary>Un choix de réponse : il se coche (ou se décoche) tout de suite à l'écran, puis part à PharmaBoost, qui renvoie les questions suivantes.</summary>
    private void Answer(string tag)
    {
      if (entry == null || tag == null) return;
      int cut = tag.IndexOf(':');
      if (cut <= 0) return;
      string node = tag.Substring(0, cut);
      string key = tag.Substring(cut + 1);
      foreach (Question q in entry.Questions)
      {
        if (q.Node != node) continue;
        foreach (Choice c in q.Choices)
        {
          if (c.Key == key) c.Selected = !c.Selected;
          else if (!q.Multi) c.Selected = false;
        }
      }
      Say("REPONSE " + entry.Id + " " + tag);
      if (Changed != null) Changed();
    }

    private void Choose(Item item, string outcome)
    {
      if (entry == null || item == null || item.Id.Length == 0) return;
      item.Outcome = outcome;
      Say((outcome == "SOLD" ? "VENDU " : outcome == "NOT_SOLD" ? "NONVENDU " : "ANNULER ") + entry.Id + " " + item.Id);
      if (Changed != null) Changed();
    }

    /// <summary>L'adresse a été enregistrée par l'agent : le champ se range.</summary>
    public void MarkEmailSaved()
    {
      if (entry != null) entry.EmailSaved = true;
    }

    // ------------------------------------------------------------------------------------------------------------
    // Le dessin d'une image, puis sa pose à l'écran.
    // ------------------------------------------------------------------------------------------------------------

    private void Redraw()
    {
      if (!started || hidden || failed || !IsHandleCreated || !Visible) return;
      int pw = (int)Math.Ceiling((curW + 2 * Dim.Margin) * scale);
      int ph = (int)Math.Ceiling((curH + 2 * Dim.Margin) * scale);
      if (pw < 8 || ph < 8) return;
      if (buffer == null || buffer.Width != pw || buffer.Height != ph)
      {
        if (buffer != null) buffer.Dispose();
        buffer = new Bitmap(pw, ph, PixelFormat.Format32bppPArgb);
      }
      using (Graphics g = Graphics.FromImage(buffer))
      {
        g.Clear(Color.Transparent);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.PixelOffsetMode = PixelOffsetMode.HighQuality;
        g.InterpolationMode = InterpolationMode.HighQualityBicubic;
        g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
        g.ScaleTransform(scale, scale);
        Compose(g);
      }

      // La carte reste entière à l'écran : si elle grandit vers le bas au-delà de l'écran, elle remonte.
      Rectangle area = Screen.FromPoint(new Point(anchorX - S(30), anchorY + S(20))).WorkingArea;
      int cardHeight = (int)Math.Ceiling(curH * scale);
      int top = anchorY;
      int limit = area.Bottom - S(8);
      if (top + cardHeight > limit) top = Math.Max(area.Top, limit - cardHeight);
      windowX = anchorX + S(Dim.Margin) - pw;
      windowY = top - S(Dim.Margin);
      Push(pw, ph);
    }

    private void Push(int pw, int ph)
    {
      IntPtr screenDc = Native.GetDC(IntPtr.Zero);
      IntPtr memoryDc = Native.CreateCompatibleDC(screenDc);
      IntPtr bitmap = IntPtr.Zero;
      IntPtr old = IntPtr.Zero;
      try
      {
        bitmap = buffer.GetHbitmap(Color.FromArgb(0));
        old = Native.SelectObject(memoryDc, bitmap);
        SIZE size = new SIZE(pw, ph);
        POINT source = new POINT(0, 0);
        POINT target = new POINT(windowX, windowY);
        BLENDFUNCTION blend = new BLENDFUNCTION();
        blend.BlendOp = 0;
        blend.BlendFlags = 0;
        blend.SourceConstantAlpha = 255;
        blend.AlphaFormat = 1;
        // ULW_ALPHA : la transparence de chaque pixel est celle de l'image.
        Native.UpdateLayeredWindow(Handle, screenDc, ref target, ref size, memoryDc, ref source, 0, ref blend, 2);
      }
      finally
      {
        if (bitmap != IntPtr.Zero) { Native.SelectObject(memoryDc, old); Native.DeleteObject(bitmap); }
        Native.DeleteDC(memoryDc);
        Native.ReleaseDC(IntPtr.Zero, screenDc);
      }
    }

    private void Compose(Graphics g)
    {
      Gfx.Trim();
      Gfx.Fade = 1f;
      hits.Clear();
      float x = Dim.Margin;
      float y = Dim.Margin;
      float w = curW;
      float h = curH;
      DrawShadow(g, x, y, w, h);
      using (GraphicsPath card = Gfx.Round(x, y, w, h, Dim.Radius))
      {
        Color top = Color.FromArgb((int)Math.Round(255 * Pal.CardAlpha), Pal.CardTop);
        Color bottom = Color.FromArgb((int)Math.Round(255 * Pal.CardAlpha), Pal.CardBottom);
        using (LinearGradientBrush fill = new LinearGradientBrush(new RectangleF(x, y - 0.5f, w, h + 1f), top, bottom, LinearGradientMode.Vertical)) { g.FillPath(fill, card); }
        GraphicsState saved = g.Save();
        g.SetClip(card, CombineMode.Intersect);
        // La lumière douce derrière la mascotte, et un reflet de verre sur le haut de la carte.
        using (GraphicsPath halo = new GraphicsPath())
        {
          halo.AddEllipse(x - 40f, y - 50f, 230f, 200f);
          using (PathGradientBrush glow = new PathGradientBrush(halo))
          {
            glow.CenterColor = Color.FromArgb(58, Pal.Glow);
            glow.SurroundColors = new Color[] { Color.FromArgb(0, Pal.Glow) };
            g.FillPath(glow, halo);
          }
        }
        using (LinearGradientBrush sheen = new LinearGradientBrush(new RectangleF(x, y - 0.5f, w, Math.Min(h, 46f) + 1f), Color.FromArgb(30, 255, 255, 255), Color.FromArgb(0, 255, 255, 255), LinearGradientMode.Vertical))
        {
          g.FillRectangle(sheen, x, y, w, Math.Min(h, 46f));
        }
        Gfx.Fade = fade;
        PaintContent(g, x, y, w, h);
        Gfx.Fade = 1f;
        g.Restore(saved);
        using (Pen rim = new Pen(Color.FromArgb(78, Pal.Glow), 1.2f)) { g.DrawPath(rim, card); }
        using (GraphicsPath inner = Gfx.Round(x + 1.2f, y + 1.2f, w - 2.4f, h - 2.4f, Dim.Radius - 1.2f))
        using (Pen light = new Pen(Color.FromArgb(26, 255, 255, 255), 1f)) { g.DrawPath(light, inner); }
      }
      DrawTip(g);
    }

    /// <summary>L'ombre douce : des couches arrondies de plus en plus larges et de plus en plus pâles.</summary>
    private void DrawShadow(Graphics g, float x, float y, float w, float h)
    {
      for (int i = 13; i >= 1; i--)
      {
        float grow = i * 1.05f;
        int alpha = 3 + (14 - i) / 4;
        Gfx.Fill(g, Color.FromArgb(alpha, 3, 24, 38), x - grow, y - grow + 5f, w + grow * 2f, h + grow * 2f, Dim.Radius + grow);
      }
    }

    private Color Lighten(Color color, float amount)
    {
      return Color.FromArgb(color.A, (int)(color.R + (255 - color.R) * amount), (int)(color.G + (255 - color.G) * amount), (int)(color.B + (255 - color.B) * amount));
    }

    private bool IsHover(string kind, Item item)
    {
      return hover != null && hover.Kind == kind && hover.Item == item;
    }

    private bool IsPressed(string kind, Item item)
    {
      return pressed != null && pressed.Kind == kind && pressed.Item == item;
    }

    private void AddHit(RectangleF area, string kind, Item item, string tip, RectangleF? view)
    {
      RectangleF r = area;
      if (view.HasValue)
      {
        r = RectangleF.Intersect(area, view.Value);
        if (r.Width < 2f || r.Height < 2f) return;
      }
      Hit hit = new Hit();
      hit.R = r;
      hit.Kind = kind;
      hit.Item = item;
      hit.Tip = tip;
      hits.Add(hit);
    }

    private void AddTagHit(RectangleF area, string kind, string tag, RectangleF? view)
    {
      RectangleF r = area;
      if (view.HasValue)
      {
        r = RectangleF.Intersect(area, view.Value);
        if (r.Width < 2f || r.Height < 2f) return;
      }
      Hit hit = new Hit();
      hit.R = r;
      hit.Kind = kind;
      hit.Tag = tag;
      hits.Add(hit);
    }

    private bool IsTagHover(string kind, string tag)
    {
      return hover != null && hover.Kind == kind && hover.Tag == tag;
    }

    /// <summary>Un bouton plein ou à contour, avec son texte centré ; renvoie sa zone cliquable.</summary>
    private void Btn(Graphics g, string kind, Item item, float x, float y, float w, float h, string text, Color back, Color fore, Color edge, float radius, float font, RectangleF? view)
    {
      Color fill = IsPressed(kind, item) ? Color.FromArgb(back.A, (int)(back.R * 0.9), (int)(back.G * 0.9), (int)(back.B * 0.9)) : (IsHover(kind, item) ? Lighten(back, 0.12f) : back);
      Gfx.Fill(g, Gfx.Fx(fill), x, y, w, h, radius);
      if (edge.A > 0) Gfx.Stroke(g, Gfx.Fx(edge), 1.3f, x + 0.6f, y + 0.6f, w - 1.2f, h - 1.2f, radius);
      Gfx.Text(g, text, Gfx.Fnt(font, FontStyle.Bold), fore, x, y + (h - font * 1.35f) / 2f, w, font * 1.5f, Gfx.Center);
      AddHit(new RectangleF(x, y, w, h), kind, item, "", view);
    }

    // ------------------------------------------------------------------------------------------------------------
    // Le contenu, état par état.
    // ------------------------------------------------------------------------------------------------------------

    private void PaintContent(Graphics g, float x, float y, float w, float h)
    {
      if (IsReduced) { PaintReduced(g, x, y, w, h); return; }
      if (state == St.Ready && entry != null) PaintReady(g, x, y, w, h);
      else if (state == St.Expanded && entry != null) PaintExpanded(g, x, y, w, h);
      else if (state == St.Done && done != null) PaintDone(g, x, y, w, h);
      else if (state == St.Scanning) PaintScanning(g, x, y, w, h);
      else if (state == St.Quiet) PaintQuiet(g, x, y, w, h);
      else PaintIdle(g, x, y, w, h);
    }

    private double T() { return clock.Elapsed.TotalSeconds; }

    private static string Plural(int count, string one, string many)
    {
      return count > 1 ? many.Replace("{n}", count.ToString()) : one;
    }

    private void IconButton(Graphics g, string kind, float x, float y, string tip, int glyph)
    {
      float size = Dim.IconButton;
      bool over = IsHover(kind, null);
      if (over) Gfx.Disc(g, Color.FromArgb((int)(IsPressed(kind, null) ? 56 : 34), 255, 255, 255), x + size / 2f, y + size / 2f, size / 2f);
      Color ink = over ? Pal.Text : Pal.Muted;
      float cx = x + size / 2f;
      float cy = y + size / 2f;
      if (glyph == 1) Gfx.Pin(g, pinned ? Pal.Accent : ink, cx, cy, 14f, pinned);
      else if (glyph == 2) Gfx.Minus(g, ink, cx, cy, 5f);
      else if (glyph == 3) Gfx.Cross(g, ink, cx, cy, 4.4f, 1.8f);
      else if (glyph == 4) Gfx.Chevron(g, ink, cx, cy, 5.5f, true);
      AddHit(new RectangleF(x, y, size, size), kind, null, tip, null);
    }

    /// <summary>Les trois petits boutons du haut : verrouiller la position, réduire, masquer.</summary>
    private void HeaderButtons(Graphics g, float x, float y, float w, bool full)
    {
      float size = Dim.IconButton;
      float right = x + w - 12f;
      float top = y + 12f;
      IconButton(g, "close", right - size, top, Txt.CloseTip, 3);
      if (full)
      {
        IconButton(g, "min", right - 2 * size - 4f, top, Txt.MinTip, 2);
        IconButton(g, "pin", right - 3 * size - 8f, top, pinned ? "Position verrouillée" : Txt.PinTip, 1);
      }
    }

    private string Mood()
    {
      if (analyzing || state == St.Scanning) return "think";
      if (state == St.Ready) return "alert";
      if (state == St.Done) return "happy";
      if (state == St.Expanded) return Unanswered() > 0 ? "idea" : "happy";
      return "idle";
    }

    private void PaintIdle(Graphics g, float x, float y, float w, float h)
    {
      Mascot.Draw(g, x + 8f, y + (h - Dim.Mascot) / 2f, Dim.Mascot, "idle", T());
      float tx = x + 104f;
      Gfx.Text(g, Txt.Brand, Gfx.Fnt(17f, FontStyle.Bold), Pal.Text, tx, y + 17f, w - 104f - 100f, 24f, Gfx.Left);
      float pulse = (float)(0.5 + 0.5 * Math.Sin(T() * 3.0));
      Gfx.Disc(g, Gfx.Fx(Color.FromArgb((int)(70 + 110 * pulse), Pal.Accent)), tx + 4f, y + 58f, 4f);
      Gfx.Text(g, Txt.Idle, Gfx.Fnt(13.5f, FontStyle.Regular), Pal.Muted, tx + 15f, y + 49f, w - 104f - 30f, 20f, Gfx.Left);
      HeaderButtons(g, x, y, w, true);
    }

    private void PaintScanning(Graphics g, float x, float y, float w, float h)
    {
      Mascot.Draw(g, x + 8f, y + (h - Dim.Mascot) / 2f, Dim.Mascot, "think", T());
      float tx = x + 104f;
      Gfx.Text(g, Txt.ScanTitle, Gfx.Fnt(17f, FontStyle.Bold), Pal.Text, tx, y + 15f, w - 104f - 100f, 24f, Gfx.Left);
      Gfx.Text(g, Txt.ScanSub, Gfx.Fnt(13.5f, FontStyle.Regular), Pal.Muted, tx, y + 43f, w - 104f - 20f, 20f, Gfx.Left);
      PaintProgress(g, tx, y + 72f, w - 104f - 22f);
      HeaderButtons(g, x, y, w, true);
    }

    /// <summary>Une barre sans pourcentage inventé : un reflet qui court tant que l'analyse dure.</summary>
    private void PaintProgress(Graphics g, float x, float y, float w)
    {
      Gfx.Fill(g, Gfx.Fx(Color.FromArgb(34, 255, 255, 255)), x, y, w, 6f, 3f);
      float seg = w * 0.4f;
      float phase = (float)((T() * 0.85) % 1.0);
      float eased = phase * phase * (3f - 2f * phase);
      float sx = x - seg + (w + seg) * eased;
      GraphicsState saved = g.Save();
      using (GraphicsPath track = Gfx.Round(x, y, w, 6f, 3f))
      {
        g.SetClip(track, CombineMode.Intersect);
        using (LinearGradientBrush bar = new LinearGradientBrush(new RectangleF(sx, y, seg, 6f), Gfx.Fx(Pal.Accent), Gfx.Fx(Pal.Glow), LinearGradientMode.Horizontal)) { g.FillRectangle(bar, sx, y, seg, 6f); }
      }
      g.Restore(saved);
    }

    private void PaintQuiet(Graphics g, float x, float y, float w, float h)
    {
      Mascot.Draw(g, x + 8f, y + (h - Dim.Mascot) / 2f, Dim.Mascot, "idle", T());
      float tx = x + 104f;
      Gfx.Text(g, Txt.Quiet, Gfx.Fnt(17f, FontStyle.Bold), Pal.Text, tx, y + 15f, w - 104f - 100f, 24f, Gfx.Left);
      Gfx.Text(g, Txt.QuietSub, Gfx.Fnt(13.5f, FontStyle.Regular), Pal.Muted, tx, y + 43f, w - 104f - 20f, 20f, Gfx.Left);
      HeaderButtons(g, x, y, w, true);
    }

    private string ReadyTitle()
    {
      if (entry.Items.Count == 0 && entry.Questions.Count > 0) return Txt.QuestionTitle;
      if (entry.Items.Count == 0) return entry.Alerts.Count > 0 ? Txt.ReadFirst : Txt.Quiet;
      return Plural(entry.Items.Count, Txt.ReadyOne, Txt.ReadyMany);
    }

    private void PaintReady(Graphics g, float x, float y, float w, float h)
    {
      Mascot.Draw(g, x + 8f, y + 10f, Dim.Mascot, "alert", T());
      float tx = x + 104f;
      Gfx.Text(g, ReadyTitle(), Gfx.Fnt(17f, FontStyle.Bold), Pal.Text, tx, y + 15f, w - 104f - 100f, 24f, Gfx.Left);
      string sub = entry.Subject.Length > 0 ? entry.Subject : Plural(entry.Items.Count, Txt.ForSaleOne, Txt.ForSaleMany);
      Gfx.Text(g, sub, Gfx.Fnt(13f, FontStyle.Regular), Pal.Muted, tx, y + 43f, w - 104f - 20f, 20f, Gfx.Left);
      float bw = w - 104f - 20f;
      float by = y + 78f;
      bool over = IsHover("see", null);
      Color a = over ? Lighten(Pal.Accent, 0.1f) : Pal.Accent;
      Gfx.Gradient(g, Gfx.Fx(a), Gfx.Fx(Pal.AccentDark), tx, by, bw, Dim.ButtonHeight, 14f);
      float label = Gfx.Measure(g, Txt.ReadyButton, Gfx.Fnt(14f, FontStyle.Bold));
      float lx = tx + (bw - label - 24f) / 2f;
      Gfx.Text(g, Txt.ReadyButton, Gfx.Fnt(14f, FontStyle.Bold), Pal.SoldFg, lx, by + 10f, label + 6f, 22f, Gfx.Left);
      Gfx.Arrow(g, Gfx.Fx(Pal.SoldFg), lx + label + 8f, by + Dim.ButtonHeight / 2f, 12f);
      AddHit(new RectangleF(tx, by, bw, Dim.ButtonHeight), "see", null, "", null);
      HeaderButtons(g, x, y, w, true);
    }

    private string ReducedLabel()
    {
      if (analyzing || state == St.Scanning) return Txt.ScanSub;
      if (sessionOpen && entry != null && entry.Items.Count > 0)
      {
        int open = Unanswered();
        return open > 0 ? Plural(open, Txt.ReducedOne, Txt.ReducedMany) : Txt.AllDone;
      }
      if (state == St.Quiet) return Txt.Quiet;
      return Txt.ReducedIdle;
    }

    private void PaintReduced(Graphics g, float x, float y, float w, float h)
    {
      Mascot.Draw(g, x + 8f, y + 9f, 46f, Mood(), T());
      Gfx.Text(g, Txt.Brand, Gfx.Fnt(14.5f, FontStyle.Bold), Pal.Text, x + 62f, y + 11f, w - 62f - 76f, 20f, Gfx.Left);
      Gfx.Text(g, ReducedLabel(), Gfx.Fnt(12.5f, FontStyle.Regular), Pal.Muted, x + 62f, y + 33f, w - 62f - 76f, 18f, Gfx.Left);
      float size = Dim.IconButton;
      float right = x + w - 10f;
      float top = y + (h - size) / 2f;
      IconButton(g, "close", right - size, top, Txt.CloseTip, 3);
      IconButton(g, "expand", right - 2 * size - 4f, top, "Agrandir", 4);
    }

    // ------------------------------------------------------------------------------------------------------------
    // La fin de vente : une grande coche verte qui se trace, quelques étincelles.
    // ------------------------------------------------------------------------------------------------------------

    private float DoneHeight(float width)
    {
      float textW = width - 24f - 72f - 16f - 20f;
      float height = 20f + 26f + 6f;
      foreach (string line in done.Lines) height += Gfx.MeasureHeight(measure, line, Gfx.Fnt(13f, FontStyle.Regular), textW);
      if (done.Badge.Length > 0) height += 34f;
      height += 20f;
      return Math.Max((float)Dim.HeightDone, height);
    }

    private void PaintDone(Graphics g, float x, float y, float w, float h)
    {
      double age = Now() - stateStart;
      Color tone = done.Warning ? Color.FromArgb(255, 245, 158, 11) : Pal.Accent;
      Color toneDark = done.Warning ? Color.FromArgb(255, 217, 119, 6) : Pal.AccentDark;
      float cx = x + 24f + 36f;
      float cy = y + 20f + 36f;
      float pop = (float)Math.Min(1.0, age / 0.42);
      float back = 1f + 1.70158f * 1.2f;
      float eased = 1f + back * (float)Math.Pow(pop - 1.0, 3) + 1.70158f * (float)Math.Pow(pop - 1.0, 2);
      float radius = 34f * Math.Max(0.05f, eased);
      // Les étincelles : huit points qui s'écartent puis s'éteignent.
      double burst = Math.Min(1.0, age / 0.9);
      if (burst < 1.0 && !done.Warning)
      {
        for (int i = 0; i < 8; i++)
        {
          double angle = i * Math.PI / 4 + 0.2;
          float distance = (float)(40.0 + 24.0 * (1.0 - Math.Pow(1.0 - burst, 2)));
          int alpha = (int)(230 * (1.0 - burst));
          Color spark = (i % 3 == 0) ? Color.FromArgb(alpha, 255, 214, 90) : (i % 3 == 1 ? Color.FromArgb(alpha, Pal.Glow) : Color.FromArgb(alpha, Pal.Accent));
          Gfx.Disc(g, spark, cx + (float)Math.Cos(angle) * distance, cy + (float)Math.Sin(angle) * distance, 3f);
        }
      }
      Gfx.Disc(g, Color.FromArgb(46, tone), cx, cy, radius + 6f);
      using (GraphicsPath disc = new GraphicsPath())
      {
        disc.AddEllipse(cx - radius, cy - radius, radius * 2f, radius * 2f);
        using (LinearGradientBrush fill = new LinearGradientBrush(new RectangleF(cx - radius - 1f, cy - radius - 1f, radius * 2f + 2f, radius * 2f + 2f), tone, toneDark, LinearGradientMode.Vertical)) { g.FillPath(fill, disc); }
      }
      if (done.Warning)
      {
        Gfx.Bang(g, Color.White, cx, cy, 34f);
      }
      else
      {
        float stroke = (float)Math.Max(0.0, Math.Min(1.0, (age - 0.14) / 0.42));
        Gfx.Tick(g, Color.White, cx, cy, 52f, 5.2f, stroke);
      }
      float tx = x + 24f + 72f + 16f;
      float textW = w - (tx - x) - 20f;
      Gfx.Text(g, Txt.DoneTitle, Gfx.Fnt(19f, FontStyle.Bold), Pal.Text, tx, y + 18f, textW, 28f, Gfx.Left);
      float ty = y + 18f + 28f;
      foreach (string line in done.Lines)
      {
        float lh = Gfx.MeasureHeight(g, line, Gfx.Fnt(13f, FontStyle.Regular), textW);
        Gfx.Text(g, line, Gfx.Fnt(13f, FontStyle.Regular), Pal.Muted, tx, ty, textW, lh, Gfx.Wrap);
        ty += lh;
      }
      if (done.Badge.Length > 0)
      {
        float bw = Gfx.Pill(g, tx, ty + 6f, done.Badge, Pal.StockBg, Pal.StockFg, 3, true);
      }
    }

    // ------------------------------------------------------------------------------------------------------------
    // Les conseils : la bannière ouverte.
    // ------------------------------------------------------------------------------------------------------------

    private float FooterHeight() { return 8f + Dim.ButtonHeight + 8f + Dim.FinishHeight + 12f; }

    private float TextColumn(float listWidth) { return listWidth - Dim.Thumb - 12f - 88f - 10f; }

    private float RowHeight(Item item, float listWidth)
    {
      float height = 10f + 20f + (item.Drug.Length > 0 ? 16f : 0f) + (item.Reason.Length > 0 ? 16f : 0f) + 6f + 22f + 10f;
      height += (PillLines(measure, item, TextColumn(listWidth)) - 1) * 28f;
      return Math.Max(height, 78f);
    }

    /// <summary>Les pastilles d'un conseil : Challenge, Date courte, stock. Jamais inventées : le serveur ne les envoie que si elles sont réelles.</summary>
    private static int BuildPills(Item item, string[] texts, Color[] backs, Color[] fores, int[] icons)
    {
      int count = 0;
      if (item.Challenge.Length > 0) { texts[count] = Txt.Challenge; backs[count] = Pal.ChallengeBg; fores[count] = Pal.ChallengeFg; icons[count] = 1; count++; }
      if (item.ShortDate.Length > 0) { texts[count] = Txt.ShortDate + " " + ShortDay(item.ShortDate); backs[count] = Pal.DateBg; fores[count] = Pal.DateFg; icons[count] = 2; count++; }
      string stock; Color stockBack; Color stockFore; int stockIcon;
      Availability(item.Availability, item.Quantity, out stock, out stockBack, out stockFore, out stockIcon);
      texts[count] = stock; backs[count] = stockBack; fores[count] = stockFore; icons[count] = stockIcon; count++;
      return count;
    }

    /// <summary>Une ou deux lignes de pastilles : quand elles ne tiennent pas côte à côte, la dernière passe à la ligne.</summary>
    private int PillLines(Graphics g, Item item, float width)
    {
      string[] texts = new string[3];
      Color[] backs = new Color[3];
      Color[] fores = new Color[3];
      int[] icons = new int[3];
      int count = BuildPills(item, texts, backs, fores, icons);
      float x = 0f;
      int lines = 1;
      for (int i = 0; i < count; i++)
      {
        float pw = Gfx.Pill(g, 0f, 0f, texts[i], backs[i], fores[i], icons[i], false);
        if (x > 0f && x + pw > width) { lines++; x = 0f; }
        x += pw + 6f;
      }
      return lines;
    }

    private float AlertHeight(Graphics g, string text, float width)
    {
      return Gfx.MeasureHeight(g, text, Gfx.Fnt(12.5f, FontStyle.Bold), width - 44f) + 16f;
    }

    private float ListHeight(float width)
    {
      float inner = width - 20f - 28f;
      float total = 24f;
      foreach (string alert in entry.Alerts) total += AlertHeight(measure, alert, inner) + 8f;
      if (entry.Items.Count == 0 && entry.Questions.Count == 0)
      {
        foreach (string note in entry.Notes) total += Gfx.MeasureHeight(measure, note, Gfx.Fnt(13f, FontStyle.Regular), inner) + 4f;
        total += 6f;
      }
      total += QuestionsHeight(measure, inner);
      foreach (Item item in entry.Items) total += RowHeight(item, inner);
      return total + 6f;
    }

    private float ExpandedHeight(float width)
    {
      listHeight = ListHeight(width);
      float viewTop = Dim.Header - 4f + 8f;
      float need = viewTop + listHeight + FooterHeight() + 10f;
      return Math.Min(need, MaxCardHeight());
    }

    private string Subtitle()
    {
      if (analyzing) return Txt.ScanSub;
      if (entry.Items.Count == 0 && entry.Questions.Count > 0) return Txt.QuestionSub;
      if (entry.Items.Count == 0) return entry.Alerts.Count > 0 ? Txt.ReadFirst : Txt.QuietSub;
      int answered = 0;
      foreach (Item item in entry.Items) { if (item.Outcome != "NONE") answered++; }
      if (answered == 0) return Plural(entry.Items.Count, Txt.ForSaleOne, Txt.ForSaleMany);
      return Txt.DuringSale + "  " + answered + "/" + entry.Items.Count;
    }

    private void PaintExpanded(Graphics g, float x, float y, float w, float h)
    {
      Mascot.Draw(g, x + 8f, y + 6f, 76f, Mood(), T());
      float tx = x + 96f;
      Gfx.Text(g, Txt.Brand, Gfx.Fnt(17f, FontStyle.Bold), Pal.Text, tx, y + 18f, w - 96f - 120f, 24f, Gfx.Left);
      Gfx.Text(g, Subtitle(), Gfx.Fnt(13.5f, FontStyle.Regular), analyzing ? Pal.Glow : Pal.Muted, tx, y + 45f, w - 96f - 20f, 20f, Gfx.Left);
      HeaderButtons(g, x, y, w, true);

      float panelX = x + 10f;
      float panelY = y + Dim.Header - 4f;
      float panelW = w - 20f;
      float panelH = h - Dim.Header + 4f - 10f;
      if (panelH < 30f) return;
      Gfx.Fill(g, Gfx.Fx(Pal.Panel), panelX, panelY, panelW, panelH, 18f);

      float footer = FooterHeight();
      float viewTop = panelY + 8f;
      float viewBottom = panelY + panelH - footer;
      float viewH = viewBottom - viewTop;
      float maxScroll = Math.Max(0f, listHeight - viewH);
      if (scrollY > maxScroll) scrollY = maxScroll;
      if (scrollY < 0f) scrollY = 0f;
      if (viewH > 6f)
      {
        RectangleF view = new RectangleF(panelX, viewTop, panelW, viewH);
        GraphicsState saved = g.Save();
        g.SetClip(view, CombineMode.Intersect);
        PaintList(g, panelX + 14f, viewTop - scrollY, panelW - 28f, view);
        g.Restore(saved);
        if (maxScroll > 1f)
        {
          float trackH = viewH - 8f;
          float thumbH = Math.Max(24f, trackH * viewH / listHeight);
          float thumbY = viewTop + 4f + (trackH - thumbH) * (scrollY / maxScroll);
          Gfx.Fill(g, Gfx.Fx(Color.FromArgb(90, 90, 114, 128)), panelX + panelW - 7f, thumbY, 3.5f, thumbH, 1.75f);
        }
      }

      float footerTop = panelY + panelH - footer;
      Gfx.Fill(g, Gfx.Fx(Pal.Line), panelX + 14f, footerTop, panelW - 28f, 1f, 0f);
      PaintFooter(g, panelX + 14f, footerTop + 8f, panelW - 28f);
    }

    // ------------------------------------------------------------------------------------------------------------
    // L'arbre de questions : « Pourquoi le patient prend-il … ? » → un bouton par choix ; les choix cochés ouvrent d'autres questions.
    // ------------------------------------------------------------------------------------------------------------

    private const float ChipH = 30f;
    private const float ChipGap = 8f;

    private float ChipWidth(Graphics g, string label)
    {
      return Math.Max(56f, Gfx.Measure(g, label, Gfx.Fnt(13f, FontStyle.Bold)) + 30f);
    }

    /// <summary>Les boutons d'une question, rangés ligne par ligne selon la largeur.</summary>
    private int ChipLines(Graphics g, Question q, float width)
    {
      int lines = 1;
      float x = 0f;
      foreach (Choice c in q.Choices)
      {
        float cw = ChipWidth(g, c.Label);
        if (x > 0f && x + cw > width) { lines++; x = 0f; }
        x += cw + ChipGap;
      }
      return lines;
    }

    private float QuestionHeight(Graphics g, Question q, float width)
    {
      float textH = Gfx.MeasureHeight(g, q.Text, Gfx.Fnt(14f, FontStyle.Bold), width - 24f);
      return 14f + textH + 10f + ChipLines(g, q, width - 24f) * (ChipH + ChipGap) + 4f;
    }

    private float QuestionsHeight(Graphics g, float width)
    {
      float total = 0f;
      foreach (Question q in entry.Questions) total += QuestionHeight(g, q, width) + 8f;
      foreach (string note in entry.Guidance) total += AlertHeight(g, note, width) + 8f;
      return total;
    }

    private float PaintQuestions(Graphics g, float x, float y, float w, RectangleF view)
    {
      float cursor = y;
      foreach (Question q in entry.Questions)
      {
        float qh = QuestionHeight(g, q, w);
        if (cursor + qh > view.Top && cursor < view.Bottom)
        {
          Gfx.Fill(g, Gfx.Fx(Pal.StockBg), x, cursor, w, qh, 14f);
          float textH = Gfx.MeasureHeight(g, q.Text, Gfx.Fnt(14f, FontStyle.Bold), w - 24f);
          Gfx.Text(g, q.Text, Gfx.Fnt(14f, FontStyle.Bold), Pal.Ink, x + 12f, cursor + 12f, w - 24f, textH + 2f, Gfx.Wrap);
          float cy = cursor + 14f + textH + 10f;
          float cx = x + 12f;
          foreach (Choice c in q.Choices)
          {
            float cw = ChipWidth(g, c.Label);
            if (cx > x + 12f && cx + cw > x + w - 12f) { cx = x + 12f; cy += ChipH + ChipGap; }
            string tag = q.Node + ":" + c.Key;
            bool over = IsTagHover("answer", tag);
            if (c.Selected)
            {
              Gfx.Gradient(g, Gfx.Fx(over ? Lighten(Pal.Accent, 0.1f) : Pal.Accent), Gfx.Fx(Pal.AccentDark), cx, cy, cw, ChipH, 15f);
              Gfx.Text(g, c.Label, Gfx.Fnt(13f, FontStyle.Bold), Pal.SoldFg, cx, cy + 7f, cw, 18f, Gfx.Center);
            }
            else
            {
              Gfx.Fill(g, Gfx.Fx(over ? Lighten(Pal.StockBg, 0.5f) : Color.FromArgb(255, 255, 255, 255)), cx, cy, cw, ChipH, 15f);
              Gfx.Stroke(g, Gfx.Fx(Pal.Accent), 1.3f, cx + 0.6f, cy + 0.6f, cw - 1.2f, ChipH - 1.2f, 15f);
              Gfx.Text(g, c.Label, Gfx.Fnt(13f, FontStyle.Bold), Pal.AccentDark, cx, cy + 7f, cw, 18f, Gfx.Center);
            }
            AddTagHit(new RectangleF(cx, cy, cw, ChipH), "answer", tag, view);
            cx += cw + ChipGap;
          }
        }
        cursor += qh + 8f;
      }
      foreach (string note in entry.Guidance)
      {
        float ah = AlertHeight(g, note, w);
        if (cursor + ah > view.Top && cursor < view.Bottom)
        {
          Gfx.Fill(g, Gfx.Fx(Pal.AlertBg), x, cursor, w, ah, 12f);
          Gfx.Warning(g, Gfx.Fx(Pal.AlertFg), x + 17f, cursor + 14f, 13f);
          Gfx.Text(g, note, Gfx.Fnt(12.5f, FontStyle.Bold), Pal.AlertFg, x + 34f, cursor + 8f, w - 44f, ah - 10f, Gfx.Wrap);
        }
        cursor += ah + 8f;
      }
      return cursor - y;
    }

    private void PaintList(Graphics g, float x, float y, float w, RectangleF view)
    {
      float cursor = y;
      Gfx.Text(g, entry.Label.ToUpperInvariant(), Gfx.Fnt(10.5f, FontStyle.Bold), Pal.InkSoft, x, cursor + 3f, 70f, 14f, Gfx.Left);
      float labelW = Gfx.Measure(g, entry.Label.ToUpperInvariant(), Gfx.Fnt(10.5f, FontStyle.Bold)) + 10f;
      Gfx.Text(g, entry.Subject, Gfx.Fnt(13f, FontStyle.Bold), Pal.Ink, x + labelW, cursor + 1f, w - labelW, 18f, Gfx.Left);
      cursor += 24f;

      foreach (string alert in entry.Alerts)
      {
        float ah = AlertHeight(g, alert, w);
        if (cursor + ah > view.Top && cursor < view.Bottom)
        {
          Gfx.Fill(g, Gfx.Fx(Pal.AlertBg), x, cursor, w, ah, 12f);
          Gfx.Warning(g, Gfx.Fx(Pal.AlertFg), x + 17f, cursor + 14f, 13f);
          Gfx.Text(g, alert, Gfx.Fnt(12.5f, FontStyle.Bold), Pal.AlertFg, x + 34f, cursor + 8f, w - 44f, ah - 10f, Gfx.Wrap);
        }
        cursor += ah + 8f;
      }

      cursor += PaintQuestions(g, x, cursor, w, view);

      if (entry.Items.Count == 0 && entry.Questions.Count == 0)
      {
        foreach (string note in entry.Notes)
        {
          float nh = Gfx.MeasureHeight(g, note, Gfx.Fnt(13f, FontStyle.Regular), w);
          Gfx.Text(g, note, Gfx.Fnt(13f, FontStyle.Regular), Pal.InkSoft, x, cursor, w, nh, Gfx.Wrap);
          cursor += nh + 4f;
        }
        cursor += 6f;
      }

      for (int i = 0; i < entry.Items.Count; i++)
      {
        cursor += PaintRow(g, entry.Items[i], x, cursor, w, i == entry.Items.Count - 1, view);
      }
    }

    private static string ShortDay(string date)
    {
      // 30/11/2026 -> 30/11/26
      return date.Length == 10 ? date.Substring(0, 6) + date.Substring(8, 2) : date;
    }

    private float PaintRow(Graphics g, Item item, float x, float y, float w, bool last, RectangleF view)
    {
      float rowH = RowHeight(item, w);
      if (y + rowH < view.Top || y > view.Bottom) return rowH;
      if (!last) Gfx.Fill(g, Gfx.Fx(Pal.Line), x, y + rowH - 1f, w, 1f, 0f);
      DrawPhoto(g, item.Image, x, y + 12f, Dim.Thumb);
      float tx = x + Dim.Thumb + 12f;
      float buttons = 88f;
      float rightX = x + w - buttons;
      float textW = rightX - tx - 10f;

      Font nameFont = Gfx.Fnt(14f, FontStyle.Bold);
      float priceW = 0f;
      if (item.Price.Length > 0) priceW = Gfx.Measure(g, item.Price, Gfx.Fnt(12.5f, FontStyle.Bold)) + 4f;
      Gfx.Text(g, item.Name, nameFont, Pal.Ink, tx, y + 9f, textW - priceW - (priceW > 0f ? 6f : 0f), 20f, Gfx.Left);
      if (priceW > 0f) Gfx.Text(g, item.Price, Gfx.Fnt(12.5f, FontStyle.Bold), Pal.StockFg, tx + textW - priceW, y + 10f, priceW + 2f, 18f, Gfx.Right);
      float line = y + 30f;
      if (item.Drug.Length > 0)
      {
        Gfx.Text(g, Txt.ForDrug + item.Drug, Gfx.Fnt(12f, FontStyle.Regular), Pal.InkSoft, tx, line, textW, 16f, Gfx.Left);
        line += 16f;
      }
      if (item.Reason.Length > 0)
      {
        Gfx.Text(g, Gfx.Shorten(item.Reason, 110), Gfx.Fnt(12f, FontStyle.Regular), Pal.InkSoft, tx, line, textW, 16f, Gfx.Left);
      }

      // Les pastilles, sur une ou deux lignes (le bas de la ligne reste aligné avec le bas du conseil).
      string[] texts = new string[3];
      Color[] backs = new Color[3];
      Color[] fores = new Color[3];
      int[] icons = new int[3];
      int count = BuildPills(item, texts, backs, fores, icons);
      int pillLines = PillLines(g, item, textW);
      float px = 0f;
      float py = y + rowH - 10f - 22f - (pillLines - 1) * 28f;
      for (int i = 0; i < count; i++)
      {
        float pw = Gfx.Pill(g, 0f, 0f, texts[i], backs[i], fores[i], icons[i], false);
        if (px > 0f && px + pw > textW) { px = 0f; py += 28f; }
        Gfx.Pill(g, tx + px, py, texts[i], backs[i], fores[i], icons[i], true);
        px += pw + 6f;
      }

      // La réponse du pharmacien.
      if (item.Outcome == "NONE")
      {
        float by = y + (rowH - 56f) / 2f;
        Btn(g, "vendu", item, rightX, by, buttons, 26f, Txt.Sold, Pal.SoldBg, Pal.SoldFg, Color.FromArgb(0, 0, 0, 0), 13f, 13f, view);
        Btn(g, "nonvendu", item, rightX, by + 30f, buttons, 26f, Txt.NotSold, Pal.NotSoldBg, Pal.NotSoldFg, Color.FromArgb(0, 0, 0, 0), 13f, 12.5f, view);
      }
      else
      {
        bool sold = item.Outcome == "SOLD";
        float cy = y + (rowH - 54f) / 2f;
        Gfx.Fill(g, Gfx.Fx(sold ? Pal.StockBg : Pal.NotSoldBg), rightX, cy, buttons, 28f, 14f);
        if (sold)
        {
          Gfx.Tick(g, Gfx.Fx(Pal.StockFg), rightX + 18f, cy + 14f, 14f, 2f, 1f);
          Gfx.Text(g, Txt.Sold, Gfx.Fnt(13f, FontStyle.Bold), Pal.StockFg, rightX + 30f, cy + 6f, buttons - 34f, 18f, Gfx.Left);
        }
        else
        {
          Gfx.Text(g, Txt.NotSold, Gfx.Fnt(12.5f, FontStyle.Bold), Pal.NotSoldFg, rightX, cy + 6f, buttons, 18f, Gfx.Center);
        }
        bool over = IsHover("modifier", item);
        Gfx.Text(g, Txt.Change, Gfx.Fnt(12f, FontStyle.Bold), over ? Pal.AccentDark : Pal.InkSoft, rightX, cy + 34f, buttons, 16f, Gfx.Center);
        AddHit(new RectangleF(rightX, cy + 30f, buttons, 22f), "modifier", item, "", view);
      }
      return rowH;
    }

    private static void Availability(string code, string quantity, out string text, out Color back, out Color fore, out int icon)
    {
      if (code == "IN_STOCK") { text = Txt.InStock + (quantity.Length > 0 ? " · " + quantity : ""); back = Pal.StockBg; fore = Pal.StockFg; icon = 3; }
      else if (code == "LOW_STOCK") { text = Txt.LowStock + (quantity.Length > 0 ? " · " + quantity : ""); back = Pal.LowBg; fore = Pal.LowFg; icon = 4; }
      else if (code == "OUT_OF_STOCK") { text = Txt.OutOfStock; back = Pal.OutBg; fore = Pal.OutFg; icon = 5; }
      else { text = Txt.UnknownStock; back = Pal.UnknownBg; fore = Pal.UnknownFg; icon = 0; }
    }

    private void PaintFooter(Graphics g, float x, float y, float w)
    {
      float detailW = 138f;
      float leftW = w - detailW - 8f;
      float bh = Dim.ButtonHeight;
      if (entry.EmailSaved)
      {
        Gfx.Fill(g, Gfx.Fx(Pal.StockBg), x, y, leftW, bh, 14f);
        Gfx.Tick(g, Gfx.Fx(Pal.StockFg), x + 20f, y + bh / 2f, 15f, 2.2f, 1f);
        Gfx.Text(g, Txt.EmailSaved, Gfx.Fnt(13f, FontStyle.Bold), Pal.StockFg, x + 36f, y + 11f, leftW - 36f - 70f, 20f, Gfx.Left);
        bool over = IsHover("emailRemove", null);
        Gfx.Text(g, Txt.EmailRemove, Gfx.Fnt(12.5f, FontStyle.Bold), over ? Pal.AccentDark : Pal.StockFg, x + leftW - 72f, y + 12f, 64f, 18f, Gfx.Right);
        AddHit(new RectangleF(x + leftW - 76f, y, 76f, bh), "emailRemove", null, "", null);
      }
      else
      {
        bool over = IsHover("email", null);
        Gfx.Fill(g, Gfx.Fx(over ? Color.White : Pal.Panel), x, y, leftW, bh, 14f);
        Gfx.Stroke(g, Gfx.Fx(over ? Pal.Accent : Color.FromArgb(255, 190, 208, 218)), 1.4f, x + 0.7f, y + 0.7f, leftW - 1.4f, bh - 1.4f, 14f);
        Gfx.Envelope(g, Gfx.Fx(Pal.InkSoft), x + 22f, y + bh / 2f, 15f);
        Gfx.Text(g, Txt.EmailAdd, Gfx.Fnt(13f, FontStyle.Bold), Pal.Ink, x + 40f, y + 11f, leftW - 46f, 20f, Gfx.Left);
        AddHit(new RectangleF(x, y, leftW, bh), "email", null, "", null);
      }
      bool detailOver = IsHover("detail", null);
      Gfx.Fill(g, Gfx.Fx(detailOver ? Color.White : Pal.Panel), x + leftW + 8f, y, detailW, bh, 14f);
      Gfx.Stroke(g, Gfx.Fx(detailOver ? Pal.Accent : Color.FromArgb(255, 190, 208, 218)), 1.4f, x + leftW + 8.7f, y + 0.7f, detailW - 1.4f, bh - 1.4f, 14f);
      Gfx.Text(g, Txt.Detail, Gfx.Fnt(13f, FontStyle.Bold), Pal.Ink, x + leftW + 8f, y + 11f, detailW, 20f, Gfx.Center);
      AddHit(new RectangleF(x + leftW + 8f, y, detailW, bh), "detail", null, "", null);

      float fy = y + bh + 8f;
      bool busy = finishing;
      Color top = busy ? Color.FromArgb(255, 160, 178, 188) : (IsHover("finish", null) ? Lighten(Pal.Accent, 0.1f) : Pal.Accent);
      Color bottom = busy ? Color.FromArgb(255, 140, 158, 168) : Pal.AccentDark;
      Gfx.Gradient(g, Gfx.Fx(top), Gfx.Fx(bottom), x, fy, w, Dim.FinishHeight, 16f);
      string label = busy ? Txt.Finishing : Txt.Finish;
      Font labelFont = Gfx.Fnt(15f, FontStyle.Bold);
      float lw = Gfx.Measure(g, label, labelFont);
      float lx = x + (w - lw - (busy ? 0f : 26f)) / 2f + (busy ? 0f : 26f);
      if (!busy) Gfx.Tick(g, Gfx.Fx(Pal.SoldFg), lx - 16f, fy + Dim.FinishHeight / 2f, 17f, 2.4f, 1f);
      Gfx.Text(g, label, labelFont, Pal.SoldFg, lx, fy + (Dim.FinishHeight - 20f) / 2f, lw + 8f, 22f, Gfx.Left);
      if (!busy) AddHit(new RectangleF(x, fy, w, Dim.FinishHeight), "finish", null, "", null);
    }

    private void DrawTip(Graphics g)
    {
      if (hover == null || hover.Tip.Length == 0 || dragging) return;
      Font font = Gfx.Fnt(11.5f, FontStyle.Regular);
      float tw = Gfx.Measure(g, hover.Tip, font) + 18f;
      float tx = hover.R.X + hover.R.Width / 2f - tw / 2f;
      float limitLeft = Dim.Margin + 6f;
      float limitRight = Dim.Margin + curW - 6f - tw;
      if (tx > limitRight) tx = limitRight;
      if (tx < limitLeft) tx = limitLeft;
      float ty = hover.R.Bottom + 6f;
      Gfx.Fill(g, Color.FromArgb(232, 6, 24, 34), tx, ty, tw, 24f, 8f);
      g.DrawString(hover.Tip, font, Gfx.Brs(Color.White), new RectangleF(tx + 9f, ty + 4.5f, tw, 18f), Gfx.Left);
    }

    // ------------------------------------------------------------------------------------------------------------
    // Les photos des produits.
    // ------------------------------------------------------------------------------------------------------------

    private Image LoadPhoto(string path)
    {
      if (!File.Exists(path)) return null;
      try
      {
        using (FileStream stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read))
        using (Image raw = Image.FromStream(stream))
        {
          return new Bitmap(raw);
        }
      }
      catch (Exception) { return null; }
    }

    private void DrawPhoto(Graphics g, string path, float x, float y, float size)
    {
      Image image = null;
      if (!string.IsNullOrEmpty(path) && !photos.TryGetValue(path, out image))
      {
        image = LoadPhoto(path);
        if (photos.Count > 24)
        {
          foreach (Image old in photos.Values) { if (old != null) old.Dispose(); }
          photos.Clear();
        }
        photos[path] = image;
      }
      if (image == null) { Gfx.Bottle(g, x, y, size); return; }
      GraphicsState saved = g.Save();
      using (GraphicsPath clip = Gfx.Round(x, y, size, size, 11f)) { g.SetClip(clip, CombineMode.Intersect); }
      Gfx.Fill(g, Color.White, x, y, size, size, 0f);
      float zoom = Math.Min(size / image.Width, size / image.Height);
      float iw = image.Width * zoom;
      float ih = image.Height * zoom;
      g.DrawImage(image, x + (size - iw) / 2f, y + (size - ih) / 2f, iw, ih);
      g.Restore(saved);
    }

    protected override void Dispose(bool disposing)
    {
      if (disposing)
      {
        timer.Stop();
        timer.Dispose();
        if (buffer != null) buffer.Dispose();
        measure.Dispose();
        measureBitmap.Dispose();
        foreach (Image image in photos.Values) { if (image != null) image.Dispose(); }
        photos.Clear();
      }
      base.Dispose(disposing);
    }
  }

  /// <summary>Un bouton arrondi qui ne prend jamais le focus.</summary>
  public class FlatButton : Control
  {
    private readonly Color back;
    private readonly Color backHover;
    private readonly Color fore;
    private readonly Color edge;
    private bool hovered;
    /// <summary>Un bouton momentanément inutilisable : grisé, et sans effet.</summary>
    public bool Muted;

    public FlatButton(string text, Color back, Color backHover, Color fore, Color edge, Font font)
    {
      this.back = back;
      this.backHover = backHover;
      this.fore = fore;
      this.edge = edge;
      Text = text;
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
      g.Clear(Parent != null ? Parent.BackColor : Color.White);
      using (GraphicsPath path = Gfx.Round(0.5f, 0.5f, Width - 1.5f, Height - 1.5f, Height / 3f))
      {
        g.FillPath(Gfx.Brs(Muted ? Color.FromArgb(255, 226, 233, 237) : (hovered ? backHover : back)), path);
        if (edge.A > 0 && !Muted) { using (Pen pen = new Pen(edge, 1.4f)) { g.DrawPath(pen, path); } }
      }
      TextRenderer.DrawText(g, Text, Font, new Rectangle(0, 0, Width, Height), Muted ? Color.FromArgb(255, 120, 136, 146) : fore, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis | TextFormatFlags.NoPadding);
    }
  }

  /// <summary>
  /// Le champ « e-mail du patient » : une petite carte posée sous la bannière. C'est la SEULE fenêtre qui prend le clavier, et seulement
  /// quand le pharmacien clique dans son champ (BeginTyping, EndTyping) ; elle le rend aussitôt la saisie finie.
  /// </summary>
  public class EmailForm : Form
  {
    public event Action<string> Word;
    public event Action Saved;

    private readonly float scale;
    private readonly string saleId;
    private readonly System.Windows.Forms.Timer typingTimer = new System.Windows.Forms.Timer();
    private bool editing;
    private IntPtr previousForeground = IntPtr.Zero;
    private TextBox emailBox;
    private CheckBox consent;
    private Label message;
    private FlatButton saveButton;
    private string emailText = "";
    private bool emailConsent;

    public EmailForm(string id, string error)
    {
      saleId = id;
      float found = 1f;
      using (Graphics g = Graphics.FromHwnd(IntPtr.Zero)) { found = g.DpiX / 96f; }
      scale = found < 1f ? 1f : found;
      FormBorderStyle = FormBorderStyle.None;
      ShowInTaskbar = false;
      TopMost = true;
      StartPosition = FormStartPosition.Manual;
      BackColor = Pal.Panel;
      DoubleBuffered = true;
      typingTimer.Tick += delegate { EndTyping(true); };
      Build(error);
    }

    protected override bool ShowWithoutActivation { get { return true; } }

    protected override CreateParams CreateParams
    {
      get
      {
        CreateParams p = base.CreateParams;
        // WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW : jamais dans la barre des tâches ni dans Alt+Tab, jamais activée d'elle-même.
        p.ExStyle |= 0x08000000 | 0x00000080;
        return p;
      }
    }

    protected override void WndProc(ref Message m)
    {
      // WM_MOUSEACTIVATE : un clic sur un bouton n'active pas la fenêtre ; seule la saisie, voulue par un clic dans le champ, a le droit d'activer.
      if (m.Msg == 0x0021 && !editing) { m.Result = (IntPtr)3; return; }
      base.WndProc(ref m);
    }

    protected override void OnDeactivate(EventArgs e)
    {
      base.OnDeactivate(e);
      // Le pharmacien a cliqué ailleurs (le logiciel de gestion) : la saisie s'arrête, la carte redevient muette.
      if (editing) EndTyping(false);
    }

    private int S(int value) { return (int)Math.Round(value * scale); }
    private Font F(float points, FontStyle style) { return new Font(Gfx.Face(), points, style, GraphicsUnit.Point); }

    private Label Words(string text, Font font, Color color, int x, int y, int width)
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
      Controls.Add(label);
      return label;
    }

    private void Build(string error)
    {
      int width = S(360);
      int pad = S(16);
      int inner = width - 2 * pad;
      int y = pad;
      Label title = Words("E-mail du patient", F(11.5f, FontStyle.Bold), Pal.Ink, pad, y, inner);
      y += title.Height + S(4);

      emailBox = new TextBox();
      emailBox.Font = F(11f, FontStyle.Regular);
      emailBox.BorderStyle = BorderStyle.FixedSingle;
      emailBox.Location = new Point(pad, y);
      emailBox.Width = inner;
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
      Controls.Add(emailBox);
      y += emailBox.Height + S(8);

      consent = new CheckBox();
      consent.Text = "Le patient accepte de recevoir son bilan par e-mail";
      consent.Font = F(9.5f, FontStyle.Regular);
      consent.ForeColor = Pal.Ink;
      consent.BackColor = Color.Transparent;
      consent.UseCompatibleTextRendering = false;
      consent.AutoSize = false;
      consent.Location = new Point(pad, y);
      consent.Size = new Size(inner, S(24));
      consent.TabStop = false;
      consent.CheckedChanged += delegate { emailConsent = consent.Checked; RefreshSave(); };
      Controls.Add(consent);
      y += consent.Height + S(2);

      message = Words(error, F(9.5f, FontStyle.Bold), Pal.AlertFg, pad, y, inner);
      y += Math.Max(message.Height, S(6));

      saveButton = new FlatButton("Enregistrer l'e-mail", Pal.Accent, Lighten(Pal.Accent), Pal.SoldFg, Color.FromArgb(0, 0, 0, 0), F(10.5f, FontStyle.Bold));
      saveButton.Location = new Point(pad, y);
      saveButton.Size = new Size(inner - S(104), S(38));
      saveButton.Click += delegate { SaveEmail(); };
      Controls.Add(saveButton);
      FlatButton later = new FlatButton("Plus tard", Pal.NotSoldBg, Lighten(Pal.NotSoldBg), Pal.NotSoldFg, Color.FromArgb(0, 0, 0, 0), F(10.5f, FontStyle.Bold));
      later.Location = new Point(pad + saveButton.Width + S(8), y);
      later.Size = new Size(S(96), S(38));
      later.Click += delegate { LaterEmail(); };
      Controls.Add(later);
      y += S(38) + pad;
      ClientSize = new Size(width, y);
      using (GraphicsPath shape = Gfx.Round(0, 0, Width, Height, S(18))) { Region = new Region(shape); }
      RefreshSave();
    }

    private static Color Lighten(Color color)
    {
      return Color.FromArgb(color.A, (int)(color.R + (255 - color.R) * 0.14), (int)(color.G + (255 - color.G) * 0.14), (int)(color.B + (255 - color.B) * 0.14));
    }

    protected override void OnPaint(PaintEventArgs e)
    {
      base.OnPaint(e);
      e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
      using (GraphicsPath path = Gfx.Round(1f, 1f, Width - 3f, Height - 3f, S(18)))
      using (Pen pen = new Pen(Pal.Accent, Math.Max(2f, scale * 2f)))
      {
        e.Graphics.DrawPath(pen, path);
      }
    }

    /// <summary>Le serveur a refusé l'adresse : on le dit dans la carte, sans la refermer.</summary>
    public void ShowError(string text)
    {
      if (message != null) message.Text = text;
    }

    /// <summary>Se pose sous la carte de la bannière, alignée à sa droite ; au-dessus si le bas de l'écran manque de place.</summary>
    public void Place(Rectangle card)
    {
      Rectangle area = Screen.FromRectangle(card).WorkingArea;
      int x = card.Right - Width;
      int y = card.Bottom + S(10);
      if (y + Height > area.Bottom) y = Math.Max(area.Top, card.Top - Height - S(10));
      if (x < area.Left) x = area.Left;
      if (x + Width > area.Right) x = area.Right - Width;
      Location = new Point(x, y);
      Native.SetWindowPos(Handle, Native.HWND_TOPMOST, 0, 0, 0, 0, Native.SWP_NOMOVE | Native.SWP_NOSIZE | Native.SWP_NOACTIVATE | Native.SWP_SHOWWINDOW);
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
      string text = emailText.Trim();
      if (!emailConsent) { message.Text = "Le patient doit d'abord donner son accord."; return; }
      if (!LooksLikeEmail(text)) { message.Text = "Cette adresse ne semble pas valide."; return; }
      EndTyping(true);
      if (Word != null) Word("EMAIL " + saleId + " " + Convert.ToBase64String(Encoding.UTF8.GetBytes(text)));
      if (Saved != null) Saved();
      Close();
    }

    private void LaterEmail()
    {
      EndTyping(true);
      Close();
    }

    /// <summary>
    /// Le seul moment où l'on prend le clavier : le pharmacien a cliqué dans le champ de l'e-mail. On retient la fenêtre qui était
    /// devant (le logiciel de gestion) pour la lui rendre aussitôt la saisie finie.
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
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
      EndTyping(true);
      base.OnFormClosing(e);
    }
  }

  internal static class TrayIcon
  {
    /// <summary>L'icône près de l'horloge : le logo PharmaBoost et, en pastille rouge, le nombre de conseils sans réponse.</summary>
    public static Bitmap Make(int count)
    {
      Bitmap bmp = new Bitmap(32, 32);
      using (Graphics g = Graphics.FromImage(bmp))
      {
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
        g.Clear(Color.Transparent);
        Gfx.Gradient(g, Pal.Accent, Pal.AccentDark, 1, 3, 26, 26, 8);
        g.FillRectangle(Gfx.Brs(Color.White), 12, 8, 4, 16);
        g.FillRectangle(Gfx.Brs(Color.White), 6, 14, 16, 4);
        if (count <= 0) return bmp;
        string label = count > 9 ? "9+" : count.ToString();
        using (Pen ring = new Pen(Color.White, 2f))
        using (Font font = new Font(Gfx.Face(), count > 9 ? 9f : 11f, FontStyle.Bold, GraphicsUnit.Pixel))
        {
          g.FillEllipse(Gfx.Brs(Color.FromArgb(255, 217, 45, 32)), 13, 0, 19, 19);
          g.DrawEllipse(ring, 13, 0, 19, 19);
          StringFormat center = new StringFormat();
          center.Alignment = StringAlignment.Center;
          center.LineAlignment = StringAlignment.Center;
          g.DrawString(label, font, Gfx.Brs(Color.White), new RectangleF(13, 0, 19, 19), center);
        }
      }
      return bmp;
    }
  }

  /// <summary>Le chef d'orchestre : la bannière, le champ e-mail, l'icône près de l'horloge, la ligne de commande.</summary>
  public class Host : ApplicationContext
  {
    private readonly NotifyIcon tray = new NotifyIcon();
    private readonly ContextMenuStrip menu = new ContextMenuStrip();
    private readonly System.Windows.Forms.Timer ageTimer = new System.Windows.Forms.Timer();
    private readonly System.Windows.Forms.Timer followTimer = new System.Windows.Forms.Timer();
    private readonly Control ui = new Control();
    private readonly JavaScriptSerializer json = new JavaScriptSerializer();
    private BannerForm banner;
    private EmailForm email;
    private IntPtr iconHandle = IntPtr.Zero;
    private int iconCount = -1;
    private string position = "haut-droite";
    private string positionFile = "";

    public Host()
    {
      ui.CreateControl();
      IntPtr unused = ui.Handle;
      tray.ContextMenuStrip = menu;
      tray.MouseClick += delegate (object sender, MouseEventArgs e) { if (e.Button == MouseButtons.Left && banner != null && !banner.IsDisposed) banner.Reveal(); };
      menu.Opening += delegate { BuildMenu(); };
      ageTimer.Interval = 60000;
      ageTimer.Tick += delegate { if (banner != null && !banner.IsDisposed) banner.Expire(); };
      ageTimer.Start();
      followTimer.Interval = 300;
      followTimer.Tick += delegate { FollowBanner(); };

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
        string where = Str(command, "position");
        if (where.Length > 0) position = where;
        string file = Str(command, "positionFile");
        if (file.Length > 0) positionFile = file;
        if (op == "init") Begin();
        else if (op == "scan") { Begin(); banner.BeginScan(); }
        else if (op == "show")
        {
          Dictionary<string, object> raw = command.ContainsKey("entry") ? command["entry"] as Dictionary<string, object> : null;
          if (raw != null) Show(Parse(raw));
        }
        else if (op == "done")
        {
          Dictionary<string, object> raw = command.ContainsKey("info") ? command["info"] as Dictionary<string, object> : null;
          if (raw != null && banner != null) { banner.ApplyDone(ParseDone(raw)); CloseEmail(); }
        }
        else if (op == "remove") { if (banner != null) banner.RemoveSale(Str(command, "id")); }
        else if (op == "quit") Quit();
      }
      catch (Exception problem)
      {
        Say("ERREUR commande " + Gfx.Shorten(problem.Message.Replace("\r", " ").Replace("\n", " "), 120));
      }
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
      foreach (object g in Seq(d, "guidance")) e.Guidance.Add(Convert.ToString(g));
      foreach (object q in Seq(d, "questions"))
      {
        Dictionary<string, object> rq = q as Dictionary<string, object>;
        if (rq == null) continue;
        Question question = new Question();
        question.Node = Str(rq, "node");
        question.Text = Str(rq, "text");
        question.Multi = Flag(rq, "multi");
        foreach (object c in Seq(rq, "choices"))
        {
          Dictionary<string, object> rc = c as Dictionary<string, object>;
          if (rc == null) continue;
          Choice choice = new Choice();
          choice.Key = Str(rc, "key");
          choice.Label = Str(rc, "label");
          choice.Selected = Flag(rc, "selected");
          question.Choices.Add(choice);
        }
        if (question.Node.Length > 0 && question.Choices.Count > 0) e.Questions.Add(question);
      }
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
        item.Quantity = Str(raw, "quantity");
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

    /// <summary>La bannière existe, visible, « En attente de scan… ». Appelée par « init », et par tout ce qui l'oublierait.</summary>
    private void Begin()
    {
      if (banner == null || banner.IsDisposed)
      {
        banner = new BannerForm();
        banner.Word += delegate (string word) { OnBannerWord(word); };
        banner.EmailRequested += delegate { OpenEmail(""); };
        banner.Changed += delegate { RefreshTray(); };
        banner.Ended += delegate { CloseEmail(); };
        banner.DoneEnded += delegate (string id) { if (id.Length > 0) Say("FERMEE " + id); };
      }
      banner.Start(positionFile, position);
      tray.Visible = true;
      RefreshTray();
    }

    private void Show(Entry entry)
    {
      Begin();
      banner.ApplyEntry(entry);
      if (entry.EmailError.Length > 0) OpenEmail(entry.EmailError);
      else if (entry.EmailSaved) CloseEmail();
      RefreshTray();
    }

    /// <summary>Ce que la bannière dit : les réponses vont à l'agent ; « Voir le détail » ouvre la vente dans PharmaBoost.</summary>
    private void OnBannerWord(string word)
    {
      if (word.StartsWith("VOIR "))
      {
        string url = banner != null ? banner.SaleUrl : "";
        try { if (!string.IsNullOrEmpty(url)) Process.Start(url); } catch (Exception) { }
      }
      Say(word);
    }

    private void OpenEmail(string error)
    {
      if (banner == null || banner.IsDisposed || !banner.SaleOpen) return;
      if (email != null && !email.IsDisposed)
      {
        if (error.Length > 0) email.ShowError(error);
        email.Place(banner.CardBounds());
        return;
      }
      email = new EmailForm(banner.SaleId, error);
      email.Word += delegate (string word) { Say(word); };
      email.Saved += delegate { if (banner != null && !banner.IsDisposed) banner.MarkEmailSaved(); };
      email.FormClosed += delegate { email = null; followTimer.Stop(); };
      email.Show();
      email.Place(banner.CardBounds());
      followTimer.Start();
    }

    private void CloseEmail()
    {
      if (email != null && !email.IsDisposed) email.Close();
      email = null;
      followTimer.Stop();
    }

    /// <summary>Le champ e-mail suit la bannière quand elle bouge ou change de taille ; il se range si la bannière se masque.</summary>
    private void FollowBanner()
    {
      if (email == null || email.IsDisposed) { followTimer.Stop(); return; }
      if (banner == null || banner.IsDisposed || banner.Hidden) { CloseEmail(); return; }
      email.Place(banner.CardBounds());
    }

    private void BuildMenu()
    {
      menu.Items.Clear();
      int open = banner != null ? banner.Unanswered() : 0;
      string head = (banner != null && banner.SaleOpen) ? "PharmaBoost — " + open + (open > 1 ? " conseils sans réponse" : " conseil sans réponse") : "PharmaBoost — en attente de scan";
      ToolStripMenuItem title = new ToolStripMenuItem(head);
      title.Enabled = false;
      menu.Items.Add(title);
      menu.Items.Add(new ToolStripSeparator());
      if (banner == null || banner.IsDisposed) return;
      menu.Items.Add("Afficher la bannière", null, delegate { banner.Reveal(); });
      menu.Items.Add(banner.Reduced ? "Agrandir la bannière" : "Réduire la bannière", null, delegate { banner.SetReduced(!banner.Reduced); });
      menu.Items.Add("Masquer la bannière", null, delegate { banner.HideByUser(); });
      ToolStripMenuItem pin = new ToolStripMenuItem("Verrouiller la position");
      pin.Checked = banner.Pinned;
      pin.Click += delegate { banner.SetPinned(!banner.Pinned); };
      menu.Items.Add(pin);
      if (banner.SaleOpen)
      {
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Vente terminée", null, delegate { Say("TERMINER " + banner.SaleId); });
      }
    }

    /// <summary>L'icône près de l'horloge reste toujours là (c'est le moyen de retrouver une bannière masquée) ; elle porte le nombre de conseils sans réponse.</summary>
    private void RefreshTray()
    {
      int open = banner != null && !banner.IsDisposed ? banner.Unanswered() : 0;
      if (open != iconCount)
      {
        iconCount = open;
        IntPtr previous = iconHandle;
        using (Bitmap bmp = TrayIcon.Make(open))
        {
          iconHandle = bmp.GetHicon();
          tray.Icon = Icon.FromHandle(iconHandle);
        }
        if (previous != IntPtr.Zero) Native.DestroyIcon(previous);
      }
      string tip = open > 0 ? "PharmaBoost — " + open + (open > 1 ? " conseils sans réponse" : " conseil sans réponse") : "PharmaBoost";
      tray.Text = tip.Length > 63 ? tip.Substring(0, 62) + "…" : tip;
    }

    private void Quit()
    {
      ageTimer.Stop();
      followTimer.Stop();
      tray.Visible = false;
      tray.Dispose();
      if (email != null && !email.IsDisposed) email.Dispose();
      if (banner != null && !banner.IsDisposed) banner.Dispose();
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

// agent/src/notice-host-classique.ts
var NOTICE_HOST_CLASSIC_CSHARP = String.raw`
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
    public string Quantity = "";
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

    public static void Availability(string code, string quantity, out string text, out Color back, out Color fore)
    {
      if (code == "IN_STOCK") { text = "En stock" + (quantity.Length > 0 ? " · " + quantity : ""); back = Color.FromArgb(220, 250, 230); fore = Color.FromArgb(6, 118, 71); }
      else if (code == "LOW_STOCK") { text = "Stock faible" + (quantity.Length > 0 ? " · " + quantity : ""); back = Color.FromArgb(254, 240, 199); fore = Color.FromArgb(181, 71, 8); }
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
      Look.Availability(item.Availability, item.Quantity, out availabilityText, out availabilityBack, out availabilityFore);
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
        item.Quantity = Str(raw, "quantity");
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
var NOTICE_HOST_CLASSIC_SCRIPT = `$ErrorActionPreference = "Stop"
$code = @'
${NOTICE_HOST_CLASSIC_CSHARP}
'@
Add-Type -TypeDefinition $code -ReferencedAssemblies System.Windows.Forms,System.Drawing,System.Web.Extensions
[PharmaBoostAvis.Program]::Run()
`;

// agent/src/notice-center.ts
var MAX_RESTARTS = 5;
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
    quantity: Number.isInteger(item.quantity) && item.quantity >= 0 ? String(item.quantity) : "",
    image: item.imageUrl && images.get(item.imageUrl) || ""
  }));
  const legacyOnly = body.items === void 0 && body.advice.length > 0;
  const alerts = [...body.alerts.map(oneLine), ...input.problem ? [oneLine(input.problem)] : []];
  const questions = (body.questions ?? []).map((question) => ({
    node: question.node,
    text: oneLine(question.text),
    multi: question.mode === "MULTI",
    choices: question.choices.map((choice) => ({ key: choice.key, label: oneLine(choice.label), selected: choice.selected === true }))
  }));
  const notes = items.length === 0 && !legacyOnly ? body.advice.map(oneLine) : [];
  const finalItems = legacyOnly ? body.advice.map((text) => ({ id: "", drug: "", challenge: "", shortDate: "", outcome: "NONE", name: oneLine(text), price: "", reason: "", availability: "UNKNOWN", quantity: "", image: "" })) : items;
  return {
    id: input.prescriptionId,
    reference: referenceOf(body.title),
    label: body.detectedLabel ?? "D\xE9tect\xE9",
    subject: oneLine(body.subject),
    url: `${input.serverUrl.replace(/\/$/, "")}/vente/${input.prescriptionId}`,
    signature: body.signature,
    // Une question à poser n'est pas « rien à conseiller » : la fenêtre doit s'ouvrir.
    quiet: finalItems.length === 0 && alerts.length === 0 && questions.length === 0,
    emailSaved: body.followUp?.emailSaved === true,
    emailError: oneLine(input.emailError ?? ""),
    alerts,
    notes,
    questions,
    guidance: (body.guidance ?? []).map(oneLine).filter(Boolean),
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
  /** Quelle fenêtre tourne : la bannière, ou — si elle n'a pas pu démarrer ou se dessiner — l'ancienne fenêtre. */
  window = "banniere";
  restarts = 0;
  resume = null;
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
    if (preferences.window !== void 0 && preferences.window !== this.window && !this.host) this.window = preferences.window;
    if (preferences.seconds !== void 0) this.options.seconds = Math.max(5, Math.min(120, Math.round(preferences.seconds)));
    if (preferences.position !== void 0 && POSITIONS.includes(preferences.position)) this.options.position = preferences.position;
  }
  /**
   * Lance la bannière. Au démarrage du poste elle apparaît tout de suite, « En attente de scan… » ; sa préparation (PowerShell,
   * compilation du code : quelques secondes) se fait ainsi bien avant le premier bip : le premier conseil de la journée n'attend plus.
   * (L'ancienne fenêtre, elle, reste invisible tant qu'il n'y a rien à montrer.)
   */
  warmUp() {
    if (this.platform !== "win32" || this.broken || this.forcedLegacy) return;
    this.ensureHost();
  }
  /** Les ventes que la fenêtre garde ouvertes. */
  ids() {
    return [...this.held.keys()];
  }
  /** Un bip vient d'être lu : « Scan détecté ! Analyse en cours… », avant même que le serveur ait répondu. */
  scanning() {
    if (this.platform !== "win32" || this.broken || this.forcedLegacy || this.window !== "banniere") return;
    if (!this.ensureHost()) return;
    this.send({ op: "scan" });
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
    this.send({ op: "show", entry, ...this.placement() });
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
  /** Où se pose la fenêtre : la bannière en haut à droite, l'ancienne fenêtre à mi-hauteur ; chacune retient sa position dans son fichier. */
  placement() {
    return this.window === "banniere" ? { position: this.options.position ?? "haut-droite", positionFile: (0, import_node_path4.join)(this.options.configDir, "pharmaboost-banniere-position.txt") } : { position: this.options.position ?? "milieu-droite", positionFile: (0, import_node_path4.join)(this.options.configDir, "pharmaboost-avis-position.txt") };
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
      const banner = this.window === "banniere";
      const scriptPath = (0, import_node_path4.join)(this.options.configDir, banner ? "pharmaboost-banniere-hote.ps1" : "pharmaboost-avis-hote.ps1");
      (0, import_node_fs4.writeFileSync)(scriptPath, `\uFEFF${banner ? NOTICE_HOST_SCRIPT : NOTICE_HOST_CLASSIC_SCRIPT}`, "utf8");
      const host = this.options.spawnHost ? this.options.spawnHost(scriptPath) : this.spawnReal(scriptPath);
      this.host = host;
      this.ready = false;
      this.stderrText = "";
      host.stdin.on("error", () => {
      });
      host.stdout.on("data", (chunk) => {
        if (this.host === host) this.onOutput(String(chunk));
      });
      host.stderr.on("data", (chunk) => {
        if (this.host === host) this.onError(String(chunk));
      });
      host.on("exit", () => {
        if (this.host === host) this.onExit();
      });
      host.on("error", (error) => {
        if (this.host === host) this.giveUp(`le processus n'a pas d\xE9marr\xE9 (${error.message})`);
      });
      this.startTimer = setTimeout(() => {
        if (!this.ready) this.giveUp("la fen\xEAtre n'a pas d\xE9marr\xE9 \xE0 temps");
      }, this.options.startTimeoutMs ?? 6e4);
      this.startTimer.unref?.();
      if (banner) this.send({ op: "init", ...this.placement() });
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
        this.options.log(`Avis : ${this.window === "banniere" ? "banni\xE8re" : "fen\xEAtre"} pr\xEAte.`);
        const resume = this.resume;
        this.resume = null;
        if (resume) this.show(resume);
      } else {
        this.onWord(line);
      }
    }
  }
  /** Un mot de la fenêtre : la réponse du pharmacien à un geste. Un mot inconnu est ignoré, jamais une panne. */
  onWord(line) {
    if (line.startsWith("ERREUR dessin") && this.window === "banniere") {
      this.fallBackToClassic(`la banni\xE8re n'arrive pas \xE0 se dessiner (${line.slice(14, 160)})`);
      return;
    }
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
    else if (word === "REPONSE" && argument) {
      const [node, choice] = argument.split(":");
      if (node && choice && /^[\w-]+$/.test(node) && /^[\w-]+$/.test(choice)) act({ kind: "answer", saleId, node, choice });
    } else if (word === "VOIR") act({ kind: "view", saleId });
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
    const resume = this.lastEntry && this.held.has(this.lastEntry.id) ? this.lastEntry : null;
    this.host = null;
    this.ready = false;
    this.held.clear();
    if (!wasReady && !this.broken) this.giveUp("la fen\xEAtre s'est arr\xEAt\xE9e avant d'\xEAtre pr\xEAte");
    else if (wasReady && this.window === "banniere" && !this.broken && this.restarts < MAX_RESTARTS) {
      this.restarts += 1;
      this.options.log(`Avis : la banni\xE8re s'est arr\xEAt\xE9e ; elle repart (${this.restarts}/${MAX_RESTARTS}).`);
      this.resume = resume;
      const timer = setTimeout(() => this.warmUp(), 3e3);
      timer.unref?.();
    } else if (wasReady) this.options.log("Avis : la fen\xEAtre s'est arr\xEAt\xE9e ; elle red\xE9marrera au prochain conseil.");
  }
  /** La bannière ne peut pas tourner sur ce poste : on passe à l'ancienne fenêtre à bordure, et on le dit. */
  fallBackToClassic(reason) {
    this.options.log(`Avis : ${reason} ; retour \xE0 l'ancienne fen\xEAtre.`);
    if (this.startTimer) clearTimeout(this.startTimer);
    const host = this.host;
    this.host = null;
    this.ready = false;
    this.held.clear();
    if (host) {
      try {
        host.kill();
      } catch {
      }
    }
    this.window = "classique";
    const entry = this.resume ?? this.lastEntry;
    this.resume = null;
    if (entry && !entry.quiet) this.show(entry);
  }
  /** Plus aucune fenêtre ne peut tourner sur ce poste : la notification Windows prend le relais, et on le dit. */
  giveUp(reason) {
    if (this.window === "banniere" && !this.broken) {
      this.fallBackToClassic(`la banni\xE8re ne d\xE9marre pas (${reason})`);
      return;
    }
    if (this.broken) return;
    this.broken = true;
    if (this.startTimer) clearTimeout(this.startTimer);
    this.options.log(`Avis : la fen\xEAtre ne d\xE9marre pas (${reason}) ; retour \xE0 la notification Windows.`);
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

// agent/src/robot-lgpi.ts
var import_node_fs7 = require("node:fs");
var import_node_path6 = require("node:path");

// agent/src/journal-line.ts
var JOURNAL_DIRS = ["C:\\var\\log\\lgpi\\application", "D:\\var\\log\\lgpi\\application", "C:\\var\\log\\lgpi", "D:\\var\\log\\lgpi"];
var ENTRY = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})[,.]\d{3}\s+(\w+)\s+\[([^\]]*)\]\s+(\S+)\s+-\s+(.*)$/;
function parseEntry(line) {
  const match = ENTRY.exec(line);
  return match ? { date: match[1], time: match[2], level: match[3], thread: match[4], logger: match[5], message: match[6] } : null;
}

// agent/src/robot-lgpi.ts
var CYCLE_START = /:\s*Demande\s+\S{1,3}\s+la\s/;
var CYCLE_END = /\bFin de la demande\b/;
var CYCLE_GIVEN_UP = /\bon n.en \S+ pas\b/;
var PRODUCT_CODE = /Code produit\s+(\d{7}|\d{13})\b/;
var RESPONSE_CODE = /\b[A-Za-z]+_13\s*=\s*(\d{13})\b/g;
var MAX_CODES_PER_CYCLE = 50;
var RESPONSE_WAIT_MS = 3e3;
var LgpiRobotReader = class {
  cycle = null;
  pending = null;
  /** Compteurs pour le rapport de lecture : combien de demandes ont abouti, combien ont été laissées de côté. */
  finished = 0;
  givenUp = 0;
  /** Une ligne de plus. `now` : l'heure de ce poste en millisecondes (pas celle du journal). Rend les codes à annoncer, dans l'ordre. */
  push(line, now) {
    const entry = parseEntry(line);
    if (!entry) return [];
    const out = [];
    const isResponse = /(?:AutomateMessageEventGenerator|ClientAutomates)$/.test(entry.logger) && entry.message.includes("StockOutputResponse(");
    if (this.pending) {
      if (isResponse) {
        out.push(...this.settle(entry.message));
        return out;
      }
      out.push(...this.settle(null));
    }
    if (!/ControlerAutomate$/.test(entry.logger)) return out;
    const { message } = entry;
    if (CYCLE_END.test(message)) {
      const codes = this.cycle ?? [];
      this.cycle = null;
      if (codes.length > 0) {
        this.finished += 1;
        this.pending = { codes, since: now };
      }
    } else if (CYCLE_START.test(message)) {
      if (this.cycle && this.cycle.length > 0) this.givenUp += 1;
      this.cycle = [];
    } else if (CYCLE_GIVEN_UP.test(message)) {
      if (this.cycle && this.cycle.length > 0) this.givenUp += 1;
      this.cycle = null;
    } else if (this.cycle) {
      const code = PRODUCT_CODE.exec(message)?.[1];
      if (code && !this.cycle.includes(code) && this.cycle.length < MAX_CODES_PER_CYCLE) this.cycle.push(code);
    }
    return out;
  }
  /** À appeler régulièrement : la réponse du robot qui ne vient pas n'empêche pas d'annoncer. */
  flush(now) {
    return this.pending && now - this.pending.since >= RESPONSE_WAIT_MS ? this.settle(null) : [];
  }
  /**
   * Annonce les produits du cycle terminé. Un code à 7 chiffres n'est pas toujours un CIP : LGPI en donne aux produits
   * qu'il a lui-même numérotés (le journal montre un lecteur de glycémie demandé sous « 5162291 » alors que la réponse
   * du robot porte son code-barres, 4015630063253). Quand le cycle n'a qu'un code à 7 chiffres et que la réponse en
   * donne un seul à 13, c'est ce dernier que PharmaBoost sait retrouver.
   */
  settle(responseMessage) {
    const pending = this.pending;
    this.pending = null;
    if (!pending) return [];
    const { codes } = pending;
    if (responseMessage && codes.length === 1 && codes[0].length === 7) {
      const found = [...new Set([...responseMessage.matchAll(RESPONSE_CODE)].map((match) => match[1]))];
      if (found.length === 1) return found;
    }
    return codes;
  }
};
var POLL_MS2 = 1e3;
var MAX_READ_BYTES2 = 1024 * 1024;
function two(n) {
  return String(n).padStart(2, "0");
}
function journalName(date) {
  return `lgpi.${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}.log`;
}
function findJournalDir(dirs) {
  return dirs.find((dir) => (0, import_node_fs7.existsSync)(dir)) ?? null;
}
function readChunk(path, offset, size) {
  const length = Math.min(size - offset, MAX_READ_BYTES2);
  const buffer = Buffer.alloc(length);
  const fd = (0, import_node_fs7.openSync)(path, "r");
  try {
    (0, import_node_fs7.readSync)(fd, buffer, 0, length, offset);
  } finally {
    (0, import_node_fs7.closeSync)(fd);
  }
  return buffer;
}
function startLgpiJournal(config, handlers, clock = Date.now) {
  const reader = new LgpiRobotReader();
  let lines = new LineBuffer();
  let current2 = null;
  let firstPass = true;
  let announcedMissing = false;
  const announce = (codes, at) => {
    for (const code of codes) {
      handlers.onStatus(`Robot : demande de sortie du produit ${code}.`);
      handlers.onScan(code, at);
    }
  };
  const drain = (path, from) => {
    let offset = from;
    for (; ; ) {
      const size = (0, import_node_fs7.statSync)(path).size;
      if (size < offset) offset = 0;
      if (size === offset) return offset;
      const buffer = readChunk(path, offset, size);
      offset += buffer.length;
      const at = clock();
      for (const line of lines.push(buffer.toString("latin1"))) announce(reader.push(line, at), at);
    }
  };
  const poll = () => {
    try {
      const now = clock();
      const dir = config.dir ?? findJournalDir(JOURNAL_DIRS);
      if (!dir) {
        if (!announcedMissing) handlers.onStatus("Robot : le journal de LGPI n'existe pas sur ce poste (rien \xE0 suivre).");
        announcedMissing = true;
        return;
      }
      const today = (0, import_node_path6.join)(dir, journalName(new Date(now)));
      if (!current2) {
        if (!(0, import_node_fs7.existsSync)(today)) {
          if (!announcedMissing) handlers.onStatus(`Robot : le journal du jour de LGPI n'existe pas (encore) dans ${dir}.`);
          announcedMissing = true;
          firstPass = false;
          return;
        }
        announcedMissing = false;
        const offset = firstPass ? (0, import_node_fs7.statSync)(today).size : 0;
        current2 = { path: today, offset };
        firstPass = false;
        handlers.onStatus(`Robot : suivi du journal de LGPI ${journalName(new Date(now))}${offset === 0 ? "" : " \xE0 partir de maintenant"}.`);
        if (offset === 0) current2.offset = drain(today, 0);
      } else if (current2.path !== today && (0, import_node_fs7.existsSync)(today)) {
        if ((0, import_node_fs7.existsSync)(current2.path)) drain(current2.path, current2.offset);
        lines = new LineBuffer();
        current2 = { path: today, offset: 0 };
        handlers.onStatus(`Robot : nouveau journal du jour ${journalName(new Date(now))}.`);
        current2.offset = drain(today, 0);
      } else if ((0, import_node_fs7.existsSync)(current2.path)) {
        current2.offset = drain(current2.path, current2.offset);
      }
      announce(reader.flush(now), now);
    } catch (error) {
      handlers.onStatus(`Robot : ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  const timer = setInterval(poll, POLL_MS2);
  poll();
  return () => clearInterval(timer);
}

// agent/src/index.ts
var import_node_fs8 = require("node:fs");
var import_node_os = require("node:os");
var import_node_path7 = require("node:path");
var VERSION = "0.9.2";
var CONFIG_PATH = process.env.PHARMABOOST_CONNECT_CONFIG ?? (0, import_node_path7.join)(process.cwd(), "pharmaboost-connect.json");
var LOG_PATH = (0, import_node_path7.join)((0, import_node_path7.dirname)(CONFIG_PATH), "pharmaboost-connect.log");
var LOG_MAX_BYTES = 2 * 1024 * 1024;
var SETTLE_MS = 1e4;
var CHECK_MS = 3e4;
var DEFAULT_EXPORT = process.platform === "win32" ? "C:\\PharmaBoost\\Export" : (0, import_node_path7.join)(process.cwd(), "export");
var DEFAULT_SCANS = process.platform === "win32" ? "C:\\PharmaBoost\\Ordonnances" : null;
var notice = null;
function log(message) {
  const line = `${(/* @__PURE__ */ new Date()).toISOString()} ${message}`;
  console.log(line);
  try {
    (0, import_node_fs8.mkdirSync)((0, import_node_path7.dirname)(LOG_PATH), { recursive: true });
    if ((0, import_node_fs8.existsSync)(LOG_PATH) && (0, import_node_fs8.statSync)(LOG_PATH).size > LOG_MAX_BYTES) (0, import_node_fs8.renameSync)(LOG_PATH, `${LOG_PATH}.1`);
    (0, import_node_fs8.appendFileSync)(LOG_PATH, `${line}
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
  if (!(0, import_node_fs8.existsSync)(CONFIG_PATH)) return null;
  return JSON.parse((0, import_node_fs8.readFileSync)(CONFIG_PATH, "utf8"));
}
function writeConfig(config) {
  (0, import_node_fs8.mkdirSync)((0, import_node_path7.dirname)(CONFIG_PATH), { recursive: true });
  (0, import_node_fs8.writeFileSync)(CONFIG_PATH, JSON.stringify(config, null, 2));
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
var IMAGES_DIR = (0, import_node_path7.join)((0, import_node_path7.dirname)(CONFIG_PATH), "avis-images");
var notices = new NoticeCenter({
  configDir: (0, import_node_path7.dirname)(CONFIG_PATH),
  log: (message) => log(message),
  legacyShow: (content) => showToast((0, import_node_path7.dirname)(CONFIG_PATH), content, log),
  onAction: (action) => {
    void handleAction(action);
  }
});
function applyDisplayPreferences(config) {
  const wanted = config.affichage;
  notices.configure({
    seconds: typeof wanted?.secondes === "number" ? wanted.secondes : DEFAULT_NOTICE_SECONDS,
    // Sans réglage du poste, chaque fenêtre garde sa place par défaut : la bannière en haut à droite, l'ancienne fenêtre à mi-hauteur.
    ...wanted?.position && POSITIONS.includes(wanted.position) ? { position: wanted.position } : {},
    legacy: wanted?.ancienne === true,
    window: wanted?.fenetre === "classique" ? "classique" : "banniere"
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
    } else if (action.kind === "answer") {
      const result = await postJson(config, "/api/agent/conseil/question", { prescription: action.saleId, node: action.node, choice: action.choice });
      log(`Question ${action.node} \u2192 ${action.choice} : ${result.body?.ok ? "enregistr\xE9" : result.body?.error ?? `HTTP ${result.status}`}.`);
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
  applyDisplayPreferences(config);
  notices.warmUp();
  const scans = createScanQueue((scan) => sendScan(config, scan.code, scan.scannedAt));
  const dedupe = new CrossSourceDedupe();
  const accept = (source) => (code, at) => {
    if (dedupe.isDuplicate(code, source, at)) {
      log(`${source === "robot" ? "Robot" : "Bip"} ${code} ignor\xE9 : d\xE9j\xE0 annonc\xE9 \xE0 l'instant par ${source === "robot" ? "la douchette" : "le robot"}.`);
      return;
    }
    notices.scanning();
    scans.push({ code, scannedAt: new Date(at).toISOString() });
    scans.flush().catch((error) => log(`Bip en attente : ${error instanceof Error ? error.message : String(error)}`));
  };
  startDouchette((0, import_node_path7.dirname)(CONFIG_PATH), { onScan: accept("douchette"), onStatus: (message) => log(message) });
  const robotHandlers = { onScan: accept("robot"), onStatus: (message) => log(message) };
  const robot = config.robot ?? (process.platform === "win32" ? { kind: "lgpi" } : void 0);
  if (robot?.kind === "journal") startRobotJournal(robot, robotHandlers);
  else if (robot?.kind === "lgpi") startLgpiJournal(robot, robotHandlers);
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
function setRobotLgpi(on) {
  const config = readConfig();
  if (!config || config.role !== "poste") {
    console.log("Ce poste n'est pas encore reli\xE9 \xE0 PharmaBoost.");
    process.exitCode = 1;
    return;
  }
  writeConfig({ ...config, robot: on ? { kind: "lgpi" } : { kind: "aucun" } });
  console.log(on ? "Suivi du robot (journal de LGPI) allum\xE9." : "Suivi du robot \xE9teint.");
  console.log("Quittez PharmaBoost (ic\xF4ne pr\xE8s de l'horloge) puis relancez-le.");
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
    questions: [{ node: "why", text: "Pourquoi le patient prend-il DOLIPRANE 1000 mg ?", multi: true, choices: [{ key: "FEVER", label: "Fi\xE8vre", selected: false }, { key: "HEADACHE", label: "Mal de t\xEAte", selected: false }, { key: "PAIN", label: "Douleur localis\xE9e", selected: true }, { key: "OTHER", label: "Autre raison", selected: false }] }],
    guidance: [],
    items: [
      { id: "essai-1", drug: "AMOXICILLINE 1 g", challenge: "Challenge probiotiques", shortDate: "30/11/2026", outcome: "NONE", name: "PROBIOTIQUE 30 g\xE9lules", price: "14,90 \u20AC", reason: "Prot\xE9ger la flore pendant l'antibiotique", availability: "IN_STOCK", quantity: "12", image: "" },
      { id: "essai-2", drug: "DOLIPRANE 1000 mg", challenge: "", shortDate: "", outcome: "NONE", name: "S\xC9RUM PHYSIOLOGIQUE 30 unidoses", price: "5,90 \u20AC", reason: "", availability: "LOW_STOCK", quantity: "3", image: "" }
    ]
  };
  notices.show(entry);
  console.log("La banni\xE8re PharmaBoost doit appara\xEEtre en haut \xE0 droite de l'\xE9cran, avec une vente d'exemple (d\xE9pla\xE7able \xE0 la souris).");
  console.log("Elle reste ouverte : essayez \xAB Vendu \xBB, \xAB Non vendu \xBB, les petits boutons du haut (verrouiller, r\xE9duire, masquer). Rien n'est envoy\xE9.");
  setTimeout(() => {
    notices.stop();
    process.exit(0);
  }, 75e3);
}
function testDouchette() {
  console.log("Passez une bo\xEEte \xE0 la douchette. Chaque code lu s'affiche ci-dessous. Ctrl+C pour arr\xEAter.");
  startDouchette((0, import_node_path7.dirname)(CONFIG_PATH), {
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
        (0, import_node_fs8.mkdirSync)(dir, { recursive: true });
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
  if (!(0, import_node_fs8.existsSync)(dir)) return null;
  const st = (0, import_node_fs8.statSync)(dir);
  if (st.isFile()) return { path: dir, mtime: st.mtimeMs, size: st.size };
  const files = (0, import_node_fs8.readdirSync)(dir).filter((name) => /\.(csv|txt|xlsx|xls|pdf)$/i.test(name) && !name.startsWith("~$")).map((name) => {
    const s = (0, import_node_fs8.statSync)((0, import_node_path7.join)(dir, name));
    return { path: (0, import_node_path7.join)(dir, name), mtime: s.mtimeMs, size: s.size };
  }).sort((a, b) => b.mtime - a.mtime);
  return files[0] ?? null;
}
var lastStamp = null;
async function syncStock(config, force) {
  if (!config.exportPath) return config;
  if (!(0, import_node_fs8.existsSync)(config.exportPath)) {
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
  const bytes = (0, import_node_fs8.readFileSync)(file.path);
  const hash = (0, import_node_crypto3.createHash)("sha256").update(bytes).digest("hex");
  if (hash === config.lastExportHash) {
    if (notice?.startsWith("Aucun export") || notice?.startsWith("Le dossier")) setNotice(null);
    return config;
  }
  const form = new FormData();
  form.set("file", new Blob([bytes]), (0, import_node_path7.basename)(file.path));
  const response = await api(config, "/api/agent/stock", { method: "POST", body: form });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok) {
    setNotice(`Export refus\xE9 (${(0, import_node_path7.basename)(file.path)}) : ${body.error ?? `HTTP ${response.status}`}`);
    return config;
  }
  setNotice(null);
  log(`Stock synchronis\xE9 : ${body.lines ?? "?"} ligne(s), ${body.created ?? 0} cr\xE9\xE9e(s), ${body.updated ?? 0} mise(s) \xE0 jour (${(0, import_node_path7.basename)(file.path)}).`);
  return { ...config, lastExportHash: hash };
}
async function syncScans(config) {
  if (!config.scansPath || !(0, import_node_fs8.existsSync)(config.scansPath)) return config;
  const sent = new Set(config.sentScans ?? []);
  const files = (0, import_node_fs8.readdirSync)(config.scansPath).filter((name) => /\.(pdf|jpe?g|png|webp)$/i.test(name)).map((name) => ({ path: (0, import_node_path7.join)(config.scansPath, name), stat: (0, import_node_fs8.statSync)((0, import_node_path7.join)(config.scansPath, name)) })).filter(({ stat }) => Date.now() - stat.mtimeMs > SETTLE_MS).sort((a, b) => a.stat.mtimeMs - b.stat.mtimeMs);
  let next = config;
  for (const { path, stat } of files) {
    const key = `${(0, import_node_path7.basename)(path)}:${stat.size}`;
    if (sent.has(key)) continue;
    const mime = { ".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" }[(0, import_node_path7.extname)(path).toLowerCase()] ?? "application/octet-stream";
    const form = new FormData();
    form.set("file", new Blob([(0, import_node_fs8.readFileSync)(path)], { type: mime }), (0, import_node_path7.basename)(path));
    const response = await api(config, "/api/agent/prescriptions", { method: "POST", body: form });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) {
      log(`Scan refus\xE9 (${(0, import_node_path7.basename)(path)}) : ${body.error ?? `HTTP ${response.status}`}`);
      continue;
    }
    sent.add(key);
    next = { ...next, sentScans: [...sent].slice(-2e3) };
    writeConfig(next);
    log(`Ordonnance envoy\xE9e : ${(0, import_node_path7.basename)(path)} \u2192 ${body.reference ?? "?"} (${body.lines ?? 0} ligne(s) lue(s)).`);
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
} else if (process.argv.includes("--robot-lgpi")) {
  setRobotLgpi(true);
} else if (process.argv.includes("--robot-aucun")) {
  setRobotLgpi(false);
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
