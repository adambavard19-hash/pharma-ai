/**
 * Le diagnostic « fin de vente » : comment LGPI montre qu'une vente est validée, qu'on passe au client suivant, qu'un conseil
 * a été ajouté — pour que PharmaBoost le sache seul et que le pharmacien n'ait plus à cliquer sur la bannière.
 *
 * Le pharmacien double-clique le fichier, fait deux ou trois ventes NORMALES (dont une validée au clavier et une à la souris),
 * puis appuie sur Entrée dans la fenêtre noire. Pendant ce temps, le programme NOTE, avec l'heure à la milliseconde :
 *   1. les lignes nouvelles du journal de LGPI (toutes, pas seulement celles du robot), MASQUÉES comme la lecture du journal :
 *      chiffres → 9, mots hors vocabulaire → a/A ;
 *   2. les touches SPÉCIALES pressées (F1…F12, Entrée, Échap, Fin, Suppr, Ctrl+lettre…) — jamais une lettre ni un chiffre
 *      tapés : une touche de caractère s'écrit « caractère », sans sa valeur, et une rafale de douchette « douchette » ;
 *   3. les clics de souris (le bouton, jamais la position) ;
 *   4. la fenêtre au premier plan quand elle change : le programme, et son titre masqué (le nom d'un patient n'y passe jamais).
 * Puis il écrit le rapport sur le Bureau : la chronologie, et ce que le journal écrit dans les 3 secondes qui suivent chaque
 * Entrée, touche F ou clic — c'est là que se cache « vente validée ».
 *
 * Ce qu'il NE FAIT PAS : il n'écrit rien dans LGPI, n'envoie rien sur Internet, ne garde aucune frappe, aucune valeur, aucun
 * nom. Il s'arrête seul au bout de 20 minutes.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { closeSync, existsSync, openSync, readSync, statSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { JOURNAL_DIRS, parseEntry } from "./journal-line";
import { desktopDir, maskMessage, maskThread, recentJournals } from "./lire-journal";

/** Les mots de l'écran de vente gardés en clair dans les titres de fenêtre et les lignes du journal : jamais un nom propre. */
export const SALE_VOCABULARY = new Set(
  [
    "facturation", "facture", "vente", "ventes", "client", "clients", "patient", "patients", "ordonnance", "ordonnances", "valider", "validation",
    "validee", "validée", "valide", "encaissement", "encaisser", "reglement", "règlement", "paiement", "payer", "ticket", "tiers", "payant", "comptoir",
    "delivrance", "délivrance", "dossier", "nouveau", "nouvelle", "suivant", "suivante", "termine", "terminé", "terminee", "terminée", "annuler",
    "annulation", "annulee", "annulée", "panier", "caisse", "carte", "vitale", "conseil", "conseils", "avance", "impression", "imprimer", "rendu",
    "monnaie", "total", "ligne", "lignes", "produit", "produits", "fiche", "historique", "attente", "pause", "reprise", "mise", "creation", "création",
    "sauvegarde", "enregistrement", "enregistrer", "fermeture", "ouverture", "ecran", "écran", "fenetre", "fenêtre", "menu", "accueil", "recherche",
    "remise", "honoraire", "honoraires", "posologie", "substitution", "commentaires", "lgpi", "pharmagest", "chrome", "edge", "explorer", "java",
    "javaw", "pharmaboost", "notepad", "cmd", "powershell", "transaction", "commit", "rollback", "session", "utilisateur", "operateur", "opérateur",
  ].map((word) => word.toLowerCase()),
);

/** La durée maximale d'une séance d'observation. */
export const MAX_DURATION_MS = 20 * 60_000;
/** Ce que le journal écrit juste après une validation : la fenêtre regardée après chaque Entrée, touche F ou clic. */
export const AFTER_ACTION_MS = 3000;

export type Observed =
  | { at: number; kind: "journal"; logger: string; level: string; text: string }
  | { at: number; kind: "touche"; key: string }
  | { at: number; kind: "clic"; button: string }
  | { at: number; kind: "fenetre"; process: string; title: string };

const KEY_FR: Record<string, string> = { Entree: "Entrée", Echap: "Échap", "Retour arriere": "Retour arrière", "Page prec.": "Page préc.", "Page suiv.": "Page suiv.", caractere: "caractère" };

