import { NextResponse, after } from "next/server";
import { AGENT_FILE_MAX_BYTES, applyAgentSnapshot, authenticateAgent } from "@/server/services/stock-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** L'export de stock du LGO, tel quel. PharmaBoost le lit, le rattache, l'écrit. */
export async function POST(request: Request) {
  const agent = await authenticateAgent(request.headers.get("authorization"));
  if (!agent) return NextResponse.json({ ok: false, error: "Clé d'agent inconnue ou révoquée." }, { status: 401 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ ok: false, error: "Aucun fichier reçu." }, { status: 400 });
  if (file.size > AGENT_FILE_MAX_BYTES) return NextResponse.json({ ok: false, error: "Export trop volumineux (25 Mo au plus)." }, { status: 413 });
  const result = await applyAgentSnapshot(agent, file.name, new Uint8Array(await file.arrayBuffer()));
  if (result.ok) {
    // La compréhension des produits nouveaux se poursuit après la réponse.
    after(async () => {
      const { classifyPharmacyProducts } = await import("@/server/services/product-classification");
      await classifyPharmacyProducts({ scope: agent.scope, maxAiBatches: 60 }).catch((error) => console.error("[agent] classification différée impossible", error));
    });
  }
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
