"use client";

import { CalendarX2, Link2, Power, RefreshCw, RotateCcw, ShieldCheck } from "lucide-react";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { cancelAtPeriodEndAction, refreshSubscriptionAction, sendSubscriptionInviteAction, suspendAccessAction } from "@/server/actions/platform-billing";

/**
 * Les gestes administratifs d'un abonnement, chacun confirmé : relire chez
 * Stripe, programmer ou annuler la fin en fin de période, envoyer le lien
 * d'activation, suspendre ou rétablir l'accès. Le serveur revérifie tout ;
 * quand Stripe n'est pas configuré, les gestes Stripe le disent et restent
 * inactifs : rien n'est simulé.
 */
export function SubscriptionAdminActions({
  pharmacyId,
  pharmacyName,
  stripeConfigured,
  hasStripeSubscription,
  subscriptionOngoing,
  cancelAtPeriodEnd,
  periodEndLabel,
  isActive,
  inviteSummary,
}: {
  pharmacyId: string;
  pharmacyName: string;
  stripeConfigured: boolean;
  /** Un abonnement Stripe est rattaché à l'officine. */
  hasStripeSubscription: boolean;
  /** L'abonnement court encore (ni résilié, ni expiré). */
  subscriptionOngoing: boolean;
  cancelAtPeriodEnd: boolean;
  periodEndLabel: string | null;
  isActive: boolean;
  /** Ce que proposera le lien d'activation (offre, tarif) ; nul : rien à proposer. */
  inviteSummary: string | null;
}) {
  const stripeHint = !stripeConfigured ? "Stripe non configuré." : !hasStripeSubscription ? "Aucun abonnement Stripe rattaché." : null;

  return (
    <div className="divide-y divide-border-subtle">
      <Row title="Relire chez Stripe" description={stripeHint ?? "Remplace l'état de la fiche par celui de Stripe (webhook manqué, vérification)."}>
        <ConfirmAction
          label="Relire"
          icon={<RefreshCw className="size-4" />}
          title="Relire l'abonnement chez Stripe"
          description={`L'état de l'abonnement de ${pharmacyName} est relu chez Stripe.`}
          consequences={["Statut, période, essai et échéance sont repris de Stripe.", "Le tarif contractuel n'est pas modifié.", "Aucun e-mail n'est envoyé."]}
          confirmLabel="Relire maintenant"
          disabled={Boolean(stripeHint)}
          onConfirm={() => refreshSubscriptionAction({ pharmacyId })}
        />
      </Row>

      {hasStripeSubscription && subscriptionOngoing && (
        <Row
          title={cancelAtPeriodEnd ? "Fin programmée chez Stripe" : "Résilier en fin de période"}
          description={!stripeConfigured ? "Stripe non configuré." : cancelAtPeriodEnd ? `L'abonnement s'arrêtera${periodEndLabel ? ` le ${periodEndLabel}` : " à la fin de la période"}. Vous pouvez encore l'annuler.` : "Programme l'arrêt de l'abonnement Stripe à la fin de la période en cours."}
        >
          {cancelAtPeriodEnd ? (
            <ConfirmAction
              label="Annuler la fin"
              icon={<RotateCcw className="size-4" />}
              title="Annuler la résiliation programmée"
              consequences={["L'abonnement Stripe continue au-delà de la période en cours.", "Les prélèvements reprennent normalement à l'échéance.", "Une demande de résiliation ouverte n'est pas modifiée : mettez-la à jour séparément."]}
              confirmLabel="Annuler la résiliation"
              disabled={!stripeConfigured}
              onConfirm={() => cancelAtPeriodEndAction({ pharmacyId, cancel: false })}
            />
          ) : (
            <ConfirmAction
              label="Programmer la fin"
              icon={<CalendarX2 className="size-4" />}
              tone="danger"
              title="Programmer la résiliation en fin de période"
              description={`L'abonnement Stripe de ${pharmacyName} s'arrêtera à la fin de la période en cours.`}
              consequences={[
                periodEndLabel ? `Fin de l'abonnement le ${periodEndLabel} ; aucun prélèvement après cette date.` : "Fin de l'abonnement à la fin de la période en cours ; aucun prélèvement ensuite.",
                "L'accès reste ouvert jusque-là ; aucune donnée n'est supprimée.",
                "Le geste est annulable tant que la date n'est pas passée.",
              ]}
              confirmLabel="Programmer la fin"
              typedConfirmation="RÉSILIER"
              disabled={!stripeConfigured}
              onConfirm={() => cancelAtPeriodEndAction({ pharmacyId, cancel: true })}
            />
          )}
        </Row>
      )}

      {inviteSummary && (
        <Row title="Lien d'activation" description={!stripeConfigured ? "Stripe non configuré : le lien ne peut pas être créé." : inviteSummary}>
          <ConfirmAction
            label="Envoyer le lien"
            icon={<Link2 className="size-4" />}
            title="Envoyer le lien d'activation"
            description="Le titulaire reçoit par e-mail un lien vers le paiement sécurisé Stripe."
            consequences={[inviteSummary, "Un lien déjà envoyé et non utilisé est remplacé par le nouveau.", "Le lien est valable 30 jours ; l'abonnement démarre quand le titulaire l'a validé."]}
            confirmLabel="Envoyer le lien"
            disabled={!stripeConfigured}
            onConfirm={() => sendSubscriptionInviteAction({ pharmacyId })}
          />
        </Row>
      )}

      <Row title={isActive ? "Suspendre l'accès" : "Accès suspendu"} description={isActive ? "Ferme l'accès de l'officine à PharmaBoost. Stripe n'est pas modifié." : "L'officine ne peut plus se connecter. Le rétablissement est immédiat."}>
        {isActive ? (
          <ConfirmAction
            label="Suspendre"
            icon={<Power className="size-4" />}
            tone="danger"
            title="Suspendre l'accès de l'officine"
            description={`${pharmacyName} ne pourra plus se connecter à PharmaBoost.`}
            consequences={["Les sessions ouvertes de l'officine sont fermées immédiatement.", "L'abonnement Stripe n'est pas modifié : les prélèvements continuent.", "Aucune donnée n'est supprimée ; l'accès se rétablit d'un clic."]}
            reason={{ label: "Motif de la suspension", placeholder: "Impayé persistant, demande du titulaire…" }}
            typedConfirmation="SUSPENDRE"
            confirmLabel="Suspendre l'accès"
            onConfirm={(reason) => suspendAccessAction({ pharmacyId, suspended: true, reason })}
          />
        ) : (
          <ConfirmAction
            label="Rétablir l'accès"
            icon={<ShieldCheck className="size-4" />}
            title="Rétablir l'accès de l'officine"
            consequences={["Les utilisateurs de l'officine peuvent de nouveau se connecter.", "L'état de l'abonnement est relu chez Stripe quand il y en a un."]}
            confirmLabel="Rétablir l'accès"
            onConfirm={() => suspendAccessAction({ pharmacyId, suspended: false })}
          />
        )}
      </Row>
    </div>
  );
}

function Row({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13.5px] font-medium text-text-primary">{title}</p>
          {description && <p className="mt-0.5 text-[12.5px] leading-5 text-text-secondary">{description}</p>}
        </div>
        <div className="shrink-0">{children}</div>
      </div>
    </div>
  );
}
