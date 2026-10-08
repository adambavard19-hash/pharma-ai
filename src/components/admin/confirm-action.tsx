"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { confirmationMatches } from "@/core/admin/deletion";
import type { ActionResult } from "@/server/actions/types";

/**
 * Un geste sensible, toujours confirmé : la conséquence est écrite en clair,
 * un motif peut être exigé, et pour les gestes lourds il faut retaper un mot.
 * Le serveur revérifie tout : cette fenêtre protège d'un clic malheureux,
 * pas d'un appel malveillant.
 */
export function ConfirmAction({
  label,
  title,
  description,
  consequences,
  confirmLabel,
  tone = "primary",
  reason,
  typedConfirmation,
  onConfirm,
  successMessage,
  redirectTo,
  variant = "secondary",
  size = "sm",
  icon,
  disabled,
  children,
}: {
  label: ReactNode;
  title: string;
  description?: string;
  /** Ce qui va se passer, en liste. */
  consequences?: string[];
  confirmLabel: string;
  tone?: "primary" | "danger";
  /** Motif obligatoire (au moins 5 caractères). */
  reason?: { label: string; placeholder?: string };
  /** Mot (« RÉSILIER ») ou nom (celui d'une officine) à retaper pour confirmer : sans casse ni accents. */
  typedConfirmation?: string;
  /** Reçoit le motif saisi et le texte retapé : le serveur revérifie ce second texte, l'écran ne fait qu'aider. */
  onConfirm: (reason: string | undefined, typed: string) => Promise<ActionResult<unknown>>;
  successMessage?: string;
  /** Où aller après le succès, quand la page courante n'existe plus (une officine supprimée). Sinon la page se recharge. */
  redirectTo?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  icon?: ReactNode;
  disabled?: boolean;
  /** Contenu supplémentaire dans la fenêtre (récapitulatif, champs). */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [motive, setMotive] = useState("");
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { push } = useToast();

  const reasonOk = !reason || motive.trim().length >= 5;
  const typedOk = !typedConfirmation || confirmationMatches(typedConfirmation, typed);

  const close = () => {
    if (pending) return;
    setOpen(false);
    setMotive("");
    setTyped("");
    setError(null);
  };

  const confirm = () => {
    if (!reasonOk || !typedOk) return;
    setError(null);
    start(async () => {
      const result = await onConfirm(reason ? motive.trim() : undefined, typed.trim());
      if (!result.ok) {
        setError(result.error);
        push({ tone: "error", title: result.error });
        return;
      }
      push({ tone: "success", title: result.message ?? successMessage ?? "C'est fait." });
      setOpen(false);
      setMotive("");
      setTyped("");
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    });
  };

  return (
    <>
      <Button type="button" variant={variant} size={size} leadingIcon={icon} disabled={disabled} onClick={() => setOpen(true)}>
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
            <Button type="button" variant={tone === "danger" ? "danger" : "primary"} onClick={confirm} loading={pending} disabled={!reasonOk || !typedOk}>
              {confirmLabel}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {consequences && consequences.length > 0 && (
            <ul className="space-y-1.5 rounded-xl bg-surface-sunken px-4 py-3 text-[13.5px] leading-5 text-text-primary">
              {consequences.map((c) => (
                <li key={c} className="flex gap-2">
                  <span aria-hidden="true" className="text-text-tertiary">•</span>
                  {c}
                </li>
              ))}
            </ul>
          )}
          {children}
          {reason && (
            <label className="block space-y-1.5">
              <span className="text-[13px] font-medium text-text-primary">{reason.label}</span>
              <textarea value={motive} onChange={(e) => setMotive(e.target.value)} rows={3} maxLength={500} placeholder={reason.placeholder} className="w-full rounded-lg border border-border-default bg-surface-card px-3 py-2 text-[13.5px] text-text-primary focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none" />
              {!reasonOk && motive.length > 0 && <span className="text-[12px] text-text-tertiary">Au moins 5 caractères.</span>}
            </label>
          )}
          {typedConfirmation && (
            <label className="block space-y-1.5">
              <span className="text-[13px] font-medium text-text-primary">
                Pour confirmer, tapez <strong className="font-mono">{typedConfirmation}</strong>
              </span>
              <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className="h-10 w-full rounded-lg border border-border-default bg-surface-card px-3 font-mono text-[13.5px] uppercase text-text-primary focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none" />
            </label>
          )}
          {error && <p className="rounded-lg bg-danger-50 px-3 py-2 text-[13px] text-danger-700 dark:bg-danger-700/15 dark:text-danger-500" role="alert">{error}</p>}
        </div>
      </Modal>
    </>
  );
}
