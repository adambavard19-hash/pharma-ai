import { NextResponse } from "next/server";
import { getUserSession } from "@/server/auth/user-session";
import { getPlatformSession } from "@/server/auth/platform-session";
import { academyViewer } from "@/server/services/mobile/academy";
import { readAcademyMedia, type MediaRequester } from "@/server/services/mobile/academy-media";
import { parseRange } from "@/core/academy/media";

/**
 * Sert une vidéo ou l'image d'attente d'un contenu de l'Académie.
 *
 * - Session obligatoire (application mobile) ; l'équipe PharmaBoost connectée à la console peut prévisualiser.
 * - Le contenu doit être VISIBLE pour cette personne (relu, publié, pas échu ; compte gratuit : contenus gratuits
 *   seulement). Sinon : 404, comme pour un contenu inconnu.
 * - La clé du fichier vient de la fiche du contenu, jamais de l'adresse.
 * - Plages d'octets (`Range`) acceptées : le lecteur vidéo peut avancer et reculer.
 */
export async function GET(request: Request, { params }: { params: Promise<{ contentId: string; kind: string }> }) {
  const { contentId, kind } = await params;
  if (kind !== "video" && kind !== "poster") return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(contentId)) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  let requester: MediaRequester | null = null;
  const session = await getUserSession();
  if (session) requester = { type: "viewer", viewer: await academyViewer(session) };
  else if (await getPlatformSession()) requester = { type: "admin" };
  if (!requester) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  let file = await readAcademyMedia(requester, contentId, kind);
  // Un membre de l'équipe PharmaBoost connecté aussi à l'application prévisualise un brouillon depuis la console.
  if (!file && requester.type === "viewer" && (await getPlatformSession())) file = await readAcademyMedia({ type: "admin" }, contentId, kind);
  if (!file) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  const size = file.bytes.length;
  const headers: Record<string, string> = {
    "Content-Type": file.mime,
    "Accept-Ranges": "bytes",
    // Privé : jamais dans un cache partagé (le droit de voir dépend de la personne).
    "Cache-Control": "private, max-age=3600",
    "Content-Disposition": "inline",
    "X-Content-Type-Options": "nosniff",
  };
  const range = parseRange(request.headers.get("range"), size);
  if (range === "invalid") return new NextResponse(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` } });
  if (range) {
    const chunk = file.bytes.subarray(range.start, range.end + 1);
    return new NextResponse(Buffer.from(chunk), { status: 206, headers: { ...headers, "Content-Range": `bytes ${range.start}-${range.end}/${size}`, "Content-Length": String(chunk.length) } });
  }
  return new NextResponse(Buffer.from(file.bytes), { status: 200, headers: { ...headers, "Content-Length": String(size) } });
}