/** Une ligne du crochet clavier/souris/fenêtre, traduite ; une ligne inconnue est ignorée. */
export function parseHookLine(line: string): Observed | null {
  const parts = line.split("\t");
  const at = Number(parts[1]);
  if (!Number.isFinite(at)) return null;
  // Le crochet écrit en ASCII (PowerShell compile le C# dans la page de code de Windows : les accents s'y abîmaient).
  if (parts[0] === "KEY" && parts[2]) return { at, kind: "touche", key: KEY_FR[parts[2]] ?? parts[2].slice(0, 20) };
  if (parts[0] === "CLIC" && parts[2]) return { at, kind: "clic", button: parts[2].slice(0, 10) };
  if (parts[0] === "WIN") return { at, kind: "fenetre", process: maskMessage(parts[2] ?? "", SALE_VOCABULARY).slice(0, 40), title: maskMessage(parts[3] ?? "", SALE_VOCABULARY).slice(0, 120) };
  return null;
}

/** Une ligne de journal, masquée, avec l'heure du journal (à la seconde) ramenée à l'heure de ce poste. */
export function journalObserved(line: string): Observed | null {
  const entry = parseEntry(line);
  if (!entry) return null;
  const at = Date.parse(`${entry.date}T${entry.time}`);
  if (!Number.isFinite(at)) return null;
  return { at, kind: "journal", logger: entry.logger.slice(-60), level: entry.level, text: `[${maskThread(entry.thread)}] ${maskMessage(entry.message, SALE_VOCABULARY)}` };
}

/**
 * Les rafales de touches de caractère très rapides (moins de 60 ms d'écart, au moins 7) sont la douchette : elles deviennent
 * UNE ligne « douchette ». Les autres touches de caractère restent « caractère », sans valeur.
 */
export function collapseScanner(events: Observed[]): Observed[] {
  const out: Observed[] = [];
  let burst: Observed[] = [];
  const close = () => {
    if (burst.length >= 7) out.push({ at: burst[0]!.at, kind: "touche", key: "douchette" });
    else out.push(...burst);
    burst = [];
  };
  for (const event of events) {
    const isChar = event.kind === "touche" && event.key === "caractère";
    if (isChar && burst.length > 0 && event.at - burst[burst.length - 1]!.at <= 60) {
      burst.push(event);
      continue;
    }
    close();
    if (isChar) burst.push(event);
    else out.push(event);
  }
  close();
  return out;
}

const ACTION_KEYS = /^(Entrée|F\d{1,2}|Échap|Fin|Suppr|Ctrl\+.|Alt\+.|Pavé Entrée)$/;

/** Ce que le journal écrit dans les 3 secondes qui suivent chaque action (Entrée, touche F, clic) : les formes, comptées. */
export function afterActions(events: Observed[], windowMs = AFTER_ACTION_MS): { action: string; count: number; shapes: { text: string; count: number }[] }[] {
  const byAction = new Map<string, { count: number; shapes: Map<string, number> }>();
  const journal = events.filter((event): event is Extract<Observed, { kind: "journal" }> => event.kind === "journal");
  for (const event of events) {
    const action = event.kind === "touche" && ACTION_KEYS.test(event.key) ? `touche ${event.key}` : event.kind === "clic" ? `clic ${event.button}` : null;
    if (!action) continue;
    const slot = byAction.get(action) ?? { count: 0, shapes: new Map<string, number>() };
    slot.count += 1;
    // Le journal est à la seconde : on prend la seconde de l'action entière.
    const from = Math.floor(event.at / 1000) * 1000;
    for (const line of journal) {
      if (line.at < from || line.at > event.at + windowMs) continue;
      const shape = `${line.logger} - ${line.text}`;
      slot.shapes.set(shape, (slot.shapes.get(shape) ?? 0) + 1);
    }
    byAction.set(action, slot);
  }
  return [...byAction.entries()]
    .map(([action, slot]) => ({ action, count: slot.count, shapes: [...slot.shapes.entries()].map(([text, count]) => ({ text, count })).sort((a, b) => b.count - a.count).slice(0, 25) }))
    .sort((a, b) => b.count - a.count);
}

function two(n: number): string {
  return String(n).padStart(2, "0");
}

function clock(at: number): string {
  const d = new Date(at);
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}

