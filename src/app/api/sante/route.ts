import { NextResponse } from "next/server";
import { prisma } from "@/server/db/client";

export const dynamic = "force-dynamic";

/**
 * La version en ligne : le code (commit) publié par la publication automatique, fixé au moment du build. Elle sert à vérifier,
 * après une publication, que pharmaboost.app montre bien la nouvelle version. Rien de secret.
 */
const RELEASE = process.env.NEXT_PUBLIC_PB_RELEASE || null;

/** Sonde de santé pour l'hébergeur : l'application répond et la base aussi. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, version: RELEASE }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, version: RELEASE, error: "base de données injoignable" }, { status: 503 });
  }
}
