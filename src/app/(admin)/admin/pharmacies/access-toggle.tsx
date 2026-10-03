"use client";

import { Power, RotateCcw } from "lucide-react";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { setPharmacyAccessAction } from "@/server/actions/admin-clients";

/**
 * Suspendre ou rétablir l'accès d'une officine : toujours confirmé, toujours
 * motivé. Le serveur revérifie l'état réel avant d'agir.
 */
export function AccessToggle({ pharmacyId, pharmacyName, suspended, size = "sm" }: { pharmacyId: string; pharmacyName: string; suspended: boolean; size?: "sm" | "md" }) {
  if (suspended) {
    return (
      <ConfirmAction
        label="Réactiver"
        icon={<RotateCcw className="size-4" />}
        size={size}
        variant="outline"
        title={`Rétablir l'accès de ${pharmacyName}`}
        description="Les comptes actifs de l'officine pourront de nouveau se connecter."
        consequences={[
          "La suspension est levée sur l'officine et sur son abonnement.",
          "Si l'abonnement est relié à Stripe, son état y est relu aussitôt.",
          "Le motif est consigné au journal d'audit.",
        ]}
        reason={{ label: "Motif du rétablissement", placeholder: "Régularisation reçue, accord du titulaire…" }}
        confirmLabel="Rétablir l'accès"
        onConfirm={(reason) => setPharmacyAccessAction({ pharmacyId, suspended: false, reason: reason ?? "" })}
      />
    );
  }
  return (
    <ConfirmAction
      label="Suspendre"
      icon={<Power className="size-4" />}
      size={size}
      variant="outline"
      tone="danger"
      title={`Suspendre l'accès de ${pharmacyName}`}
      description="Un geste lourd : l'équipe de l'officine ne pourra plus travailler avec PharmaBoost."
      consequences={[
        "Plus aucun compte de l'officine ne peut se connecter ; les sessions ouvertes sont fermées immédiatement.",
        "L'abonnement est marqué suspendu. Stripe n'est pas modifié : la facturation s'arrête depuis l'espace Facturation.",
        "Aucune donnée n'est supprimée : la réactivation restitue l'espace tel quel.",
      ]}
      reason={{ label: "Motif de la suspension", placeholder: "Impayé depuis le…, demande du titulaire…" }}
      confirmLabel="Suspendre l'accès"
      onConfirm={(reason) => setPharmacyAccessAction({ pharmacyId, suspended: true, reason: reason ?? "" })}
    />
  );
}
