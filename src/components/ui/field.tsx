import { cn } from "@/lib/utils";
import type {
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

const CONTROL_BASE = cn(
  "w-full rounded-md border border-border-default bg-surface-card",
  "px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary",
  "shadow-xs transition-[border-color,box-shadow] duration-150",
  "focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none",
  "disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-text-tertiary",
  "aria-[invalid=true]:border-danger-500 aria-[invalid=true]:ring-danger-500/20",
);

export function Label({
  className,
  required,
  children,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) {
  return (
    <label
      className={cn("block text-[13px] font-medium text-text-primary", className)}
      {...props}
    >
      {children}
      {required && (
        <span className="ml-0.5 text-danger-600" aria-hidden="true">
          *
        </span>
      )}
    </label>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  className,
  children,
}: {
  label?: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <Label htmlFor={htmlFor} required={required}>
          {label}
        </Label>
      )}
      {children}
      {error ? (
        <p className="text-[12.5px] text-danger-600" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[12.5px] text-text-tertiary">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({
  className,
  leadingIcon,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { leadingIcon?: ReactNode }) {
  if (leadingIcon) {
    return (
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-text-tertiary">
          {leadingIcon}
        </span>
        <input className={cn(CONTROL_BASE, "pl-9", className)} {...props} />
      </div>
    );
  }
  return <input className={cn(CONTROL_BASE, className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(CONTROL_BASE, "min-h-20 resize-y", className)} {...props} />;
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        className={cn(CONTROL_BASE, "appearance-none pr-9 cursor-pointer", className)}
        {...props}
      >
        {children}
      </select>
      <svg
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-text-tertiary"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="m6 8 4 4 4-4"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export function Checkbox({
  className,
  label,
  description,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label?: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <input
        id={id}
        type="checkbox"
        className={cn(
          "mt-0.5 size-4 shrink-0 rounded border-border-strong text-brand-600",
          "focus:ring-2 focus:ring-brand-500/25 focus:ring-offset-0 cursor-pointer",
          className,
        )}
        {...props}
      />
      {(label || description) && (
        <div className="min-w-0">
          {label && (
            <label htmlFor={id} className="block text-sm text-text-primary cursor-pointer">
              {label}
            </label>
          )}
          {description && (
            <p className="text-[12.5px] text-text-tertiary">{description}</p>
          )}
        </div>
      )}
    </div>
  );
}

export function Switch({
  className,
  label,
  description,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label?: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      {(label || description) && (
        <div className="min-w-0">
          {label && (
            <label htmlFor={id} className="block text-sm font-medium text-text-primary">
              {label}
            </label>
          )}
          {description && (
            <p className="text-[12.5px] text-text-secondary">{description}</p>
          )}
        </div>
      )}
      <label className={cn("relative inline-flex shrink-0 cursor-pointer", className)}>
        <input id={id} type="checkbox" className="peer sr-only" {...props} />
        <span
          className={cn(
            "h-6 w-11 rounded-full bg-ink-300 transition-colors duration-200",
            "peer-checked:bg-brand-600 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/30",
            "dark:bg-ink-700",
          )}
        />
        <span
          className={cn(
            "pointer-events-none absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-sm",
            "transition-transform duration-200 peer-checked:translate-x-5",
          )}
        />
      </label>
    </div>
  );
}
