"use client";

import { Trash2 } from "lucide-react";
import { deleteUserAction } from "@/server/actions/admin-deletion";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { Button } from "@/components/ui/button";

/**
 * « Supprimer » un compte, depuis la liste de tous les utilisateurs. Le compte est supprimé PARTOUT (c'est la liste
 * globale, pas une officine) : la fenêtre cite chaque officine concernée. Le seul titulaire d'une officine ne se supprime
 * pas : le bouton s'éteint et dit pourquoi — le serveur le refuserait de toute façon.
 */
export function DeleteUserButton({ userId, name, email, pharmacies, soleOwnerOf }: { userId: string; name: string; email: string; pharmacies: string[]; soleOwnerOf: string[] }) {
  if (soleOwnerOf.length > 0) {
    const why = `Seul titulaire de ${soleOwnerOf.map((pharmacy) => `« ${pharmacy} »`).join(", ")} : ajoutez d'abord un autre titulaire, ou supprimez l'officine.`;
    return (
      <span className="flex flex-col items-end gap-1">
        <Button size="sm" variant="ghost" disabled leadingIcon={<Trash2 className="size-3.5" />} title={why}>
          Supprimer
        </Button>
        <span className="max-w-[16rem] text-right text-[11.5px] leading-4 text-text-tertiary">{why}</span>
      </span>
    );
  }
  return (
    <ConfirmAction
      label="Supprimer"
      icon={<Trash2 className="size-3.5" />}
      variant="ghost"
      tone="danger"
      title={`Supprimer le compte de ${name}`}
      description="Le compte est supprimé de toutes les officines où il travaille."
      consequences={[
        pharmacies.length > 0 ? `Retiré de : ${pharmacies.join(", ")}.` : "Ce compte n'est rattaché à aucune officine.",
        "Ses sessions sont fermées : il ne peut plus se connecter.",
        `L'adresse ${email} est libérée : on pourra y réinviter quelqu'un.`,
        "Son nom reste sur l'historique (qui a vérifié telle ordonnance) ; ses coordonnées sont effacées.",
        "Le geste est consigné au journal d'audit.",
      ]}
      typedConfirmation="SUPPRIMER"
      confirmLabel="Supprimer le compte"
      onConfirm={() => deleteUserAction({ userId })}
    />
  );
}
