import type { Metadata } from "next";
import { PATIENT_APP_LIVE } from "@/core/patient-app/offers";
import { BilanViewer } from "./bilan-viewer";

export const metadata: Metadata = {
  title: { absolute: "Votre bilan conseil" },
  description: "Les conseils de votre pharmacien, sur votre téléphone.",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Le bilan conseil scanné au comptoir (fondateur, 5 nov. 2026). La page ne contient rien : le bilan est chargé chiffré et ouvert
 * sur le téléphone avec la clé du QR code, que le serveur ne reçoit jamais. Il se garde dans l'appli PharmaBoost, sur le téléphone.
 */
export default async function BilanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="min-h-dvh bg-[#F2F7F5]">
      <BilanViewer id={id} appLive={PATIENT_APP_LIVE} />
    </div>
  );
}
