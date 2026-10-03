import { PenLine, ShieldAlert, ShieldCheck } from "lucide-react";
import { Alert } from "@/components/ui/feedback";

/**
 * L'état du prestataire de signature, tel qu'il est branché sur ce serveur.
 * Rien n'est simulé : sans prestataire, la console le dit franchement.
 */
export function SignatureBanner({ state }: { state: { configured: boolean; label: string; description: string; webhookAuthenticated: boolean } }) {
  if (!state.configured) {
    return (
      <Alert tone="warning" icon={<ShieldAlert className="size-[18px]" aria-hidden="true" />} title="Aucun prestataire de signature électronique n'est branché">
        {state.description} Aucun contrat n&apos;est présenté comme signé tant qu&apos;une signature n&apos;a pas été réellement reçue ou enregistrée.
      </Alert>
    );
  }
  return (
    <Alert
      tone={state.webhookAuthenticated ? "success" : "info"}
      icon={state.webhookAuthenticated ? <ShieldCheck className="size-[18px]" aria-hidden="true" /> : <PenLine className="size-[18px]" aria-hidden="true" />}
      title={`Signature électronique : ${state.label}`}
    >
      {state.description}{" "}
      {state.webhookAuthenticated
        ? "Les notifications du prestataire sont authentifiées."
        : "Les notifications du prestataire ne sont pas authentifiées (secret de webhook absent) : chaque statut annoncé est relu chez le prestataire avant d'être appliqué."}{" "}
      Un statut ne recule jamais.
    </Alert>
  );
}
