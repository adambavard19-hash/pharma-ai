import { NextResponse } from "next/server";
import { trackPartnerClick } from "@/server/services/partner-emails";

export const dynamic = "force-dynamic";

/** Le lien d'un e-mail partenaire : le clic est compté, puis le patient part vers le lien d'affiliation de la marque. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const target = await trackPartnerClick(id.slice(0, 40));
  return target ? NextResponse.redirect(target, 302) : NextResponse.redirect(new URL("/decouvrir", request.url), 302);
}
