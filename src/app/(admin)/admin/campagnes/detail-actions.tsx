"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, CalendarX2, Pencil, Play, Trash2 } from "lucide-react";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { Button } from "@/components/ui/button";
import type { AudienceKey, CampaignKindKey } from "@/core/admin/campaigns";
import { cancelCampaignAction, deleteDraftCampaignAction, resumeCampaignAction, unscheduleCampaignAction } from "@/server/actions/admin-campaigns";
import { CampaignDialog } from "./campaign-dialog";
import { SendCampaignDialog } from "./send-dialog";
import { cancelConsequences } from "./view";

/**
 * Les gestes d'une campagne selon son état. Chacun est confirmé ici, et chacun
 * est revérifié par le serveur (session, état courant) : cette page ne protège
 * que d'un clic malheureux. Un échec reste affiché, le message est celui de
 * l'action.
 */
export function CampaignActions({
  campaign,
  messagingLive,
  nowIso,
}: {
  campaign: {
    id: string;
    status: string;
    kind: CampaignKindKey;
    name: string;
    audience: AudienceKey;
    audienceParams: { pharmacyIds?: string[]; partnerIds?: string[] };
    offerAmountCents: number | null;
    hasEnd: boolean;
    /** « AAAA-MM-JJ » du jour programmé. */
    scheduledOn: string | null;
  };
  messagingLive: boolean;
  nowIso: string;
}) {
  const router = useRouter();
  const { id, status } = campaign;
  const shared = {
    campaignId: id,
    audience: campaign.audience,
    audienceParams: campaign.audienceParams,
    offer: { kind: campaign.kind, amountCents: campaign.offerAmountCents, hasEnd: campaign.hasEnd },
    messagingLive,
    nowIso,
    onDone: () => router.refresh(),
  };

  const edit = (
    <Button asChild variant="outline" size="md" leadingIcon={<Pencil className="size-4" />}>
      <Link href={`/admin/campagnes/${id}/modifier`}>Modifier</Link>
    </Button>
  );

  const cancel = (
    <ConfirmAction
      label="Annuler la campagne"
      icon={<Ban className="size-4" />}
      variant="outline"
      size="md"
      tone="danger"
      title={`Annuler la campagne « ${campaign.name} » ?`}
      description={status === "SENDING" ? "L'envoi s'arrête maintenant." : undefined}
      consequences={cancelConsequences({ status, kind: campaign.kind })}
      confirmLabel="Annuler la campagne"
      onConfirm={() => cancelCampaignAction({ id })}
    />
  );

  if (status === "DRAFT") {
    return (
      <>
        {edit}
        <SendCampaignDialog {...shared} mode="send" size="md" />
        <SendCampaignDialog {...shared} mode="schedule" size="md" />
        <CampaignDialog
          label="Supprimer le brouillon"
          icon={<Trash2 className="size-4" />}
          variant="ghost"
          size="md"
          tone="danger"
          title="Supprimer ce brouillon ?"
          description={`« ${campaign.name} » sera supprimé. Personne n'a été contacté.`}
          consequences={["La suppression est définitive : le brouillon ne se retrouve pas.", "Elle est inscrite dans le journal d'audit."]}
          confirmLabel="Supprimer le brouillon"
          run={() => deleteDraftCampaignAction({ id })}
          // La page n'existe plus : on retourne à la liste plutôt que de la rafraîchir.
          onSuccess={() => router.push("/admin/campagnes")}
        />
      </>
    );
  }

  if (status === "SCHEDULED") {
    return (
      <>
        {edit}
        <SendCampaignDialog {...shared} mode="send" size="md" label="Envoyer maintenant" variant="outline" />
        <SendCampaignDialog {...shared} mode="schedule" size="md" label="Changer le jour" initialDay={campaign.scheduledOn ?? undefined} />
        <ConfirmAction
          label="Annuler la programmation"
          icon={<CalendarX2 className="size-4" />}
          variant="outline"
          size="md"
          title="Annuler la programmation ?"
          description="Rien n'est encore parti : la campagne redevient un brouillon."
          consequences={["Le message ne partira pas au jour prévu.", "Vous pourrez la modifier, puis la programmer de nouveau ou l'envoyer : la confirmation sera à refaire."]}
          confirmLabel="Annuler la programmation"
          onConfirm={() => unscheduleCampaignAction({ id })}
        />
        {cancel}
      </>
    );
  }

  if (status === "SENDING") {
    return (
      <>
        <ConfirmAction
          label="Reprendre l'envoi"
          icon={<Play className="size-4" />}
          variant="primary"
          size="md"
          title="Reprendre l'envoi ?"
          description="La reprise peut durer jusqu'à une minute."
          consequences={[
            "Les destinataires encore en attente reçoivent le message. Ceux déjà traités n'en reçoivent pas un second.",
            "Un destinataire resté « en cours » depuis plus de 5 minutes est marqué « échec à vérifier » : le message est peut-être parti, il n'est jamais renvoyé automatiquement.",
            ...(messagingLive ? [] : ["La messagerie n'est pas configurée : l'envoi reste simulé."]),
          ]}
          confirmLabel="Reprendre l'envoi"
          onConfirm={() => resumeCampaignAction({ id })}
        />
        {cancel}
      </>
    );
  }

  return null;
}
