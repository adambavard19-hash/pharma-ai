import { NextResponse } from "next/server";
import { getPlatformSession } from "@/server/auth/platform-session";
import { attachmentDisposition, readSalesApplicationCv } from "@/server/services/sales-applications/admin";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

const ERRORS = {
  NOT_FOUND: { status: 404, error: "Candidature introuvable." },
  NO_CV: { status: 404, error: "Cette candidature n'a pas de CV." },
  FILE_MISSING: { status: 404, error: "Le fichier du CV est introuvable." },
  STORAGE_UNAVAILABLE: { status: 503, error: "Le stockage des fichiers est indisponible." },
} as const;

/** Les quatre octets d'un PDF : « %PDF- ». */
const isPdf = (bytes: Uint8Array) => bytes.length >= 5 && String.fromCharCode(...bytes.subarray(0, 5)) === "%PDF-";

/**
 * Le CV d'une candidature commerciale, en téléchargement. Réservé à la
 * console : sans session administrateur, rien ne sort. Le fichier n'est jamais
 * affiché dans la page (`attachment`), jamais deviné par le navigateur
 * (`nosniff`), et chaque téléchargement est tracé.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401, headers: NO_STORE });

  const { id } = await params;
  const result = await readSalesApplicationCv(id, session.admin.id);
  if (!result.ok) {
    const { status, error } = ERRORS[result.reason];
    return NextResponse.json({ error }, { status, headers: NO_STORE });
  }

  return new NextResponse(Buffer.from(result.bytes), {
    headers: {
      // Un fichier qui n'a pas la signature d'un PDF n'est jamais présenté comme tel.
      "Content-Type": isPdf(result.bytes) ? "application/pdf" : "application/octet-stream",
      "Content-Disposition": attachmentDisposition(result.fileName),
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
      ...NO_STORE,
    },
  });
}
