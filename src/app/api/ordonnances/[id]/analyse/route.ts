import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db/client";
import { getSession } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { analysePrescription, type AnalysisStage } from "@/server/services/analysis";

/**
 * L'analyse, étape par étape, en flux.
 *
 * Une action serveur répond d'un bloc : le pharmacien attendrait devant un
 * écran vide. Ici chaque étape est annoncée dès qu'elle commence — et c'est
 * l'étape réelle, pas une animation : « médicaments identifiés » s'affiche
 * quand le rattachement commence, « recherche des conseils » quand le moteur
 * tourne. Le dernier événement porte le résultat.
 */
export type AnalysisStreamEvent =
  | { type: "stage"; stage: AnalysisStage }
  | { type: "done"; analysisRunId: string; recommendationCount: number; durationMs: number }
  | { type: "error"; message: string };

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const session = await getSession();
  if (!session || !session.permissions.has(PERMISSIONS.PRESCRIPTION_VERIFY)) {
    return Response.json({ ok: false, error: "Non autorisé" }, { status: 403 });
  }

  const prescription = await prisma.prescription.findUnique({
    where: { id },
    select: { pharmacyId: true },
  });
  if (!prescription || prescription.pharmacyId !== session.scope.pharmacyId) {
    return Response.json({ ok: false, error: "Ordonnance introuvable." }, { status: 404 });
  }

  const encoder = new TextEncoder();
  const scope = session.scope;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AnalysisStreamEvent) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

      const startedAt = Date.now();
      try {
        const { analysisRunId, result } = await analysePrescription({
          scope,
          prescriptionId: id,
          onStage: (stage) => send({ type: "stage", stage }),
        });
        revalidatePath(`/vente/${id}`);
        send({
          type: "done",
          analysisRunId,
          recommendationCount: result.recommendations.length,
          durationMs: Date.now() - startedAt,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Analyse impossible.";
        console.error("[analysis] échec en flux", error);
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
