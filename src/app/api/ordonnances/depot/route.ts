import { NextResponse, after } from "next/server";
import { prewarmClassifications } from "@/server/services/classification";
import { getSession } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import {
  storePrescriptionFile,
  uploadErrorMessage,
  type PrescriptionUploadResult,
  type UploadStage,
} from "@/server/services/prescription-upload";

// Lecture d'ordonnance et analyse peuvent dépasser dix secondes : on le déclare
// à l'hébergeur plutôt que de laisser la fonction être coupée en plein travail.
export const maxDuration = 60;

export type DepotOrdonnanceReponse =
  | { ok: true; data: PrescriptionUploadResult }
  | { ok: false; error: string };

/** Les événements du flux : chaque étape réelle, puis le résultat. */
export type DepotOrdonnanceEvenement =
  | { type: "stage"; stage: UploadStage["stage"]; sizeBytes?: number; ms?: number; lines?: number }
  | { type: "done"; data: PrescriptionUploadResult }
  | { type: "error"; error: string };

/**
 * Dépôt d'une ordonnance — Route Handler, et non Server Action.
 *
 * C'est le point du correctif : une Server Action plafonne le corps de la
 * requête à 1 Mo, ce qui refusait toute photo d'ordonnance réelle avec une
 * page d'erreur Next brute. Un Route Handler lit le flux sans ce plafond ; la
 * seule limite devient celle qu'on décide, appliquée ici et annoncée en
 * français au pharmacien.
 */
export async function POST(request: Request): Promise<Response> {
  const session = await getSession();
  if (!session || !session.permissions.has(PERMISSIONS.PRESCRIPTION_CREATE)) {
    return NextResponse.json({ ok: false, error: "Non autorisé" }, { status: 403 });
  }

  const received = Date.now();
  let file: File | null = null;
  try {
    const formData = await request.formData();
    const candidate = formData.get("file");
    if (candidate instanceof File) file = candidate;
  } catch (error) {
    console.error("[ordonnances] corps de requête illisible", error);
    return NextResponse.json(
      { ok: false, error: "Le fichier n'a pas pu être lu. Réessayez." },
      { status: 400 },
    );
  }

  if (!file) {
    return NextResponse.json({ ok: false, error: "Aucun fichier reçu." }, { status: 400 });
  }
  console.info(`[ordonnances] transfert reçu — ${file.size} octets en ${Date.now() - received} ms.`);

  // À partir d'ici, tout part en flux : l'écran sait dans la seconde que le
  // fichier est arrivé, puis suit la lecture étape par étape. Rien n'est
  // simulé — chaque événement est émis quand l'étape commence ou finit.
  const scope = session.scope;
  const upload = file;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: DepotOrdonnanceEvenement) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      try {
        const result = await storePrescriptionFile({
          scope,
          file: upload,
          onStage: (stage) => send({ type: "stage", ...stage }),
        });
        if (!result.ok) {
          send({ type: "error", error: uploadErrorMessage(result.error) });
          return;
        }
        const drugNames = result.data.lines.map((line) => line.drugName);
        if (drugNames.length > 0) {
          after(() =>
            prewarmClassifications({ scope, drugNames }).catch((error) =>
              console.error("[classification] préchauffage impossible", error),
            ),
          );
        }
        send({ type: "done", data: result.data });
      } catch (error) {
        console.error("[ordonnances] dépôt en flux : échec", error);
        send({ type: "error", error: "Le dépôt a échoué. Réessayez." });
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
