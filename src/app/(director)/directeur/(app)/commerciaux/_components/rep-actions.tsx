"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Power, Send, Trash2 } from "lucide-react";
import { deleteRepAction, inviteRepAction, setRepActiveAction } from "@/server/actions/director-reps";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/** « Envoyer l'invitation » ou « Renvoyer l'invitation » : l'issue de l'envoi est dite telle quelle. */
export function InviteButton({ salesRepId, invited, size = "sm" }: { salesRepId: string; invited: boolean; size?: "sm" | "md" }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { push } = useToast();
  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      loading={pending}
      leadingIcon={<Send className="size-3.5" />}
      onClick={() =>
        startTransition(async () => {
          const result = await inviteRepAction({ salesRepId });
          push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Invitation envoyée.") : result.error });
          router.refresh();
        })
      }
    >
      {invited ? "Renvoyer l'invitation" : "Envoyer l'invitation"}
    </Button>
  );
}

/**
 * Désactiver (confirmé : le commercial ne peut plus se connecter, ses dossiers
 * restent à son nom) ou réactiver (un clic). Les deux se défont l'un l'autre.
 */
export function ActiveButton({ salesRepId, name, isActive, size = "sm" }: { salesRepId: string; name: string; isActive: boolean; size?: "sm" | "md" }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { push } = useToast();
  if (!isActive) {
    return (
      <Button
        type="button"
        variant="outline"
        size={size}
        loading={pending}
        leadingIcon={<Power className="size-3.5" />}
        onClick={() =>
          startTransition(async () => {
            const result = await setRepActiveAction({ salesRepId, active: true });
            push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Compte réactivé.") : result.error });
            router.refresh();
          })
        }
      >
        Réactiver
      </Button>
    );
  }
  return (
    <ConfirmAction
      label="Désactiver"
      icon={<Power className="size-3.5" />}
      variant="outline"
      size={size}
      title={`Désactiver ${name} ?`}
      description="C'est réversible : vous pourrez le réactiver à tout moment."
      consequences={["Il ne peut plus se connecter à son espace, et ses connexions en cours sont fermées.", "Ses dossiers restent à son nom : pensez à les réaffecter.", "Son historique, ses commissions et ses factures sont conservés."]}
      confirmLabel="Désactiver"
      tone="danger"
      onConfirm={() => setRepActiveAction({ salesRepId, active: false })}
    />
  );
}

/**
 * Supprimer DÉFINITIVEMENT : possible seulement sans aucun historique (le
 * serveur le revérifie et refuse sinon). Il faut retaper « SUPPRIMER ».
 */
export function DeleteButton({ salesRepId, name }: { salesRepId: string; name: string }) {
  const router = useRouter();
  return (
    <ConfirmAction
      label="Supprimer définitivement"
      icon={<Trash2 className="size-3.5" />}
      variant="outline"
      title={`Supprimer ${name} ?`}
      description="Cette suppression est définitive : elle ne se défait pas."
      consequences={["Le compte et ses connexions sont effacés.", "Le commercial disparaît aussi de la console."]}
      confirmLabel="Supprimer définitivement"
      tone="danger"
      typedConfirmation="SUPPRIMER"
      onConfirm={async () => {
        const result = await deleteRepAction({ salesRepId });
        // « replace » : le retour arrière ne ramène pas sur la fiche d'un commercial qui n'existe plus.
        if (result.ok) router.replace("/directeur/commerciaux");
        return result;
      }}
    />
  );
}
