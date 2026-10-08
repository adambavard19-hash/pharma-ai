"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, Power, RotateCcw, Trash2 } from "lucide-react";
import { deletePharmacyMemberAction, resendPharmacyMemberAccessAction, setPharmacyMemberAccessAction } from "@/server/actions/platform-pharmacies";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/**
 * Les gestes de la console sur un compte d'officine : renvoyer l'accès (sans
 * conséquence, direct), suspendre ou supprimer (toujours confirmés).
 */
export function MemberActions({ pharmacyId, membershipId, isActive, name }: { pharmacyId: string; membershipId: string; isActive: boolean; name: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { push } = useToast();
  const resend = () =>
    start(async () => {
      const result = await resendPharmacyMemberAccessAction({ pharmacyId, membershipId });
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Lien envoyé.") : result.error });
      router.refresh();
    });
  return (
    <span className="flex flex-wrap justify-end gap-1">
      <Button size="sm" variant="ghost" loading={pending} leadingIcon={<Mail className="size-3.5" />} onClick={resend}>
        Renvoyer l&apos;accès
      </Button>
      {isActive ? (
        <ConfirmAction
          label="Suspendre"
          icon={<Power className="size-3.5" />}
          variant="ghost"
          title={`Suspendre le compte de ${name}`}
          consequences={["Ce compte ne peut plus se connecter à cette officine ; ses sessions sont fermées.", "Le reste de l'équipe n'est pas concerné.", "Le geste est tracé au journal d'audit."]}
          confirmLabel="Suspendre le compte"
          tone="danger"
          onConfirm={() => setPharmacyMemberAccessAction({ pharmacyId, membershipId, isActive: false })}
        />
      ) : (
        <ConfirmAction
          label="Réactiver"
          icon={<RotateCcw className="size-3.5" />}
          variant="ghost"
          title={`Réactiver le compte de ${name}`}
          consequences={["Ce compte peut de nouveau se connecter à cette officine.", "Le geste est tracé au journal d'audit."]}
          confirmLabel="Réactiver le compte"
          onConfirm={() => setPharmacyMemberAccessAction({ pharmacyId, membershipId, isActive: true })}
        />
      )}
      <ConfirmAction
        label="Supprimer"
        icon={<Trash2 className="size-3.5" />}
        variant="ghost"
        tone="danger"
        title={`Supprimer le compte de ${name}`}
        description="Le compte est retiré de cette officine."
        consequences={[
          "Un compte qui n'a que cette officine est supprimé : ses sessions sont fermées et son adresse e-mail est libérée.",
          "Un compte qui travaille aussi dans une autre officine est seulement retiré d'ici : il garde son compte là-bas.",
          "Le seul titulaire de l'officine ne peut pas être supprimé : ajoutez d'abord un autre titulaire.",
          "Les traces (journal, historique) restent.",
        ]}
        typedConfirmation="SUPPRIMER"
        confirmLabel="Supprimer le compte"
        onConfirm={() => deletePharmacyMemberAction({ pharmacyId, membershipId })}
      />
    </span>
  );
}
