"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { updatePharmacyMemberAction } from "@/server/actions/admin-team";
import type { TeamRole } from "@/core/team/rules";
import { MemberEditModal } from "@/components/team/member-edit-modal";
import { Button } from "@/components/ui/button";

/**
 * « Modifier » un compte depuis la fiche d'une officine : la même fenêtre que celle du titulaire dans son espace, avec
 * en plus ce que seul PharmaBoost peut faire (corriger l'identité d'un compte présent dans plusieurs officines, changer
 * l'adresse d'un titulaire). Les mêmes règles s'appliquent côté serveur.
 */
export function EditMemberButton({ pharmacyId, member }: { pharmacyId: string; member: { userId: string; firstName: string; lastName: string; email: string; phone: string | null; rppsNumber: string | null; role: TeamRole; isPrincipal: boolean; sharedAccount: boolean } }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" leadingIcon={<Pencil className="size-3.5" />} onClick={() => setOpen(true)}>
        Modifier
      </Button>
      <MemberEditModal
        member={open ? { ...member, isSelf: false } : null}
        canManageOwners
        admin
        onSave={(changes) => updatePharmacyMemberAction({ pharmacyId, userId: member.userId, ...changes })}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
