/**
 * L'avis de comptoir affiché sur le poste de caisse, par-dessus le LGO.
 *
 * Une petite fenêtre en bas à droite de l'écran, toujours au-dessus, qui ne
 * prend jamais le clavier (WS_EX_NOACTIVATE) : la douchette et les touches
 * continuent d'aller au LGO. Elle s'efface seule après quelques secondes ; un
 * clic ouvre la vente complète dans PharmaBoost. Le contenu vient du serveur
 * (`/api/agent/conseil`) : alertes d'abord, puis jusqu'à trois conseils.
 *
 * Comme le hook clavier, c'est du PowerShell + C# compilé à la volée : rien à
 * installer de plus sur le poste. Les textes passent par un fichier, une ligne
 * par élément, jamais par la ligne de commande.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type ToastContent = {
  title: string;
  subject: string;
  alerts: string[];
  advice: string[];
  url: string;
  seconds: number;
};

/** Le fichier lu par la fenêtre : un préfixe par ligne, le texte ensuite. */
export function serializeToast(content: ToastContent): string {
  const lines = [
    `T${content.title}`,
    `S${content.subject}`,
    `U${content.url}`,
    `D${Math.max(4, Math.min(60, Math.round(content.seconds)))}`,
    ...content.alerts.map((text) => `!${text}`),
    ...content.advice.map((text) => `+${text}`),
  ];
  return lines.map((line) => line.replace(/[\r\n]+/g, " ")).join("\r\n") + "\r\n";
}

export const TOAST_SCRIPT = String.raw`
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

let current: ChildProcess | null = null;

/**
 * Affiche l'avis. Un nouvel avis remplace le précédent. Hors Windows, ne fait
 * rien et le dit : l'affichage en coin d'écran est un dispositif Windows.
 */
export function showToast(configDir: string, content: ToastContent, onStatus: (message: string) => void): void {
  if (process.platform !== "win32") {
    onStatus(`Avis (non affiché hors Windows) : ${content.subject} — ${[...content.alerts, ...content.advice].join(" / ")}`);
    return;
  }
  mkdirSync(configDir, { recursive: true });
  const scriptPath = join(configDir, "pharmaboost-avis.ps1");
  const dataPath = join(configDir, `pharmaboost-avis-${Date.now()}.txt`);
  // Le BOM : sans lui, Windows PowerShell lit le script en ANSI et les accents se cassent.
  writeFileSync(scriptPath, "\uFEFF" + TOAST_SCRIPT, "utf8");
  writeFileSync(dataPath, "\uFEFF" + serializeToast(content), "utf8");
  if (current && !current.killed) current.kill();
  current = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", scriptPath, "-DataFile", dataPath], { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
  current.stderr?.on("data", (chunk: Buffer) => onStatus(`Avis (PowerShell) : ${chunk.toString("utf8").trim().slice(0, 300)}`));
  current.on("exit", () => {
    try { unlinkSync(dataPath); } catch { /* déjà parti */ }
  });
}
