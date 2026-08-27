"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, Plus, X } from "lucide-react";
import { NAVIGATION } from "@/config/navigation";
import { cn } from "@/lib/utils";
import { PharmaWordmark } from "./logo";
import { Button } from "@/components/ui/button";

export function Sidebar({
  permissions,
  pharmacyName,
  canCreatePrescription,
}: {
  permissions: string[];
  pharmacyName: string;
  canCreatePrescription: boolean;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const granted = new Set(permissions);

  const groups = NAVIGATION.map((group) => ({
    ...group,
    items: group.items.filter((item) => granted.has(item.permission)),
  })).filter((group) => group.items.length > 0);

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed top-3 left-3 z-30 rounded-lg border border-border-subtle bg-surface-card p-2 shadow-sm lg:hidden"
        aria-label="Ouvrir la navigation"
      >
        <Menu className="size-5 text-text-secondary" />
      </button>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-ink-950/45 lg:hidden"
          onClick={() => setMobileOpen(false)}
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
          <Link href="/tableau-de-bord" className="min-w-0 rounded-md">
            <PharmaWordmark subtitle={pharmacyName} />
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="rounded-md p-1.5 text-text-tertiary lg:hidden"
            aria-label="Fermer la navigation"
          >
            <X className="size-4" />
          </button>
        </div>

        {canCreatePrescription && (
          <div className="px-3 pb-3">
            <Button
              asChild
              size="lg"
              className="w-full justify-start shadow-sm"
              leadingIcon={<Plus className="size-[18px]" />}
            >
              <Link href="/ordonnances/nouvelle" onClick={() => setMobileOpen(false)}>
                Nouvelle ordonnance
              </Link>
            </Button>
          </div>
        )}

        <nav className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 pb-4">
          {groups.map((group) => (
            <div key={group.id} className="space-y-0.5">
              {group.label && (
                <p className="px-2.5 pt-1 pb-1.5 text-[10.5px] font-semibold tracking-[0.06em] text-text-tertiary uppercase">
                  {group.label}
                </p>
              )}
              {group.items.map((item) => (
                <NavLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  icon={<item.icon className="size-[17px]" />}
                  onNavigate={() => setMobileOpen(false)}
                />
              ))}
            </div>
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

function NavLink({
  href,
  label,
  icon,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  onNavigate: () => void;
}) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
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
        {icon}
      </span>
      {label}
    </Link>
  );
}
