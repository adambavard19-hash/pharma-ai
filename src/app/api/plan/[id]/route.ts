import { NextResponse } from "next/server";
import { readSealedDocument } from "@/server/services/sealed-documents";
import { toBase64Url } from "@/core/documents/seal";

export const dynamic = "force-dynamic";

/**
 * Le plan scellé, tel quel : du chiffré. Le navigateur du patient le
 * déchiffre avec la clé qu'il tient dans le lien (après le dièse), et que ce
 * serveur ne reçoit jamais. Sans la clé, cette réponse ne dit rien.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const document = await readSealedDocument(id);
  if (!document) return NextResponse.json({ ok: false, error: "Ce plan n'existe plus." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json(
    { ok: true, ciphertext: toBase64Url(document.ciphertext), iv: toBase64Url(document.iv), tag: toBase64Url(document.tag), expiresAt: document.expiresAt.toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
