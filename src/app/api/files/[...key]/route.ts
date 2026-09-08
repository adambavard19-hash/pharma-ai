import path from "node:path";
import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { getStorageProvider } from "@/server/ai/registry";

const MIME_BY_EXTENSION: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

/**
 * Sert un fichier importé (ordonnance).
 *
 * Double contrôle : authentification obligatoire, ET la clé doit commencer par
 * l'identifiant de l'officine de la session. Un utilisateur ne peut donc pas
 * lire l'ordonnance d'une autre pharmacie en devinant un chemin.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { key } = await params;
  const relativeKey = key.map(decodeURIComponent).join("/");

  if (relativeKey.includes("..") || !relativeKey.startsWith(`${session.scope.pharmacyId}/`)) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  try {
    // Quel que soit le stockage branché (dossier, base, objet), la lecture
    // passe ici : c'est l'unique porte, et elle a vérifié l'officine.
    const data = await getStorageProvider().read(relativeKey);
    if (!data) return NextResponse.json({ error: "Fichier introuvable" }, { status: 404 });
    const extension = path.extname(relativeKey).toLowerCase();
    return new NextResponse(Buffer.from(data), {
      headers: {
        "Content-Type": MIME_BY_EXTENSION[extension] ?? "application/octet-stream",
        "Cache-Control": "private, max-age=300",
        "Content-Disposition": "inline",
      },
    });
  } catch {
    return NextResponse.json({ error: "Fichier introuvable" }, { status: 404 });
  }
}
