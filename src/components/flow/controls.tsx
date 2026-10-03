"use client";

import { useEffect, useId, useRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { Check, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Les réponses d'un parcours : de grands champs lisibles, des cartes à
 * toucher, des compteurs. Chaque contrôle porte son libellé et son erreur ;
 * le parcours, lui, porte la question.
 */
const CONTROL = cn(
  "block w-full rounded-2xl border border-border-default bg-surface-app px-4 text-[18px] text-text-primary placeholder:text-text-tertiary/70",
  "shadow-xs transition-[border-color,box-shadow,background-color] duration-150",
  "focus:border-brand-500 focus:bg-surface-card focus:ring-4 focus:ring-brand-500/15 focus:outline-none",
  "aria-[invalid=true]:border-danger-500 aria-[invalid=true]:ring-danger-500/15",
);

export function FieldMessage({ id, error, hint }: { id: string; error?: string; hint?: ReactNode }) {
  if (error) {
    return (
      <p id={id} className="mt-2 text-[13.5px] text-danger-600" role="alert">
        {error}
      </p>
    );
  }
  if (!hint) return null;
  return (
    <p id={id} className="mt-2 text-[13px] text-text-tertiary">
      {hint}
    </p>
  );
}

type TextProps = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
  label?: ReactNode;
  /** Libellé lu par un lecteur d'écran seulement : la question le dit déjà. */
  srLabel?: string;
  value: string;
  onValueChange: (value: string) => void;
  error?: string;
  hint?: ReactNode;
  badge?: ReactNode;
  autofocus?: boolean;
  trailing?: ReactNode;
};

export function TextAnswer({ label, srLabel, value, onValueChange, error, hint, badge, autofocus, trailing, className, id: givenId, ...props }: TextProps) {
  const generated = useId();
  const id = givenId ?? generated;
  const messageId = `${id}-message`;
  return (
    <div className={className}>
      {(label || badge) && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          {label && (
            <label htmlFor={id} className="text-[13.5px] font-medium text-text-secondary">
              {label}
            </label>
          )}
          {badge}
        </div>
      )}
      {!label && srLabel && (
        <label htmlFor={id} className="sr-only">
          {srLabel}
        </label>
      )}
      <div className="relative">
        <input
          id={id}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? messageId : undefined}
          data-autofocus={autofocus ? "" : undefined}
          className={cn(CONTROL, "h-14", trailing && "pr-12")}
          {...props}
        />
        {trailing && <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center">{trailing}</span>}
      </div>
      <FieldMessage id={messageId} error={error} hint={hint} />
    </div>
  );
}

