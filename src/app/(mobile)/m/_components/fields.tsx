"use client";

import { useId, useState, useTransition, type FormEvent, type InputHTMLAttributes, type ReactNode } from "react";
import type { ActionResult } from "@/server/actions/types";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PROFESSIONS, PROFESSION_LABELS, type Profession } from "@/core/mobile/profile";

/**
 * Les champs de PharmaBoost Mobile. Texte en 16 px : en dessous, Safari sur iPhone zoome sur le champ touché et la
 * page « saute ». Hauteur 52 px, coins de 14 px, bordure qui s'allume au focus.
 */

/**
 * Envoie un formulaire à une action serveur SANS le vider en cas de refus. (Un `<form action>` de React 19 remet les
 * champs à zéro à la fin de l'action, même quand elle refuse : sur un téléphone, retaper tout un formulaire pour une
 * faute dans l'adresse e-mail ferait abandonner.) Une redirection de l'action est suivie normalement.
 */
export function useFormAction(action: (previous: ActionResult<null> | null, formData: FormData) => Promise<ActionResult<null>>) {
  const [state, setState] = useState<ActionResult<null> | null>(null);
  const [pending, startTransition] = useTransition();
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await action(state, formData);
      setState(result);
    });
  };
  const fieldErrors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  // Une erreur rattachée à un champ s'affiche sous le champ, pas une seconde fois en tête du formulaire.
  const error = state && !state.ok && Object.keys(fieldErrors).length === 0 ? state.error : null;
  return { state, pending, onSubmit, fieldErrors, error, message: state && state.ok ? (state.message ?? null) : null };
}

const CONTROL =
  "block h-[52px] w-full rounded-[14px] border border-ink-200 bg-white px-4 text-[16px] text-ink-900 shadow-[0_1px_2px_rgb(23_33_38/0.04)] placeholder:text-ink-400 transition-[border-color,box-shadow] focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 focus:outline-none aria-[invalid=true]:border-danger-500 aria-[invalid=true]:ring-danger-500/15";

export function MField({ label, hint, error, optional, children, htmlFor }: { label: string; hint?: ReactNode; error?: string; optional?: boolean; children: ReactNode; htmlFor: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="flex items-baseline justify-between gap-2 px-0.5 text-[13.5px] font-semibold text-ink-800">
        {label}
        {optional && <span className="text-[12px] font-medium text-ink-400">facultatif</span>}
      </label>
      {children}
      {error ? (
        <p role="alert" className="px-0.5 text-[12.5px] font-medium text-danger-700">{error}</p>
      ) : hint ? (
        <p className="px-0.5 text-[12.5px] leading-[1.4] text-text-tertiary">{hint}</p>
      ) : null}
    </div>
  );
}

export function MInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL, className)} {...props} />;
}

/** Mot de passe avec l'œil « afficher » : sur un clavier de téléphone, on se trompe souvent. */
export function MPasswordInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={visible ? "text" : "password"} className={cn(CONTROL, "pr-12", props.className)} />
      <button
        type="button"
        onClick={() => setVisible((value) => !value)}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-ink-500 active:text-ink-800"
        aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
      >
        {visible ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}
      </button>
    </div>
  );
}

/** Le métier, en pastilles à toucher plutôt qu'une liste déroulante. */
export function ProfessionPicker({ name, defaultValue, error }: { name: string; defaultValue?: Profession | null; error?: string }) {
  const id = useId();
  return (
    <fieldset className="space-y-2" aria-describedby={error ? `${id}-error` : undefined}>
      <legend className="px-0.5 text-[13.5px] font-semibold text-ink-800">Votre métier</legend>
      <div className="flex flex-wrap gap-2">
        {PROFESSIONS.map((value) => (
          <label key={value} className="relative">
            <input type="radio" name={name} value={value} defaultChecked={defaultValue === value} className="peer sr-only" required />
            <span className="flex min-h-11 cursor-pointer items-center rounded-full border border-ink-200 bg-white px-4 text-[14px] font-medium text-ink-700 transition-all select-none peer-checked:border-brand-600 peer-checked:bg-brand-50 peer-checked:text-brand-900 peer-checked:shadow-[0_0_0_3px_oklch(0.64_0.105_182/0.15)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-500 active:scale-[0.97]">
              {PROFESSION_LABELS[value]}
            </span>
          </label>
        ))}
      </div>
      {error && <p id={`${id}-error`} role="alert" className="px-0.5 text-[12.5px] font-medium text-danger-700">{error}</p>}
    </fieldset>
  );
}

/**
 * Une case de consentement, présentée en interrupteur. JAMAIS cochée par défaut à l'inscription : `defaultChecked`
 * n'est passé que pour refléter un accord déjà donné (« Bienvenue » après l'inscription).
 */
export function ConsentSwitch({ name, title, body, defaultChecked = false }: { name: string; title: string; body: string; defaultChecked?: boolean }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex cursor-pointer gap-3 rounded-2xl border border-ink-200/80 bg-white p-4 transition-colors has-[:checked]:border-brand-300 has-[:checked]:bg-brand-50/50">
      <span className="min-w-0 flex-1 space-y-1">
        <span className="block text-[14.5px] font-semibold text-ink-900">{title}</span>
        <span className="block text-[12.5px] leading-[1.45] text-text-secondary">{body}</span>
      </span>
      <span className="relative mt-0.5 inline-flex h-7 w-12 shrink-0">
        <input id={id} type="checkbox" name={name} defaultChecked={defaultChecked} className="peer sr-only" />
        <span className="absolute inset-0 rounded-full bg-ink-300 transition-colors peer-checked:bg-brand-600 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-500" />
        <span className="absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow-md transition-transform duration-200 peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

export function MSubmit({ pending, children, icon, iconAfter = false, className }: { pending: boolean; children: ReactNode; icon?: ReactNode; iconAfter?: boolean; className?: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending || undefined}
      className={cn(
        "flex h-[54px] w-full items-center justify-center gap-2 rounded-[16px] bg-brand-gradient text-[16px] font-semibold text-white shadow-[0_10px_24px_-10px_oklch(0.45_0.09_175/0.7)] transition-[transform,filter] active:scale-[0.985] active:brightness-95 disabled:opacity-70",
        className,
      )}
    >
      {pending ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : !iconAfter && icon}
      {children}
      {!pending && iconAfter && icon}
    </button>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-2xl border border-danger-200 bg-danger-50 px-4 py-3 text-[13.5px] leading-5 font-medium text-danger-800">
      {message}
    </div>
  );
}
