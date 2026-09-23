/**
 * L'écoute de la douchette sur un poste de caisse Windows.
 *
 * Une douchette « clavier » tape le code-barres dans la fenêtre active — le
 * LGO. Windows permet à un autre programme d'être prévenu de chaque touche
 * (un « hook clavier bas niveau », SetWindowsHookEx / WH_KEYBOARD_LL) sans
 * rien retirer à la fenêtre active. C'est ce que fait le petit script
 * PowerShell ci-dessous, lancé par l'agent : il reçoit les touches, ne garde
 * que les rafales de chiffres rapides (`scan-detect.ts` fait le même tri côté
 * Node), et écrit « SCAN <code> » sur sa sortie. Rien d'autre ne sort du
 * script : pas une lettre, pas un mot de passe, pas un journal de frappe.
 *
 * Le script doit tourner dans la session de l'utilisateur qui voit le LGO
 * (pas en tâche SYSTEM au démarrage) : c'est pourquoi l'installation du poste
 * crée une tâche « à l'ouverture de session ».
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ScanDetector, normalizeScannedCode } from "./scan-detect";

/**
 * Le hook clavier, en C# compilé à la volée par PowerShell (Add-Type).
 * Sortie : une ligne « KEY <caractère|Enter|Tab|Other> <horodatage ms> » par
 * touche ne relevant que des chiffres, Entrée et Tabulation ; toute autre
 * touche est signalée comme « Other » sans son contenu. Le tri final (rafale
 * rapide de chiffres) est fait côté Node.
 */
export const HOOK_SCRIPT = String.raw`
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

export type DouchetteHandlers = {
  onScan: (code: string, at: number) => void;
  onStatus: (message: string) => void;
};

/**
 * Lance le hook et traduit ses lignes en passages de douchette. Rend une
 * fonction d'arrêt. Sur une autre plateforme que Windows, ne lance rien et
 * le dit : l'écoute est un dispositif Windows.
 */
export function startDouchette(configDir: string, handlers: DouchetteHandlers): () => void {
  if (process.platform !== "win32") {
    handlers.onStatus("L'écoute de la douchette n'est disponible que sous Windows.");
    return () => undefined;
  }
  const scriptPath = join(configDir, "pharmaboost-douchette.ps1");
  mkdirSync(dirname(scriptPath), { recursive: true });
  writeFileSync(scriptPath, HOOK_SCRIPT, "utf8");

  const detector = new ScanDetector((raw, at) => {
    const code = normalizeScannedCode(raw);
    if (code) handlers.onScan(code, at);
  });
  let child: ChildProcess | null = null;
  let stopped = false;
  const tick = setInterval(() => detector.tick(Date.now()), 100);

  const launch = () => {
    if (stopped) return;
    child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let pending = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      pending += chunk.toString("utf8");
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? "";
      for (const line of lines) {
        if (line === "READY") handlers.onStatus("Douchette écoutée.");
        else if (line.startsWith("ERROR")) handlers.onStatus(`Le hook clavier a échoué : ${line}`);
        else if (line.startsWith("KEY ")) {
          const [, key, at] = line.split(" ");
          if (key === "Shift") continue;
          detector.feed({ key: key ?? "Other", at: Number(at) || Date.now() });
        }
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => handlers.onStatus(`Douchette (PowerShell) : ${chunk.toString("utf8").trim().slice(0, 300)}`));
    child.on("exit", (code) => {
      if (stopped) return;
      handlers.onStatus(`L'écoute de la douchette s'est arrêtée (code ${code ?? "?"}) ; relance dans 10 s.`);
      setTimeout(launch, 10_000);
    });
  };
  launch();

  return () => {
    stopped = true;
    clearInterval(tick);
    child?.kill();
  };
}