export function renderSaleReport(input: { computer: string; started: Date; ended: Date; journal: string | null; events: Observed[]; hookOk: boolean; errors: string[] }): string[] {
  const events = collapseScanner([...input.events].sort((a, b) => a.at - b.at));
  const out: string[] = [];
  const stamp = (d: Date) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
  out.push("PharmaBoost — diagnostic « fin de vente » (lecture seule)");
  out.push(`Ordinateur : ${input.computer} · du ${stamp(input.started)} au ${stamp(input.ended)}`);
  out.push("Aucune valeur n'est écrite ici : chiffres → 9, mots hors vocabulaire → a/A. Aucune lettre ni aucun chiffre tapé n'est gardé.");
  out.push("");
  out.push("=".repeat(70), "1. Ce qui a été observé", "=".repeat(70));
  out.push(`Journal de LGPI suivi : ${input.journal ?? "aucun trouvé (emplacements : " + JOURNAL_DIRS.join(", ") + ")"}`);
  out.push(`Clavier, souris et fenêtres : ${input.hookOk ? "observés" : "NON observés (le crochet n'a pas démarré)"}`);
  const count = (kind: Observed["kind"]) => events.filter((event) => event.kind === kind).length;
  out.push(`Lignes de journal : ${count("journal")} · touches : ${count("touche")} · clics : ${count("clic")} · changements de fenêtre : ${count("fenetre")}`);
  out.push(`Passages de douchette reconnus : ${events.filter((event) => event.kind === "touche" && event.key === "douchette").length}`);

  out.push("", "=".repeat(70), "2. Ce que le journal écrit juste après chaque action (3 secondes)", "=".repeat(70));
  const after = afterActions(events);
  if (after.length === 0) out.push("(aucune action : ni Entrée, ni touche F, ni clic)");
  for (const slot of after) {
    out.push(`${slot.action} — ${slot.count} fois :`);
    if (slot.shapes.length === 0) out.push("   (rien dans le journal)");
    for (const shape of slot.shapes) out.push(`   ${shape.count} × ${shape.text}`);
  }

  out.push("", "=".repeat(70), "3. Les fenêtres au premier plan (programme · titre masqué)", "=".repeat(70));
  const windows = new Map<string, number>();
  for (const event of events) if (event.kind === "fenetre") windows.set(`${event.process} · ${event.title}`, (windows.get(`${event.process} · ${event.title}`) ?? 0) + 1);
  if (windows.size === 0) out.push("(aucune)");
  for (const [name, n] of [...windows.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)) out.push(`${n} × ${name}`);

  out.push("", "=".repeat(70), "4. La chronologie complète", "=".repeat(70));
  const shown = events.slice(-4000);
  if (events.length > shown.length) out.push(`(les ${events.length - shown.length} premiers évènements sont omis)`);
  for (const event of shown) {
    if (event.kind === "journal") out.push(`${clock(event.at)}  JOURNAL  ${event.level} ${event.logger} - ${event.text}`);
    else if (event.kind === "touche") out.push(`${clock(event.at)}  TOUCHE   ${event.key}`);
    else if (event.kind === "clic") out.push(`${clock(event.at)}  CLIC     ${event.button}`);
    else out.push(`${clock(event.at)}  FENÊTRE  ${event.process} · ${event.title}`);
  }
  if (input.errors.length > 0) out.push("", "=".repeat(70), "5. Erreurs", "=".repeat(70), ...input.errors);
  return out;
}

/**
 * Le crochet clavier + souris + fenêtre au premier plan, en C# 5 compilé par PowerShell (comme la douchette). Il n'écrit que :
 *   KEY<tab>ms<tab>nom   — nom d'une touche spéciale, « caractère » pour toute lettre/chiffre/ponctuation (sans sa valeur) ;
 *   CLIC<tab>ms<tab>gauche|droit|milieu ;
 *   WIN<tab>ms<tab>programme<tab>titre — masqués ensuite par Node avant d'être écrits.
 */
