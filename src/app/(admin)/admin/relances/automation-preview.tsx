"use client";

import { useEffect, useState } from "react";
import { Eye, Mail, BellRing, AlertTriangle } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { previewAutomationsAction, type AutomationPreviewItem } from "@/server/actions/admin-communication";

type PreviewState = { status: "loading" } | { status: "error"; error: string } | { status: "ready"; items: AutomationPreviewItem[]; enabledRules: number | null; alreadyDone: number | null };

const dateFormat = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric" });

/**
 * Ce qui partirait aujourd'hui, calculé par le serveur sans rien écrire ni
 * envoyer. Avec `ruleKey`, une seule règle, comme si elle était active avec
 * le délai donné ; sans, toutes les règles actives.
 */
export function AutomationPreviewList({ ruleKey, offsetDays, showRule = false }: { ruleKey?: string; offsetDays?: number; showRule?: boolean }) {
  const [state, setState] = useState<PreviewState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    previewAutomationsAction(ruleKey ? { ruleKey, offsetDays } : {}).then(
      (result) => {
        if (cancelled) return;
        setState(result.ok ? { status: "ready", items: result.data.items, enabledRules: result.data.enabledRules, alreadyDone: result.data.alreadyDone } : { status: "error", error: result.error });
      },
      () => !cancelled && setState({ status: "error", error: "L'aperçu n'a pas pu être calculé." }),
    );
    return () => {
      cancelled = true;
    };
  }, [ruleKey, offsetDays]);

  if (state.status === "loading") {
    return (
      <div className="space-y-2" aria-busy="true" aria-live="polite">
        <p className="text-[12.5px] text-text-tertiary">Calcul de ce qui partirait aujourd&apos;hui…</p>
        {[0, 1].map((i) => (
          <div key={i} className="h-11 animate-pulse rounded-lg bg-surface-sunken motion-reduce:animate-none" />
        ))}
      </div>
    );
  }
  if (state.status === "error") return <p className="rounded-lg bg-danger-50 px-3 py-2 text-[13px] text-danger-700 dark:bg-danger-700/15 dark:text-danger-500" role="alert">{state.error}</p>;

  const { items } = state;
  const going = items.filter((i) => i.status !== "PREVIEW_SKIPPED");
  const skipped = items.length - going.length;

  if (!ruleKey && state.enabledRules === 0) {
    return <p className="rounded-lg bg-surface-sunken px-3 py-3 text-[13px] text-text-secondary">Aucune règle n&apos;est activée : rien ne partirait.</p>;
  }

  return (
    <div className="space-y-2.5">
      <p className="text-[13px] font-medium text-text-primary">
        {going.length === 0 ? "Rien ne partirait aujourd'hui." : `${going.length} envoi${going.length > 1 ? "s" : ""} partirai${going.length > 1 ? "ent" : "t"} aujourd'hui.`}
        {skipped > 0 && <span className="font-normal text-text-secondary"> {skipped} ne partirai{skipped > 1 ? "ent" : "t"} pas, faute de destinataire ou d&apos;information.</span>}
        {state.alreadyDone ? <span className="font-normal text-text-tertiary"> {state.alreadyDone} déjà fait{state.alreadyDone > 1 ? "s" : ""}, écarté{state.alreadyDone > 1 ? "s" : ""}.</span> : null}
      </p>
      {items.length > 0 && (
        <ul className="max-h-72 divide-y divide-border-subtle overflow-y-auto rounded-xl border border-border-subtle">
          {items.map((item) => {
            const blocked = item.status === "PREVIEW_SKIPPED";
            return (
              <li key={item.dedupeKey} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-3 py-2.5">
                <span className="mt-0.5 text-text-tertiary" aria-hidden="true">
                  {blocked ? <AlertTriangle className="size-4 text-warning-600" /> : item.channel === "EMAIL" ? <Mail className="size-4" /> : <BellRing className="size-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] leading-5 font-medium text-text-primary">{item.targetLabel}</span>
                  <span className="block text-[12.5px] leading-5 text-text-secondary">
                    {showRule && <>{item.ruleLabel} · </>}
                    {item.channel === "EMAIL" ? (item.recipient ?? "Aucune adresse e-mail") : item.recipient}
                    {item.templateLabel && <> · {item.templateLabel}</>}
                  </span>
                  {blocked && item.detail && <span className="block text-[12px] leading-5 text-warning-700 dark:text-warning-500">{item.detail}</span>}
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <Badge tone={blocked ? "warning" : item.channel === "EMAIL" ? "info" : "brand"}>{blocked ? "Ne partira pas" : item.channel === "EMAIL" ? "E-mail" : "Alerte interne"}</Badge>
                  <span className="text-[11.5px] text-text-tertiary tabular-nums">dû le {dateFormat.format(new Date(item.dueAt))}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Un bouton qui ouvre l'aperçu dans une fenêtre. Rien n'est envoyé. */
export function AutomationPreviewButton({ ruleKey, offsetDays, label = "Prévisualiser", title, variant = "outline", size = "sm" }: { ruleKey?: string; offsetDays?: number; label?: string; title: string; variant?: ButtonProps["variant"]; size?: ButtonProps["size"] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant={variant} size={size} leadingIcon={<Eye className="size-4" />} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
        title={title}
        description={ruleKey ? "Ce que cette règle enverrait aujourd'hui avec le délai affiché, qu'elle soit activée ou non. Rien n'est envoyé." : "Ce que le prochain passage enverrait, règles activées seulement. Rien n'est envoyé."}
        footer={
          <div className="flex justify-end">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Fermer
            </Button>
          </div>
        }
      >
        <AutomationPreviewList ruleKey={ruleKey} offsetDays={offsetDays} showRule={!ruleKey} />
      </Modal>
    </>
  );
}
