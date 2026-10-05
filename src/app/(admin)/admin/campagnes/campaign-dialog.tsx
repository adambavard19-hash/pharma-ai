"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/server/actions/types";

/**
 * Une fenêtre de confirmation pour les gestes des campagnes qui en demandent
 * plus qu'un simple « Oui » : le mot retapé est TRANSMIS à l'action (qui le
 * revérifie côté serveur : cette fenêtre protège d'un clic malheureux, pas d'un
 * appel direct), un nombre peut être recalculé avant de confirmer, et une
 * action réussie peut mener ailleurs (suppression : la page n'existe plus).
 *
 * L'échec d'une action n'est jamais caché : son message reste affiché dans la
 * fenêtre, qui ne se ferme que sur un succès.
 */
export function CampaignDialog({
  label,
  icon,
  variant = "secondary",
  size = "sm",
  triggerDisabled,
  title,
  description,
  consequences,
  children,
  confirmLabel,
  tone = "primary",
  typedWord,
  canConfirm = true,
  pendingNote,
  interruptedNote,
  run,
  onSuccess,
  onClose,
}: {
  label: ReactNode;
  icon?: ReactNode;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  triggerDisabled?: boolean;
  title: string;
  description?: string;
  /** Ce qui va se passer, en liste, dit avant le clic. */
  consequences?: string[];
  /** Contenu de la fenêtre au-dessus de la confirmation (nombre de destinataires, date). Monté seulement à l'ouverture. */
  children?: ReactNode;
  confirmLabel: string;
  tone?: "primary" | "danger";
  /** Le mot à retaper (« ENVOYER ») ; il est transmis à `run`. */
  typedWord?: string;
  /** Faux : le bouton de confirmation reste grisé (nombre pas encore recalculé, date invalide…). */
  canConfirm?: boolean;
  /** Une phrase affichée pendant que l'action tourne (un envoi peut durer près d'une minute). */
  pendingNote?: string;
  /** Dit quoi faire quand le serveur n'a pas répondu : le geste a pu aboutir, il faut vérifier avant de recommencer. */
  interruptedNote?: string;
  run: (typed: string) => Promise<ActionResult<unknown>>;
  onSuccess?: (result: Extract<ActionResult<unknown>, { ok: true }>) => void;
  /** Appelé à la fermeture, quelle qu'en soit la raison : remet à zéro ce que `children` avait calculé. */
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { push } = useToast();

  const typedOk = !typedWord || typed.trim().toUpperCase() === typedWord.toUpperCase();

  const reset = () => {
    setOpen(false);
    setTyped("");
    setError(null);
    onClose?.();
  };

  const close = () => {
    if (pending) return;
    reset();
  };

  const confirm = () => {
    if (!canConfirm || !typedOk) return;
    setError(null);
    start(async () => {
      let result: Awaited<ReturnType<typeof run>>;
      try {
        result = await run(typed.trim());
      } catch {
        // Pas de réponse du serveur (délai dépassé, réseau coupé) : on ne sait pas si le geste a abouti, et on le dit.
        const message = interruptedNote ?? "Le serveur n'a pas répondu : rien ne dit que le geste a abouti. Vérifiez avant de recommencer.";
        setError(message);
        push({ tone: "error", title: message });
        return;
      }
      if (!result.ok) {
        setError(result.error);
        push({ tone: "error", title: result.error });
        return;
      }
      // Un envoi simulé est dit simulé, jamais présenté comme réussi.
      const simulated = typeof result.data === "object" && result.data !== null && (result.data as { simulated?: unknown }).simulated === true;
      push({ tone: simulated ? "warning" : "success", title: result.message ?? "C'est fait." });
      reset();
      onSuccess?.(result);
    });
  };

  return (
    <>
      <Button type="button" variant={variant} size={size} leadingIcon={icon} disabled={triggerDisabled} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Modal
        open={open}
        onClose={close}
        title={title}
        description={description}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close} disabled={pending}>
              Annuler
            </Button>
            <Button type="button" variant={tone === "danger" ? "danger" : "primary"} onClick={confirm} loading={pending} disabled={!canConfirm || !typedOk}>
              {confirmLabel}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {children}
          {consequences && consequences.length > 0 && (
            <ul className="space-y-1.5 rounded-xl bg-surface-sunken px-4 py-3 text-[13.5px] leading-5 text-text-primary">
              {consequences.map((line) => (
                <li key={line} className="flex gap-2">
                  <span aria-hidden="true" className="text-text-tertiary">
                    •
                  </span>
                  {line}
                </li>
              ))}
            </ul>
          )}
          {typedWord && (
            <label className="block space-y-1.5">
              <span className="text-[13px] font-medium text-text-primary">
                Pour confirmer, retapez <strong className="font-mono">{typedWord}</strong>
              </span>
              <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} disabled={pending} className="h-10 w-full rounded-lg border border-border-default bg-surface-card px-3 font-mono text-[13.5px] uppercase text-text-primary focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none" />
            </label>
          )}
          {pending && pendingNote && (
            <p className="text-[13px] text-text-secondary" role="status">
              {pendingNote}
            </p>
          )}
          {error && (
            <p className="rounded-lg bg-danger-50 px-3 py-2 text-[13px] text-danger-700 dark:bg-danger-700/15 dark:text-danger-500" role="alert">
              {error}
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}
