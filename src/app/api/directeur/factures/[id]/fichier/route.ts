import { NextResponse } from "next/server";
import { getDirectorSession } from "@/server/auth/director-session";
import { readInvoiceFile } from "@/server/services/sales/director-money";
import { attachmentDisposition } from "@/server/services/sales-applications/admin";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

const ERRORS = {
  NOT_FOUND: { status: 404, error: "Facture introuvable." },
  NO_FILE: { status: 404, error: "Cette facture n'a pas de fichier." },
  FILE_MISSING: { status: 404, error: "Le fichier de la facture est introuvable." },
  STORAGE_UNAVAILABLE: { status: 503, error: "Le stockage des fichiers est indisponible." },
} as const;

/** Les cinq octets d'un PDF : « %PDF- ». */
const isPdf = (bytes: Uint8Array) => bytes.length >= 5 && String.fromCharCode(...bytes.subarray(0, 5)) === "%PDF-";

/**
 * Le fichier d'une facture de commercial, en téléchargement. Réservé au
 * directeur commercial : sans sa session (une session de commercial ou
 * d'administrateur n'y suffit pas), rien ne sort. Le fichier n'est jamais
 * affiché dans la page (`attachment`), jamais deviné par le navigateur
 * (`nosniff`), jamais gardé en cache, et chaque téléchargement est tracé.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getDirectorSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401, headers: NO_STORE });

  const { id } = await params;
  const result = await readInvoiceFile(id, { id: session.director.id, label: session.director.fullName });
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
