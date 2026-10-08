"use client";

import Link from "next/link";
import { Trash2 } from "lucide-react";
import { deletePharmacyAction } from "@/server/actions/admin-deletion";
import type { PharmacyDeletionImpact } from "@/server/services/admin/deletion";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { Alert } from "@/components/ui/feedback";

const plural = (count: number, one: string, many: string) => `${count.toLocaleString("fr-FR")} ${count > 1 ? many : one}`;

/** Ce que la suppression emporte, en clair : seulement ce qui existe (un zéro n'est pas une conséquence). */
export function deletionConsequences(impact: PharmacyDeletionImpact): string[] {
  const { counts } = impact;
  const lines: string[] = [];
  if (impact.usersDeleted > 0) lines.push(`${plural(impact.usersDeleted, "compte de l'équipe supprimé", "comptes de l'équipe supprimés")} (adresses e-mail libérées).`);
  if (impact.usersKept > 0) lines.push(`${plural(impact.usersKept, "compte conservé", "comptes conservés")} : ${impact.usersKept > 1 ? "ils travaillent" : "il travaille"} aussi dans une autre officine, et en ${impact.usersKept > 1 ? "sont" : "est"} seulement retiré${impact.usersKept > 1 ? "s" : ""}.`);
  const data = [
    counts.patients > 0 ? plural(counts.patients, "patient", "patients") : null,
    counts.prescriptions > 0 ? plural(counts.prescriptions, "ordonnance", "ordonnances") : null,
    counts.sales > 0 ? plural(counts.sales, "vente", "ventes") : null,
    counts.products > 0 ? plural(counts.products, "produit en stock", "produits en stock") : null,
    counts.partnerOrders > 0 ? plural(counts.partnerOrders, "commande partenaire", "commandes partenaires") : null,
  ].filter((entry): entry is string => entry !== null);
  lines.push(data.length > 0 ? `Effacés définitivement avec l'officine : ${data.join(", ")}, ainsi que le stock, les réglages, les notifications et l'historique de l'équipe.` : "Les réglages, le stock et l'historique de l'équipe sont effacés avec l'officine.");
  if (impact.deletesOrganization) lines.push("C'est sa dernière officine : l'organisation et son abonnement (sans paiement enregistré) sont supprimés aussi.");
  lines.push("Restent : le journal d'audit (avec ce geste), les contrats signés, les prospects et les commissions.");
  lines.push("Il n'y a pas de corbeille : cette suppression ne se défait pas.");
  return lines;
}

/**
 * « Zone sensible » de la fiche d'une officine : la suppression définitive. Interdite (avec la raison) tant qu'un
 * abonnement court, que des paiements sont enregistrés ou que c'est l'officine de démonstration. Sinon : le motif,
 * puis le NOM de l'officine à retaper — le serveur revérifie les deux.
 */
export function DeletePharmacyPanel({ impact }: { impact: PharmacyDeletionImpact }) {
  if (impact.blockers.length > 0) {
    return (
      <div className="space-y-3">
        <Alert tone="warning" title="Cette officine ne peut pas être supprimée pour l'instant">
          <ul className="list-disc space-y-1 pl-5">
            {impact.blockers.map((blocker) => (
              <li key={blocker.code}>{blocker.message}</li>
            ))}
          </ul>
        </Alert>
        <p className="text-[13px] text-text-secondary">
          En attendant, <strong className="font-semibold text-text-primary">suspendez l&apos;accès</strong> (bouton en haut de la fiche) : rien n&apos;est effacé et l&apos;officine peut être réactivée. Voir aussi{" "}
          <Link href="/admin/resiliations?statut=ouvertes" className="font-medium text-brand-700 hover:underline dark:text-brand-400">
            les résiliations
          </Link>
          .
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <p className="max-w-xl text-[13.5px] leading-5 text-text-secondary">
        Supprime l&apos;officine <strong className="font-semibold text-text-primary">{impact.name}</strong> et tout ce qu&apos;elle contient. À réserver aux essais, aux doublons et aux clients partis dont les données doivent être effacées ; pour un simple arrêt, suspendez plutôt l&apos;accès.
      </p>
      <ConfirmAction
        label="Supprimer l'officine…"
        icon={<Trash2 className="size-4" />}
        variant="outline"
        tone="danger"
        title={`Supprimer définitivement ${impact.name}`}
        description="Cette suppression ne peut pas être annulée."
        consequences={deletionConsequences(impact)}
        reason={{ label: "Motif de la suppression (consigné au journal)", placeholder: "Ex. : officine d'essai, doublon, résiliation avec demande d'effacement…" }}
        typedConfirmation={impact.name}
        confirmLabel="Supprimer définitivement"
        redirectTo="/admin/pharmacies"
        onConfirm={(reason, typed) => deletePharmacyAction({ pharmacyId: impact.pharmacyId, typedName: typed, reason: reason ?? "" })}
      />
    </div>
  );
}
