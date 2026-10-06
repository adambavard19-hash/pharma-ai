import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const dynamic = "force-dynamic";

/**
 * Les fichiers du serveur et du poste de comptoir, servis tels quels aux
 * installateurs en une ligne. Du code public, rien d'autre.
 *
 * Un script PowerShell enregistré sans « BOM » est lu en ANSI par Windows
 * PowerShell 5.1 : les accents s'abîment et certains caractères (tiret long,
 * « œ ») deviennent des guillemets qui cassent le script. `bom` ajoute la
 * marque UTF-8 si le fichier ne l'a pas.
 */
const FILES: Record<string, { path: string[]; type: string; bom?: boolean }> = {
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
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": file.type, "Cache-Control": "no-store" } });
}
