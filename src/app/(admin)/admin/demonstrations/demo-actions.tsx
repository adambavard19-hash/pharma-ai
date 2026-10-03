"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarX2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { useToast } from "@/components/ui/toast";
import { cancelDemoAction, markDemoDoneAction } from "@/server/actions/admin-commercial";
import { ScheduleDemoButton } from "./demo-dialog";

/**
 * Les gestes sur une démonstration : marquée réalisée, reprogrammée, ou
 * annulée (confirmée, avec un motif). Une démo réalisée ne s'annule plus.
 */
export function DemoActions({ prospect, demoAt, done, defaultAt, size = "sm" }: { prospect: { id: string; name: string }; demoAt: string | null; done: boolean; defaultAt: string; size?: "sm" | "md" }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { push } = useToast();
  if (done) return null;
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {demoAt && (
        <Button
          variant="outline"
          size={size}
          loading={pending}
          leadingIcon={<Check className="size-4" />}
          onClick={() =>
            start(async () => {
              const result = await markDemoDoneAction({ prospectId: prospect.id });
              push(result.ok ? { tone: "success", title: result.message ?? "Démonstration réalisée.", description: prospect.name } : { tone: "error", title: result.error });
              if (result.ok) router.refresh();
            })
          }
        >
          Réalisée
        </Button>
      )}
      <ScheduleDemoButton fixedProspect={prospect} defaultAt={defaultAt} currentAt={demoAt} label={demoAt ? "Reprogrammer" : "Programmer"} variant="ghost" size={size} />
      {demoAt && (
        <ConfirmAction
          label="Annuler"
          icon={<CalendarX2 className="size-4" />}
          variant="ghost"
          size={size}
          tone="danger"
          title="Annuler la démonstration"
          description={prospect.name}
          consequences={["La date de démonstration est effacée du dossier.", "Si le dossier attendait cette démo, il retrouve l'étape qu'il avait avant sa programmation.", "Dans l'agenda du commercial, la tâche « Démonstration » est close et marquée annulée (jamais supprimée) ; il est prévenu."]}
          confirmLabel="Annuler la démo"
          reason={{ label: "Motif de l'annulation", placeholder: "Reportée à la demande du titulaire, indisponibilité…" }}
          onConfirm={(reason) => cancelDemoAction({ prospectId: prospect.id, reason: reason ?? "" })}
          successMessage="Démonstration annulée."
        />
      )}
    </div>
  );
}
