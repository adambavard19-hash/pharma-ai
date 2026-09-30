#!/usr/bin/env node
"use strict";

// agent/src/index.ts
var import_node_crypto = require("node:crypto");

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

// agent/src/index.ts
var import_node_fs3 = require("node:fs");
var import_node_os = require("node:os");
var import_node_path3 = require("node:path");
var VERSION = "0.4.0";
var CONFIG_PATH = process.env.PHARMABOOST_CONNECT_CONFIG ?? (0, import_node_path3.join)(process.cwd(), "pharmaboost-connect.json");
var LOG_PATH = (0, import_node_path3.join)((0, import_node_path3.dirname)(CONFIG_PATH), "pharmaboost-connect.log");
var LOG_MAX_BYTES = 2 * 1024 * 1024;
var SETTLE_MS = 1e4;
var CHECK_MS = 3e4;
var DEFAULT_EXPORT = process.platform === "win32" ? "C:\\PharmaBoost\\Export" : (0, import_node_path3.join)(process.cwd(), "export");
var DEFAULT_SCANS = process.platform === "win32" ? "C:\\PharmaBoost\\Ordonnances" : null;
var notice = null;
function log(message) {
  const line = `${(/* @__PURE__ */ new Date()).toISOString()} ${message}`;
  console.log(line);
  try {
    (0, import_node_fs3.mkdirSync)((0, import_node_path3.dirname)(LOG_PATH), { recursive: true });
    if ((0, import_node_fs3.existsSync)(LOG_PATH) && (0, import_node_fs3.statSync)(LOG_PATH).size > LOG_MAX_BYTES) (0, import_node_fs3.renameSync)(LOG_PATH, `${LOG_PATH}.1`);
    (0, import_node_fs3.appendFileSync)(LOG_PATH, `${line}
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
  if (!(0, import_node_fs3.existsSync)(CONFIG_PATH)) return null;
  return JSON.parse((0, import_node_fs3.readFileSync)(CONFIG_PATH, "utf8"));
}
function writeConfig(config) {
  (0, import_node_fs3.mkdirSync)((0, import_node_path3.dirname)(CONFIG_PATH), { recursive: true });
  (0, import_node_fs3.writeFileSync)(CONFIG_PATH, JSON.stringify(config, null, 2));
}
async function api(config, path, init) {
  return fetch(`${config.serverUrl.replace(/\/$/, "")}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${config.agentKey}`, "X-Agent-Version": VERSION, ...init.headers ?? {} }
  });
}
async function pairPost() {
  const code = arg("poste");
  const serverUrl = arg("serveur") ?? "https://pharmaboost.app";
  const response = await fetch(`${serverUrl.replace(/\/$/, "")}/api/agent/pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, role: "poste", hostname: (0, import_node_os.hostname)(), version: VERSION })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok || !body.agentKey) throw new Error(body.error ?? `Appairage refus\xE9 (HTTP ${response.status}).`);
  writeConfig({ serverUrl, agentKey: body.agentKey, role: "poste", lgo: arg("lgo") ?? "lgpi", exportPath: null, scansPath: null, intervalSeconds: 300 });
  log(`Poste ${body.postLabel ?? (0, import_node_os.hostname)()} reli\xE9 \xE0 ${body.pharmacyName ?? "l'officine"}. Configuration \xE9crite dans ${CONFIG_PATH}.`);
}
var pendingScans = [];
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
  if (body.prescriptionId) watchPrescription(body.prescriptionId);
}
async function flushScans(config) {
  while (pendingScans.length > 0) {
    const next = pendingScans[0];
    await sendScan(config, next.code, next.scannedAt);
    pendingScans.shift();
  }
}
var TOAST_SECONDS = 15;
var WATCH_MS = 12e4;
var watched = null;
function watchPrescription(prescriptionId) {
  watched = { prescriptionId, since: Date.now(), shownSignature: watched?.prescriptionId === prescriptionId ? watched.shownSignature : null };
}
async function pollNotice(config) {
  if (!watched) return;
  if (Date.now() - watched.since > WATCH_MS) {
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
    watched = null;
    return;
  }
  if (body.state !== "READY" || body.signature === watched.shownSignature) return;
  watched.shownSignature = body.signature;
  const url = `${config.serverUrl.replace(/\/$/, "")}/vente/${watched.prescriptionId}`;
  showToast((0, import_node_path3.dirname)(CONFIG_PATH), { title: body.title, subject: body.subject, alerts: body.alerts, advice: body.advice, url, seconds: TOAST_SECONDS }, log);
  log(`Avis affich\xE9 : ${body.subject} \u2014 ${body.alerts.length} alerte(s), ${body.advice.length} conseil(s).`);
}
async function runPost(config) {
  log(`PharmaBoost Connect ${VERSION} \u2014 poste de caisse ${(0, import_node_os.hostname)()} \u2014 journal : ${LOG_PATH}`);
  startDouchette((0, import_node_path3.dirname)(CONFIG_PATH), {
    onScan: (code, at) => {
      pendingScans.push({ code, scannedAt: new Date(at).toISOString() });
      flushScans(config).catch((error) => log(`Bip en attente : ${error instanceof Error ? error.message : String(error)}`));
    },
    onStatus: (message) => log(message)
  });
  let lastHeartbeat = 0;
  for (; ; ) {
    try {
      if (pendingScans.length > 0) await flushScans(config);
      await pollNotice(config);
      if (Date.now() - lastHeartbeat > 6e4) {
        await heartbeat(config);
        lastHeartbeat = Date.now();
      }
    } catch (error) {
      log(`Erreur : ${error instanceof Error ? error.message : String(error)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, watched ? 2e3 : 3e3));
  }
}
function testAffichage() {
  showToast((0, import_node_path3.dirname)(CONFIG_PATH), {
    title: "PharmaBoost \xB7 essai d'affichage",
    subject: "DOLIPRANE 1000 mg \xB7 AMOXICILLINE 1 g",
    alerts: [],
    advice: ["PROBIOTIQUE 30 g\xE9lules \xB7 14,90 \u20AC \xB7 Prot\xE9ger la flore pendant l'antibiotique", "Exemple : l'avis r\xE9el vient de l'analyse de la vente"],
    url: "https://pharmaboost.app/vente/nouvelle",
    seconds: 15
  }, (message) => console.log(`  ${message}`));
  console.log("Un avis d'exemple doit appara\xEEtre en bas \xE0 droite de l'\xE9cran, pendant 15 secondes.");
  setTimeout(() => process.exit(0), 2e4);
}
function testDouchette() {
  console.log("Passez une bo\xEEte \xE0 la douchette. Chaque code lu s'affiche ci-dessous. Ctrl+C pour arr\xEAter.");
  startDouchette((0, import_node_path3.dirname)(CONFIG_PATH), {
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
        (0, import_node_fs3.mkdirSync)(dir, { recursive: true });
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
  if (!(0, import_node_fs3.existsSync)(dir)) return null;
  const st = (0, import_node_fs3.statSync)(dir);
  if (st.isFile()) return { path: dir, mtime: st.mtimeMs, size: st.size };
  const files = (0, import_node_fs3.readdirSync)(dir).filter((name) => /\.(csv|txt|xlsx|xls|pdf)$/i.test(name) && !name.startsWith("~$")).map((name) => {
    const s = (0, import_node_fs3.statSync)((0, import_node_path3.join)(dir, name));
    return { path: (0, import_node_path3.join)(dir, name), mtime: s.mtimeMs, size: s.size };
  }).sort((a, b) => b.mtime - a.mtime);
  return files[0] ?? null;
}
var lastStamp = null;
async function syncStock(config, force) {
  if (!config.exportPath) return config;
  if (!(0, import_node_fs3.existsSync)(config.exportPath)) {
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
  const bytes = (0, import_node_fs3.readFileSync)(file.path);
  const hash = (0, import_node_crypto.createHash)("sha256").update(bytes).digest("hex");
  if (hash === config.lastExportHash) {
    if (notice?.startsWith("Aucun export") || notice?.startsWith("Le dossier")) setNotice(null);
    return config;
  }
  const form = new FormData();
  form.set("file", new Blob([bytes]), (0, import_node_path3.basename)(file.path));
  const response = await api(config, "/api/agent/stock", { method: "POST", body: form });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok) {
    setNotice(`Export refus\xE9 (${(0, import_node_path3.basename)(file.path)}) : ${body.error ?? `HTTP ${response.status}`}`);
    return config;
  }
  setNotice(null);
  log(`Stock synchronis\xE9 : ${body.lines ?? "?"} ligne(s), ${body.created ?? 0} cr\xE9\xE9e(s), ${body.updated ?? 0} mise(s) \xE0 jour (${(0, import_node_path3.basename)(file.path)}).`);
  return { ...config, lastExportHash: hash };
}
async function syncScans(config) {
  if (!config.scansPath || !(0, import_node_fs3.existsSync)(config.scansPath)) return config;
  const sent = new Set(config.sentScans ?? []);
  const files = (0, import_node_fs3.readdirSync)(config.scansPath).filter((name) => /\.(pdf|jpe?g|png|webp)$/i.test(name)).map((name) => ({ path: (0, import_node_path3.join)(config.scansPath, name), stat: (0, import_node_fs3.statSync)((0, import_node_path3.join)(config.scansPath, name)) })).filter(({ stat }) => Date.now() - stat.mtimeMs > SETTLE_MS).sort((a, b) => a.stat.mtimeMs - b.stat.mtimeMs);
  let next = config;
  for (const { path, stat } of files) {
    const key = `${(0, import_node_path3.basename)(path)}:${stat.size}`;
    if (sent.has(key)) continue;
    const mime = { ".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" }[(0, import_node_path3.extname)(path).toLowerCase()] ?? "application/octet-stream";
    const form = new FormData();
    form.set("file", new Blob([(0, import_node_fs3.readFileSync)(path)], { type: mime }), (0, import_node_path3.basename)(path));
    const response = await api(config, "/api/agent/prescriptions", { method: "POST", body: form });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) {
      log(`Scan refus\xE9 (${(0, import_node_path3.basename)(path)}) : ${body.error ?? `HTTP ${response.status}`}`);
      continue;
    }
    sent.add(key);
    next = { ...next, sentScans: [...sent].slice(-2e3) };
    writeConfig(next);
    log(`Ordonnance envoy\xE9e : ${(0, import_node_path3.basename)(path)} \u2192 ${body.reference ?? "?"} (${body.lines ?? 0} ligne(s) lue(s)).`);
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