export const OBSERVER_SCRIPT = String.raw`
$code = @"
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;
public static class PharmaBoostObserver {
  private delegate IntPtr Proc(int nCode, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")] private static extern IntPtr SetWindowsHookEx(int idHook, Proc fn, IntPtr hMod, uint threadId);
  [DllImport("user32.dll")] private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);
  [DllImport("kernel32.dll")] private static extern IntPtr GetModuleHandle(string name);
  [DllImport("user32.dll")] private static extern short GetKeyState(int key);
  [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  private static Proc keyProc = KeyHook;
  private static Proc mouseProc = MouseHook;
  private static string lastWindow = "";
  private static long Now() { return DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(); }
  private static void Say(string line) { Console.Out.WriteLine(line); Console.Out.Flush(); }
  private static bool Down(int key) { return (GetKeyState(key) & 0x8000) != 0; }
  private static string KeyName(int vk) {
    if (vk >= 0x70 && vk <= 0x7B) return "F" + (vk - 0x6F);
    switch (vk) {
      case 0x0D: return "Entree";
      case 0x1B: return "Echap";
      case 0x23: return "Fin";
      case 0x24: return "Origine";
      case 0x2E: return "Suppr";
      case 0x2D: return "Inser";
      case 0x09: return "Tab";
      case 0x08: return "Retour arriere";
      case 0x21: return "Page prec.";
      case 0x22: return "Page suiv.";
      case 0x25: return "Gauche";
      case 0x26: return "Haut";
      case 0x27: return "Droite";
      case 0x28: return "Bas";
      case 0x10: case 0xA0: case 0xA1: case 0x11: case 0xA2: case 0xA3: case 0x12: case 0xA4: case 0xA5: return null;
    }
    bool ctrl = Down(0x11), alt = Down(0x12);
    if ((ctrl || alt) && ((vk >= 0x41 && vk <= 0x5A) || (vk >= 0x30 && vk <= 0x39))) return (ctrl ? "Ctrl+" : "Alt+") + (char)vk;
    return "caractere";
  }
  private static IntPtr KeyHook(int nCode, IntPtr wParam, IntPtr lParam) {
    if (nCode >= 0 && (wParam == (IntPtr)0x0100 || wParam == (IntPtr)0x0104)) {
      int vk = Marshal.ReadInt32(lParam);
      string name = KeyName(vk);
      if (name != null) Say("KEY\t" + Now() + "\t" + name);
    }
    return CallNextHookEx(IntPtr.Zero, nCode, wParam, lParam);
  }
  private static IntPtr MouseHook(int nCode, IntPtr wParam, IntPtr lParam) {
    if (nCode >= 0) {
      int msg = (int)wParam;
      if (msg == 0x0201) Say("CLIC\t" + Now() + "\tgauche");
      else if (msg == 0x0204) Say("CLIC\t" + Now() + "\tdroit");
      else if (msg == 0x0207) Say("CLIC\t" + Now() + "\tmilieu");
    }
    return CallNextHookEx(IntPtr.Zero, nCode, wParam, lParam);
  }
  private static void Watch() {
    try {
      IntPtr hwnd = GetForegroundWindow();
      StringBuilder text = new StringBuilder(256);
      GetWindowText(hwnd, text, 256);
      uint pid;
      GetWindowThreadProcessId(hwnd, out pid);
      string process = "";
      try { process = Process.GetProcessById((int)pid).ProcessName; } catch (Exception) { }
      string now = process + "\t" + text.ToString().Replace("\t", " ");
      if (now != lastWindow) { lastWindow = now; Say("WIN\t" + Now() + "\t" + now); }
    } catch (Exception) { }
  }
  public static void Run() {
    IntPtr module = GetModuleHandle(null);
    SetWindowsHookEx(13, keyProc, module, 0);
    SetWindowsHookEx(14, mouseProc, module, 0);
    Timer timer = new Timer();
    timer.Interval = 250;
    timer.Tick += delegate { Watch(); };
    timer.Start();
    Say("PRET\t" + Now());
    Application.Run();
  }
}
"@
Add-Type -TypeDefinition $code -ReferencedAssemblies System.Windows.Forms
[PharmaBoostObserver]::Run()
`;

/** Les octets ajoutés au journal depuis `from` (LGPI y écrit encore : lecture en partage). */
function readFrom(path: string, from: number): { text: string; size: number } {
  const size = statSync(path).size;
  if (size <= from) return { text: "", size };
  const fd = openSync(path, "r");
  try {
    const buffer = Buffer.alloc(Math.min(size - from, 8 * 1024 * 1024));
    readSync(fd, buffer, 0, buffer.length, from);
    return { text: buffer.toString("latin1"), size: from + buffer.length };
  } finally {
    closeSync(fd);
  }
}

function findJournal(): { dir: string; path: string } | null {
  const dirs = process.env.PB_JOURNAL_DIR ? [process.env.PB_JOURNAL_DIR] : JOURNAL_DIRS;
  for (const dir of dirs) {
    try {
      if (!existsSync(dir)) continue;
      const found = recentJournals(dir, 1);
      if (found[0]) return { dir, path: found[0].path };
    } catch {
      // dossier suivant
    }
  }
  return null;
}

