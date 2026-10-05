"use client";

import { useTransition } from "react";
import { Check, X } from "lucide-react";
import { setReferralLeadStatusAction } from "@/server/actions/admin-referral-leads";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/**
 * Les deux gestes sur un confrère proposé au parrainage : le marquer « Contacté »
 * (l'équipe l'a appelé) ou « Décliné » (il ne veut pas). Rien n'est envoyé à la personne.
 */
export function ReferralLeadActions({ leadId, status }: { leadId: string; status: "NEW" | "CONTACTED" | "DECLINED" }) {
  const [pending, start] = useTransition();
  const { push } = useToast();
  const set = (next: "CONTACTED" | "DECLINED") =>
    start(async () => {
      const result = await setReferralLeadStatusAction({ leadId, status: next });
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Statut mis à jour") : result.error });
    });
  return (
    <div className="flex flex-wrap gap-1.5">
      {status !== "CONTACTED" && (
        <Button size="sm" variant="outline" loading={pending} leadingIcon={<Check className="size-3.5" />} onClick={() => set("CONTACTED")}>
          Contacté
        </Button>
      )}
      {status !== "DECLINED" && (
        <Button size="sm" variant="ghost" loading={pending} leadingIcon={<X className="size-3.5" />} onClick={() => set("DECLINED")}>
          Décliné
        </Button>
      )}
    </div>
  );
}
