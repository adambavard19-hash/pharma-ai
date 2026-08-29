"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { NAVIGATION, isNavItemActive, type NavItem } from "@/config/navigation";
import { cn } from "@/lib/utils";
import { PharmaWordmark } from "./logo";
import { Button } from "@/components/ui/button";
import { useMobileNav } from "./mobile-nav";

export function Sidebar({
  permissions,
  pharmacyName,
}: {
  permissions: string[];
  pharmacyName: string;
}) {
  const { open: mobileOpen, closeNav } = useMobileNav();
  const granted = new Set(permissions);

  const items = NAVIGATION.filter((item) => granted.has(item.permission));
  const primary = items.find((item) => item.primary);
  const secondary = items.filter((item) => !item.primary);

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-ink-950/45 lg:hidden"
          onClick={closeNav}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-border-subtle bg-surface-card",
          "transition-transform duration-250 lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
        aria-label="Navigation principale"
      >
        <div className="flex items-center justify-between px-4 py-4">
          <Link href="/" className="min-w-0 rounded-md">
            <PharmaWordmark subtitle={pharmacyName} />
          </Link>
          <button
            type="button"
            onClick={closeNav}
            className="rounded-md p-1.5 text-text-tertiary lg:hidden"
            aria-label="Fermer la navigation"
          >
            <X className="size-4" />
          </button>
        </div>

        {primary && (
          <div className="px-3 pb-4">
            <Button
              asChild
              size="lg"
              className="w-full justify-start shadow-sm"
              leadingIcon={<primary.icon className="size-[18px]" />}
            >
              <Link href={primary.href} onClick={closeNav}>
                {primary.label}
              </Link>
            </Button>
          </div>
        )}

        <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
          {secondary.map((item) => (
            <NavLink key={item.href} item={item} onNavigate={closeNav} />
          ))}
        </nav>

        <div className="border-t border-border-subtle px-4 py-3">
          <p className="text-[11px] leading-4 text-text-tertiary">
            Pharma.ai assiste le pharmacien.
            <br />
            La décision reste professionnelle.
          </p>
        </div>
      </aside>
    </>
  );
}

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  const pathname = usePathname();
  const isActive = isNavItemActive(item, pathname);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors",
        isActive
          ? "bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300"
          : "text-text-secondary hover:bg-surface-sunken hover:text-text-primary",
      )}
    >
      <span className={cn(isActive ? "text-brand-600 dark:text-brand-400" : "text-text-tertiary")}>
        <Icon className="size-[17px]" />
      </span>
      {item.label}
    </Link>
  );
}
