"use client";

import { CheckCircle2 } from "lucide-react";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { resolveIncidentAction } from "@/server/actions/admin-clients";

/** « Marquer résolu » : un commentaire est demandé et consigné ; l'incident reste consultable. */
export function ResolveIncidentButton({ incidentId, title }: { incidentId: string; title: string }) {
  return (
    <ConfirmAction
      label="Marquer résolu"
      icon={<CheckCircle2 className="size-4" />}
      variant="outline"
      title="Marquer l'incident résolu"
      description={title}
      consequences={["L'incident quitte la liste des incidents ouverts.", "Il reste consultable ; la date de résolution et votre commentaire sont consignés au journal d'audit."]}
      reason={{ label: "Ce qui a été fait", placeholder: "Agent mis à jour, export relancé, cause identifiée…" }}
      confirmLabel="Marquer résolu"
      onConfirm={(reason) => resolveIncidentAction({ incidentId, reason: reason ?? "" })}
    />
  );
}
