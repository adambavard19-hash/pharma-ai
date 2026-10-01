import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const dynamic = "force-dynamic";

/** Les deux fichiers du poste de comptoir, servis tels quels à l'installateur en une ligne. Du code public, rien d'autre. */
const FILES: Record<string, { path: string[]; type: string }> = {
  "pharmaboost-connect.js": { path: ["dist", "pharmaboost-connect.js"], type: "application/javascript; charset=utf-8" },
  "install-poste-windows.ps1": { path: ["install-poste-windows.ps1"], type: "text/plain; charset=utf-8" },
};

export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const file = FILES[name];
  if (!file) return new Response("Fichier inconnu.", { status: 404 });
  const bytes = await readFile(join(process.cwd(), "agent", ...file.path));
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": file.type, "Cache-Control": "no-store" } });
}
