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
  // Le dégradé de marque (teal → vert) : le bouton principal, comme sur le site de référence.
  primary:
    // LE vert des actions principales, partout (un seul jeton : brand-700, blanc à plus de 5:1 en clair comme en sombre).
    // Le bord (un anneau intérieur, sans changer la taille) n'apparaît que dans l'espace pharmacie : le vert profond.
    "bg-brand-700 text-white shadow-xs ring-1 ring-inset ring-(--ui-btn-primary-ring) hover:bg-brand-800 active:bg-brand-900 disabled:bg-brand-700/50",
  // Neutre partout ; citron dans l'espace pharmacie (jetons --ui-btn-secondary-*, globals.css).
  secondary:
    "bg-(--ui-btn-secondary-bg) text-(--ui-btn-secondary-text) border border-(--ui-btn-secondary-border) shadow-xs hover:bg-(--ui-btn-secondary-hover) active:brightness-95",
  outline:
    "border border-border-default text-text-primary hover:bg-surface-sunken active:bg-ink-200 dark:active:bg-ink-700",
  ghost: "text-text-secondary hover:bg-surface-sunken hover:text-text-primary",
  danger:
    "bg-danger-600 text-white shadow-sm hover:bg-danger-700 active:bg-danger-700 disabled:bg-danger-500/50",
  // Vert foncé : le texte blanc reste lisible (5,6:1 ; le vert plus clair d'avant n'atteignait que 3,7:1).
  success:
    "bg-success-700 text-white shadow-xs hover:bg-success-800 active:bg-success-900",
  accent:
    "bg-accent-500 text-ink-950 shadow-sm hover:bg-accent-400 active:bg-accent-600",
};

const SIZES: Record<Size, string> = {
  // Le rayon suit le jeton --ui-radius-btn : celui d'origine partout, la pilule (46 px) dans l'espace pharmacie.
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-(--ui-radius-btn)",
  md: "h-10 px-4 text-sm gap-2 rounded-(--ui-radius-btn)",
  lg: "h-11 px-6 text-sm gap-2 rounded-(--ui-radius-btn)",
  xl: "h-14 px-7 text-base gap-2.5 rounded-(--ui-radius-btn-xl) font-semibold",
  icon: "h-10 w-10 rounded-(--ui-radius-btn)",
};

/** La pastille citron qui tient la flèche diagonale (variante « avec flèche »), à la mesure du bouton. */
const ARROW_DISC: Record<Size, string> = {
  sm: "size-6 -mr-2",
  md: "size-8 -mr-3",
  lg: "size-9 -mr-5",
  xl: "size-12 -mr-6",
  icon: "size-8",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  /** Rend l'élément enfant au lieu d'un `<button>` (utile pour les liens). */
  asChild?: boolean;
  loading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  /** Variante « avec flèche » : une pastille citron tient la flèche diagonale, à droite du libellé. */
  arrow?: boolean;
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  asChild = false,
  loading = false,
  leadingIcon,
  trailingIcon,
  arrow = false,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const trailing = arrow ? <ArrowDisc size={size} /> : trailingIcon;
  const classes = cn(
    "group/btn inline-flex items-center justify-center font-medium whitespace-nowrap",
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
            {!loading && trailing}
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
      {!loading && trailing}
    </button>
  );
}

/** La flèche diagonale, en couleur du texte, dans une pastille citron (le vert profond reste lisible à 11:1). */
function ArrowDisc({ size }: { size: Size }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-citron-200 text-deep-900 transition-transform duration-250 ease-[cubic-bezier(0.2,0,0,1)] group-hover/btn:rotate-45",
        ARROW_DISC[size],
      )}
    >
      <svg viewBox="0 0 19.0049 19" className="size-[38%]" fill="currentColor" aria-hidden="true">
        <path d="M19.0049 1.18457H19.002V18.3564H17.8047V2.21973L0.84668 19L0 18.1621L17.1582 1.18457H0.453125V0H19.0049V1.18457Z" />
      </svg>
    </span>
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
