import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getPlatformSession } from "@/server/auth/platform-session";
import { recordAudit } from "@/server/audit/log";
import { academyVideoMaxBytes, storeAcademyMedia } from "@/server/services/mobile/academy-media";
import { POSTER_MAX_MB } from "@/core/academy/media";

/**
 * Dépôt d'une vidéo (MP4/WebM) ou d'une image d'attente (JPEG/PNG/WebP) pour un contenu de l'Académie, depuis la
 * console. Réservé à l'équipe PharmaBoost. Un Route Handler plutôt qu'une Server Action : la vidéo dépasse de loin le
 * plafond des actions. Une nouvelle vidéo renvoie le contenu en brouillon (la relecture portait sur l'ancienne).
 */
export async function POST(request: Request) {
  const session = await getPlatformSession();
  if (!session) return NextResponse.json({ ok: false, error: "Session de la console requise." }, { status: 401 });

  const declared = Number(request.headers.get("content-length") ?? 0);
  const ceiling = Math.max(academyVideoMaxBytes(), POSTER_MAX_MB * 1024 * 1024) + 1024 * 1024;
  if (declared > ceiling) return NextResponse.json({ ok: false, error: `Fichier trop lourd : ${Math.round(academyVideoMaxBytes() / 1024 / 1024)} Mo au plus.` }, { status: 413 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Envoi illisible : réessayez." }, { status: 400 });
  }
  const contentId = String(form.get("contentId") ?? "");
  const kind = form.get("kind");
  const file = form.get("file");
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(contentId) || (kind !== "video" && kind !== "poster") || !(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Demande invalide." }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await storeAcademyMedia(contentId, kind, { type: file.type, size: file.size, bytes });
  if (!result.ok) return NextResponse.json(result, { status: 422 });

  await recordAudit({
    action: "training.saved",
    entityType: "TrainingContent",
    entityId: contentId,
    platformAdminId: session.admin.id,
    metadata: { academy: true, upload: kind, size: file.size, mime: file.type },
  });
  revalidatePath("/admin/academie", "layout");
  revalidatePath("/m/formations", "layout");
  return NextResponse.json(result);
}
