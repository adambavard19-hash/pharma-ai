"use client";

import { Play } from "lucide-react";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { runAutomationsAction } from "@/server/actions/admin-communication";
import { AutomationPreviewList } from "./automation-preview";

/** Le passage réel, à la demande : confirmé, avec la liste de ce qui va partir. */
export function RunAutomationsNow({ enabledRules, messagingLive }: { enabledRules: number; messagingLive: boolean }) {
  return (
    <ConfirmAction
      label="Lancer maintenant"
      icon={<Play className="size-4" />}
      variant="primary"
      size="md"
      disabled={enabledRules === 0}
      title="Lancer les relances automatiques maintenant ?"
      description="Le même passage que la tâche quotidienne, exécuté tout de suite."
      consequences={[
        `${enabledRules} règle${enabledRules > 1 ? "s" : ""} activée${enabledRules > 1 ? "s" : ""} : les relances dues partent immédiatement aux officines concernées.`,
        "Ce qui est déjà parti est écarté : rien ne part deux fois.",
        "Chaque envoi est tracé dans l'historique des communications, le lancement dans le journal d'audit.",
        ...(messagingLive ? [] : ["La messagerie n'est pas configurée : les e-mails seront tracés « non transmis », sans partir."]),
      ]}
      confirmLabel="Lancer le passage"
      onConfirm={() => runAutomationsAction()}
    >
      <div className="space-y-2">
        <p className="text-[12px] font-semibold tracking-[0.04em] text-text-tertiary uppercase">Ce qui va partir</p>
        <AutomationPreviewList showRule />
      </div>
    </ConfirmAction>
  );
}
