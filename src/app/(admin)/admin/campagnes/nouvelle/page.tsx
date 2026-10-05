import type { Metadata } from "next";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { WizardScreen } from "../wizard-screen";

export const metadata: Metadata = { title: "Nouvelle campagne" };

/** L'envoi part d'ici (startCampaignAction, scheduleCampaignAction) : un envoi consomme jusqu'à 45 s, la route doit durer plus. */
export const maxDuration = 60;

/** Créer une campagne : l'assistant, étape par étape. */
export default async function NewCampaignPage() {
  const session = await requirePlatformSession();
  return <WizardScreen campaign={null} adminEmail={session.admin.email} />;
}
