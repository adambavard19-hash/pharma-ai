import { NextResponse } from "next/server";
import { PATIENT_APP_LIVE } from "@/core/patient-app/offers";
import { turnOffOfferAlerts } from "@/server/services/app-members";

/** Désinscription en un clic depuis la messagerie (en-tête List-Unsubscribe-Post). */
export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!PATIENT_APP_LIVE) return new NextResponse(null, { status: 404 });
  const { token } = await params;
  return new NextResponse(null, { status: (await turnOffOfferAlerts(token)) ? 200 : 400 });
}
