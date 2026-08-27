import { Children, isValidElement, type ReactElement } from "react";
import { Slot } from "./slot";
import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger"
  | "success"
  | "accent";
type Size = "sm" | "md" | "lg" | "xl" | "icon";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800 disabled:bg-brand-300",
  secondary:
    "bg-surface-raised text-text-primary border border-border-default shadow-xs hover:bg-surface-sunken active:bg-ink-200 dark:active:bg-ink-700",
  outline:
    "border border-border-default text-text-primary hover:bg-surface-sunken active:bg-ink-200 dark:active:bg-ink-700",
  ghost: "text-text-secondary hover:bg-surface-sunken hover:text-text-primary",
  danger:
    "bg-danger-600 text-white shadow-sm hover:bg-danger-700 active:bg-danger-700 disabled:bg-danger-500/50",
  success:
    "bg-success-600 text-white shadow-sm hover:bg-success-700 active:bg-success-700",
  accent:
    "bg-accent-500 text-ink-950 shadow-sm hover:bg-accent-400 active:bg-accent-600",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-md",
  md: "h-10 px-4 text-sm gap-2 rounded-md",
  lg: "h-11 px-5 text-[15px] gap-2 rounded-lg",
  xl: "h-14 px-7 text-base gap-2.5 rounded-xl font-semibold",
  icon: "h-10 w-10 rounded-md",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  /** Rend l'élément enfant au lieu d'un `<button>` (utile pour les liens). */
  asChild?: boolean;
  loading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  asChild = false,
  loading = false,
  leadingIcon,
  trailingIcon,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const classes = cn(
    "inline-flex items-center justify-center font-medium whitespace-nowrap",
    "transition-[background-color,border-color,color,box-shadow,transform] duration-150",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
    "disabled:pointer-events-none disabled:opacity-55",
    "active:translate-y-px",
    VARIANTS[variant],
    SIZES[size],
    className,
  );

  if (asChild) {
    // Les icônes sont réinjectées DANS l'enfant : `Slot` ne reçoit ainsi qu'un
    // seul élément, et le lien conserve son propre contenu.
    const child = Children.only(children);
    const inner = isValidElement(child)
      ? (child as ReactElement<{ children?: ReactNode }>).props.children
      : children;

    return (
      <Slot
        className={classes}
        slotContent={
          <>
            {loading ? <Spinner /> : leadingIcon}
            {inner}
            {!loading && trailingIcon}
          </>
        }
        {...props}
      >
        {children}
      </Slot>
    );
  }

  return (
    <button
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner /> : leadingIcon}
      {children}
      {!loading && trailingIcon}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn("size-4 animate-spin", className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