export function LongTextAnswer({
  srLabel,
  value,
  onValueChange,
  error,
  hint,
  className,
  ...props
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value"> & { srLabel: string; value: string; onValueChange: (value: string) => void; error?: string; hint?: ReactNode }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="sr-only">
        {srLabel}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-message`}
        className={cn(CONTROL, "min-h-36 resize-y py-3.5 text-[17px] leading-7")}
        {...props}
      />
      <FieldMessage id={`${id}-message`} error={error} hint={hint ?? <span className="hidden md:inline">⌘ ou Ctrl + Entrée pour continuer.</span>} />
    </div>
  );
}

export type ChoiceOption<T extends string> = { value: T; label: ReactNode; description?: ReactNode; icon?: ReactNode };

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable);
}

/**
 * Raccourcis clavier : la lettre affichée sur une carte la choisit, tant que
 * le curseur n'est pas dans un champ de saisie.
 */
function useShortcutKeys(keys: string[], onKey: (index: number) => void) {
  const handler = useRef(onKey);
  useEffect(() => {
    handler.current = onKey;
  });
  const signature = keys.join("");
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      // Seulement quand on est dans le parcours (ou nulle part ailleurs) : pas de choix fantôme en lisant la page.
      const target = event.target as HTMLElement | null;
      if (target && target !== document.body && !target.closest("[data-flow-stage]")) return;
      const index = signature.indexOf(event.key.toUpperCase());
      if (event.key.length === 1 && index >= 0) {
        event.preventDefault();
        handler.current(index);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [signature]);
}

const useLetterKeys = (count: number, onLetter: (index: number) => void) => useShortcutKeys(LETTERS.slice(0, count).split(""), onLetter);

function Card({ selected, letter, icon, label, description, onClick, role, multi, invalid, dense }: { selected: boolean; letter?: string; icon?: ReactNode; label: ReactNode; description?: ReactNode; onClick: () => void; role?: string; multi?: boolean; invalid?: boolean; dense?: boolean }) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={role === "radio" ? selected : undefined}
      aria-pressed={role ? undefined : selected}
      aria-invalid={invalid ? true : undefined}
      onClick={onClick}
      className={cn(
        "group relative flex w-full items-center gap-3 rounded-2xl border bg-surface-app px-4 text-left transition-all duration-150",
        dense ? "min-h-12 px-3 py-2 sm:px-4" : "min-h-16 py-3",
        "hover:-translate-y-px hover:border-brand-300 hover:bg-surface-card hover:shadow-sm active:translate-y-0 motion-reduce:transform-none",
        selected ? "border-brand-500 bg-brand-50 shadow-sm ring-1 ring-brand-500/40 dark:bg-brand-950/40" : "border-border-default",
        invalid && !selected && "border-danger-500/60",
      )}
    >
      {letter && (
        <span
          className={cn(
            "hidden size-6 shrink-0 items-center justify-center rounded-md border font-mono text-[11px] font-semibold sm:flex",
            selected ? "border-brand-500 bg-brand-600 text-white" : "border-border-default bg-surface-card text-text-tertiary group-hover:border-brand-300 group-hover:text-brand-700",
          )}
          aria-hidden="true"
        >
          {letter}
        </span>
      )}
      {icon && <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", selected ? "bg-brand-600 text-white" : "bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200")} aria-hidden="true">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className={cn("block leading-5 font-semibold break-words hyphens-auto text-text-primary", dense ? "text-[14.5px]" : "text-[15.5px]")}>{label}</span>
        {description && <span className="mt-0.5 block text-[13px] leading-5 text-text-secondary">{description}</span>}
      </span>
      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center border transition-colors",
          multi ? "rounded-md" : "rounded-full",
          selected ? "border-brand-600 bg-brand-600 text-white" : "border-border-default bg-surface-card text-transparent",
        )}
        aria-hidden="true"
      >
        <Check className="size-3.5" strokeWidth={3} />
      </span>
    </button>
  );
}

/** Une seule réponse possible : un clic la choisit et passe à la suite. */
export function ChoiceCards<T extends string>({ label, options, value, onChoose, columns = 2, error }: { label: string; options: ChoiceOption<T>[]; value: T | "" | null; onChoose: (value: T) => void; columns?: 1 | 2 | 3; error?: string }) {
  useLetterKeys(options.length, (index) => onChoose(options[index].value));
  return (
    <div>
      <div role="radiogroup" aria-label={label} className={cn("grid grid-cols-1 gap-2.5", columns >= 2 && "@md:grid-cols-2", columns === 3 && "@2xl:grid-cols-3")}>
        {options.map((option, i) => (
          <Card key={option.value} role="radio" selected={value === option.value} letter={LETTERS[i]} icon={option.icon} label={option.label} description={option.description} onClick={() => onChoose(option.value)} invalid={Boolean(error)} />
        ))}
      </div>
      {error && <p className="mt-2 text-[13.5px] text-danger-600" role="alert">{error}</p>}
    </div>
  );
}

/** Plusieurs réponses possibles : chaque carte se coche et se décoche. */
export function MultiCards<T extends string>({ label, options, values, onToggle, columns = 2, error, dense }: { label: string; options: ChoiceOption<T>[]; values: T[]; onToggle: (value: T) => void; columns?: 2 | 3; error?: string; dense?: boolean }) {
  useLetterKeys(options.length, (index) => onToggle(options[index].value));
  return (
    <div>
      <div role="group" aria-label={label} className={cn("grid gap-2.5 @md:grid-cols-2", dense ? "grid-cols-2 gap-2" : "grid-cols-1", columns === 3 && "@2xl:grid-cols-3")}>
        {options.map((option, i) => (
          <Card key={option.value} multi dense={dense} selected={values.includes(option.value)} letter={LETTERS[i]} icon={option.icon} label={option.label} description={option.description} onClick={() => onToggle(option.value)} invalid={Boolean(error)} />
        ))}
      </div>
      {error && <p className="mt-2 text-[13.5px] text-danger-600" role="alert">{error}</p>}
    </div>
  );
}

/**
 * Un nombre : des pastilles pour les cas courants, un compteur au-delà.
 * La valeur reste une chaîne (« 2 ») comme dans un champ texte.
 */
export function CountAnswer({ label, value, onValueChange, onChoose, quick = [1, 2, 3, 4], min = 1, max = 50, unit, error }: { label: string; value: string; onValueChange: (value: string) => void; onChoose?: (value: string) => void; quick?: number[]; min?: number; max?: number; unit?: (n: number) => string; error?: string }) {
  const n = Number(value);
  const current = Number.isFinite(n) && value !== "" ? n : null;
  const custom = current !== null && !quick.includes(current);
  const step = (delta: number) => onValueChange(String(Math.min(max, Math.max(min, (current ?? min) + delta))));
  const inputId = useId();
  // Le chiffre affiché sur une pastille la choisit.
  useShortcutKeys(quick.filter((q) => q < 10).map(String), (index) => (onChoose ?? onValueChange)(String(quick[index])));
  return (
    <div>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2.5">
        {quick.map((q) => (
          <button
            key={q}
            type="button"
            role="radio"
            aria-checked={current === q}
            onClick={() => (onChoose ?? onValueChange)(String(q))}
            className={cn(
              "flex h-16 min-w-16 flex-col items-center justify-center rounded-2xl border px-4 text-[22px] font-semibold tabular-nums transition-all duration-150",
              current === q ? "border-brand-500 bg-brand-600 text-white shadow-sm" : "border-border-default bg-surface-app text-text-primary hover:-translate-y-px hover:border-brand-300 hover:bg-surface-card motion-reduce:transform-none",
            )}
          >
            {q}
          </button>
        ))}
        <div className={cn("flex h-16 items-center gap-1 rounded-2xl border bg-surface-app px-1.5", custom ? "border-brand-500 ring-1 ring-brand-500/40" : "border-border-default")}>
          <button type="button" onClick={() => step(-1)} className="flex size-11 items-center justify-center rounded-xl text-text-secondary hover:bg-surface-sunken hover:text-text-primary" aria-label="Un de moins">
            <Minus className="size-4" />
          </button>
          <label htmlFor={inputId} className="sr-only">{label}</label>
          <input
            id={inputId}
            inputMode="numeric"
            value={custom ? value : ""}
            placeholder={`${(quick.at(-1) ?? 4) + 1}+`}
            onChange={(e) => onValueChange(e.target.value.replace(/\D+/g, "").slice(0, 3))}
            aria-invalid={error ? true : undefined}
            className="h-11 w-14 rounded-lg bg-transparent text-center text-[20px] font-semibold tabular-nums text-text-primary placeholder:text-[15px] placeholder:font-medium placeholder:text-text-tertiary focus:bg-surface-card focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
          />
          <button type="button" onClick={() => step(1)} className="flex size-11 items-center justify-center rounded-xl text-text-secondary hover:bg-surface-sunken hover:text-text-primary" aria-label="Un de plus">
            <Plus className="size-4" />
          </button>
        </div>
      </div>
      {current !== null && unit && <p className="mt-3 text-[14px] text-text-secondary" aria-live="polite">{unit(current)}</p>}
      {error && <p className="mt-2 text-[13.5px] text-danger-600" role="alert">{error}</p>}
    </div>
  );
}

/** Une question fermée courte (Oui / Non / Je ne sais pas), en ligne. */
export function Segmented<T extends string>({ label, options, value, onChange }: { label: string; options: { value: T; label: string }[]; value: T | null; onChange: (value: T) => void }) {
  const labelId = useId();
  return (
    <div className="flex flex-col gap-2 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <span id={labelId} className="text-[15.5px] font-medium text-text-primary">
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={labelId} className="inline-flex w-fit shrink-0 rounded-full border border-border-default bg-surface-app p-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-full px-4 py-2 text-[14px] font-medium whitespace-nowrap transition-colors",
              value === option.value ? "bg-brand-600 text-white shadow-sm" : "text-text-secondary hover:text-text-primary",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** La marque d'une valeur reprise d'un annuaire public : la personne sait qu'elle doit vérifier. */
export function SourceBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-[12px] font-medium text-brand-800 dark:bg-brand-950/50 dark:text-brand-200">
      <Check className="size-3" strokeWidth={3} aria-hidden="true" />
      {children}
    </span>
  );
}

/** Un panneau latéral qui se remplit au fil des réponses. */
export function LiveCard({ title, children, footer }: { title: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="sticky top-24 overflow-hidden rounded-[24px] border border-border-subtle bg-surface-card">
      <div className="border-b border-border-subtle px-5 py-4">
        <p className="font-mono text-[11px] tracking-[0.14em] text-text-tertiary uppercase">{title}</p>
      </div>
      <div className="px-5 py-4">{children}</div>
      {footer && <div className="border-t border-border-subtle bg-surface-sunken/50 px-5 py-4 text-[12.5px] leading-5 text-text-secondary">{footer}</div>}
    </div>
  );
}

export function LiveRow({ label, value }: { label: string; value: ReactNode | null | undefined }) {
  const filled = value !== null && value !== undefined && value !== "" && !(Array.isArray(value) && value.length === 0);
  return (
    <div className="flex items-start gap-3 py-2">
      <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-300", filled ? "border-brand-600 bg-brand-600 text-white" : "border-dashed border-border-default text-transparent")} aria-hidden="true">
        <Check className="size-3" strokeWidth={3} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11.5px] font-medium tracking-[0.02em] text-text-tertiary">{label}</p>
        {filled ? <div className="motion-safe:animate-fade-in text-[14px] leading-5 font-medium break-words text-text-primary">{value}</div> : <div className="mt-1.5 h-2.5 w-24 rounded-full bg-surface-sunken" />}
      </div>
    </div>
  );
}
