import { NextResponse } from "next/server";
import { getPlatformSession } from "@/server/auth/platform-session";
import { getDepositFile } from "@/server/services/stock-deposits";
import { attachmentDisposition } from "@/server/services/sales-applications/admin";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

const ERRORS = {
  NOT_FOUND: { status: 404, error: "Dépôt introuvable." },
  NO_FILE: { status: 404, error: "Ce fichier n'est plus conservé (supprimé après 90 jours)." },
  FILE_MISSING: { status: 404, error: "Le fichier est introuvable dans le stockage." },
  STORAGE_UNAVAILABLE: { status: 503, error: "Le stockage des fichiers est indisponible." },
} as const;

/**
 * Le fichier de stock d'un dépôt, en téléchargement. Réservé à la console :
 * sans session administrateur, rien ne sort. Le fichier n'est jamais affiché
 * dans la page (`attachment`), jamais deviné par le navigateur (`nosniff`,
 * type neutre) : c'est un fichier du titulaire, pas du contenu de confiance.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401, headers: NO_STORE });

  const { id } = await params;
  // Le téléchargement est tracé au nom de l'administrateur (jamais le contenu du fichier).
  const result = await getDepositFile(id, session.admin.id);
  if (!result.ok) {
    const { status, error } = ERRORS[result.reason];
    return NextResponse.json({ error }, { status, headers: NO_STORE });
  }

  return new NextResponse(Buffer.from(result.bytes), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": attachmentDisposition(result.fileName),
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
      ...NO_STORE,
    },
  });
}
