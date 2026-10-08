import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildDiagnosticRobotCmd, buildLireJournalCmd } from "@/core/stock/diagnostic";

export const dynamic = "force-dynamic";

/**
 * Les fichiers du serveur et du poste de comptoir, servis tels quels aux
 * installateurs en une ligne. Du code public, rien d'autre.
 *
 * Un script PowerShell enregistré sans « BOM » est lu en ANSI par Windows
 * PowerShell 5.1 : les accents s'abîment et certains caractères (tiret long,
 * « œ ») deviennent des guillemets qui cassent le script. `bom` ajoute la
 * marque UTF-8 si le fichier ne l'a pas.
 *
 * `diagnostic-robot.cmd` est le collecteur en lecture seule du robot (voir
 * docs/robot.md), sous une enveloppe .cmd qui se lance d'un double-clic ; il
 * se télécharge (`attachment`) au lieu de s'afficher. `lire-journal.cmd` est la lecture, en lecture seule aussi, du journal de LGPI
 * (agent/src/lire-journal.ts) : le programme est exécuté par le Node.js que le poste de caisse a déjà.
 */
const FILES: Record<string, { path: string[]; type: string; bom?: boolean; diagnosticCmd?: boolean; lireJournalCmd?: boolean; attachment?: string }> = {
  "diagnostic-robot.cmd": { path: ["diagnostic-robot.ps1"], type: "application/octet-stream", diagnosticCmd: true, attachment: "PharmaBoost-Diagnostic-Robot.cmd" },
  "lire-journal.cmd": { path: ["dist", "lire-journal.js"], type: "application/octet-stream", lireJournalCmd: true, attachment: "PharmaBoost-Lecture-Journal.cmd" },
  "pharmaboost-connect.js": { path: ["dist", "pharmaboost-connect.js"], type: "application/javascript; charset=utf-8" },
  "install-windows.ps1": { path: ["install-windows.ps1"], type: "text/plain; charset=utf-8", bom: true },
  "install-poste-windows.ps1": { path: ["install-poste-windows.ps1"], type: "text/plain; charset=utf-8", bom: true },
};

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);

export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const file = Object.hasOwn(FILES, name) ? FILES[name] : undefined;
  if (!file) return new Response("Fichier inconnu.", { status: 404 });
  let bytes = await readFile(join(process.cwd(), "agent", ...file.path));
  if (file.bom && !bytes.subarray(0, 3).equals(UTF8_BOM)) bytes = Buffer.concat([UTF8_BOM, bytes]);
  if (file.diagnosticCmd) bytes = Buffer.from(buildDiagnosticRobotCmd(bytes.toString("utf8")), "utf8");
  if (file.lireJournalCmd) bytes = Buffer.from(buildLireJournalCmd(bytes.toString("utf8")), "utf8");
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": file.type, "Cache-Control": "no-store", ...(file.attachment ? { "Content-Disposition": `attachment; filename="${file.attachment}"`, "X-Content-Type-Options": "nosniff" } : {}) },
  });
}
