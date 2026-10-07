import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { LATEST_AGENT_VERSION } from "@/core/admin/agent-version";

export const dynamic = "force-dynamic";

/**
 * La version courante de l'agent et l'empreinte SHA-256 du fichier servi par
 * /api/agent/fichiers/pharmaboost-connect.js. L'icône des postes installés avec
 * l'installateur Windows s'en sert pour se mettre à jour toute seule : elle ne
 * remplace son agent que si le fichier téléchargé a EXACTEMENT cette empreinte.
 * Du code public, rien d'autre.
 */
export async function GET() {
  try {
    const bytes = await readFile(join(process.cwd(), "agent", "dist", "pharmaboost-connect.js"));
    return Response.json({ version: LATEST_AGENT_VERSION, sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.length }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Agent indisponible." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