async function observe(): Promise<void> {
  const started = new Date();
  const events: Observed[] = [];
  const errors: string[] = [];
  let journal = findJournal();
  let offset = journal ? statSync(journal.path).size : 0;
  let partial = "";
  const pollJournal = () => {
    try {
      // Le journal change de nom à minuit : on suit le plus récent.
      const now = findJournal();
      if (now && journal && now.path !== journal.path) {
        journal = now;
        offset = 0;
        partial = "";
      } else if (now && !journal) {
        journal = now;
        offset = statSync(now.path).size;
      }
      if (!journal) return;
      const { text, size } = readFrom(journal.path, offset);
      offset = size;
      const lines = (partial + text).split(/\r?\n/);
      partial = lines.pop() ?? "";
      for (const line of lines) {
        const event = journalObserved(line);
        if (event) events.push(event);
      }
    } catch (error) {
      if (errors.length < 20) errors.push(`journal : ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  const poll = setInterval(pollJournal, 400);

  let hookOk = false;
  let child: ChildProcess | null = null;
  if (process.platform === "win32") {
    const script = join(tmpdir(), "pharmaboost-observateur.ps1");
    writeFileSync(script, OBSERVER_SCRIPT, "utf8");
    child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let pending = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      pending += chunk.toString("utf8");
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? "";
      for (const line of lines) {
        if (line.startsWith("PRET")) {
          hookOk = true;
          console.log("  ✓ Clavier, souris et fenêtres observés.");
          continue;
        }
        const event = parseHookLine(line);
        if (event) events.push(event);
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      if (errors.length < 20) errors.push(`observateur : ${chunk.toString("utf8").trim().slice(0, 300)}`);
    });
  }

  console.log(journal ? `  ✓ Journal de LGPI suivi : ${journal.path}` : "  ✗ Aucun journal de LGPI trouvé : seuls le clavier, la souris et les fenêtres seront notés.");
  console.log("");
  console.log("MAINTENANT : faites 2 ou 3 ventes NORMALES dans LGPI, comme d'habitude.");
  console.log("  - au moins une validée au CLAVIER (touche de validation de LGPI) ;");
  console.log("  - au moins une validée à la SOURIS (bouton « FIN Valider ») ;");
  console.log("  - si possible, un passage au client suivant sans rien vendre.");
  console.log("Notez l'heure de chaque validation si vous le pouvez. Puis revenez ici et appuyez sur Entrée.");
  console.log("(Arrêt automatique au bout de 20 minutes.)");

  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, Number(process.env.PB_DUREE_MS) || MAX_DURATION_MS);
    process.stdin.resume();
    process.stdin.once("data", () => {
      clearTimeout(timer);
      resolve();
    });
  });
  process.stdin.pause();
  pollJournal();
  clearInterval(poll);
  child?.kill();

  const ended = new Date();
  const computer = process.env.COMPUTERNAME ?? hostname();
  const lines = renderSaleReport({ computer, started, ended, journal: journal?.path ?? null, events, hookOk, errors });
  const file = join(desktopDir(), `PharmaBoost-fin-de-vente-${computer}-${ended.getFullYear()}${two(ended.getMonth() + 1)}${two(ended.getDate())}-${two(ended.getHours())}${two(ended.getMinutes())}.txt`);
  writeFileSync(file, "﻿" + lines.join("\r\n") + "\r\n", "utf8");
  console.log("");
  console.log("TERMINÉ. Rapport écrit sur le Bureau :");
  console.log("  " + file);
  console.log("Ouvrez-le, relisez-le, puis envoyez-le à contact@pharmaboost.app.");
}

if (process.env.PB_FIN_VENTE_LANCER === "1") {
  console.log("");
  console.log("PharmaBoost — diagnostic « fin de vente »");
  console.log("Ce programme OBSERVE seulement : il écrit un rapport sur le Bureau, rien d'autre.");
  console.log("Il ne modifie pas LGPI, n'envoie rien sur Internet, et ne garde ni lettre ni chiffre tapés, ni aucun nom.");
  console.log("");
  observe().catch((error) => {
    console.log("Le diagnostic a échoué : " + (error instanceof Error ? error.message : String(error)));
    console.log("Prenez cette fenêtre en photo.");
  });
}
