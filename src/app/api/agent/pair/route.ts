import { NextResponse } from "next/server";
import { pairAgent } from "@/server/services/stock-sync";

export const dynamic = "force-dynamic";

/** L'agent présente son code d'appairage : une fois, une officine, une clé. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { code?: string; lgo?: string; hostname?: string; version?: string; exportPath?: string | null; scansPath?: string | null } | null;
  if (!body?.code) return NextResponse.json({ ok: false, error: "Code manquant." }, { status: 400 });
  const result = await pairAgent({ ...body, code: body.code });
  if (!result.ok) return NextResponse.json(result, { status: 403 });
  return NextResponse.json(result);
}
