"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Menu déroulant.
 *
 * Le bouton déclencheur est rendu PAR ce composant, et `trigger` n'en est que
 * le contenu. Une version antérieure clonait un élément fourni par l'appelant
 * pour y injecter `aria-expanded` et `aria-haspopup` : lorsque cet élément
 * venait d'un composant serveur, le balisage envoyé par le serveur ne portait
 * pas ces attributs alors que le client les ajoutait — d'où une erreur
 * d'hydratation à chaque page authentifiée. Faire porter le bouton au
 * composant client supprime la divergence par construction.
 */
export function Dropdown({
  trigger,
  triggerLabel,
  triggerClassName,
  children,
  align = "end",
  className,
}: {
  /** Contenu du bouton déclencheur (inerte : ni gestionnaire, ni attribut ARIA). */
  trigger: ReactNode;
  triggerLabel: string;
  triggerClassName?: string;
  children: ReactNode;
  align?: "start" | "end";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={containerRef}
      className="relative"
      onClick={(event) => {
        // Un clic sur une entrée du menu le referme.
        const target = event.target as HTMLElement;
        if (open && target.closest("[data-dropdown-item]")) setOpen(false);
      }}
    >
      <button
        type="button"
        className={triggerClassName}
        aria-label={triggerLabel}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        {trigger}
      </button>

      {open && (
        <div
          className={cn(
            "absolute z-40 mt-1.5 min-w-52 rounded-lg border border-border-subtle",
            "bg-surface-card p-1 shadow-lg animate-[slide-up_0.15s_ease-out]",
            align === "end" ? "right-0" : "left-0",
            className,
          )}
          role="menu"
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function DropdownItem({
  children,
  onClick,
  icon,
  destructive = false,
  disabled = false,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  icon?: ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      role="menuitem"
      data-dropdown-item=""
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px]",
        "transition-colors disabled:pointer-events-none disabled:opacity-50",
        destructive
          ? "text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-700/15"
          : "text-text-primary hover:bg-surface-sunken",
      )}
    >
      {icon && <span className="shrink-0 text-text-tertiary">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  );
}

export function DropdownLink({
  children,
  icon,
}: {
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <span
      data-dropdown-item=""
      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] text-text-primary transition-colors hover:bg-surface-sunken"
    >
      {icon && <span className="shrink-0 text-text-tertiary">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </span>
  );
}

export function DropdownSeparator() {
  return <div className="my-1 h-px bg-border-subtle" role="separator" />;
}

export function DropdownLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-2.5 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-text-tertiary uppercase">
      {children}
    </p>
  );
}
