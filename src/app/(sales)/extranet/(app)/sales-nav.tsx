"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, CalendarClock, Euro, Home, KanbanSquare } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/extranet", label: "Accueil", icon: Home, exact: true },
  { href: "/extranet/pipeline", label: "Pipeline", icon: KanbanSquare },
  { href: "/extranet/taches", label: "Relances", icon: CalendarClock },
  { href: "/extranet/commissions", label: "Commissions", icon: Euro },
  { href: "/extranet/notifications", label: "Alertes", icon: Bell },
];

export function SalesNav({ unread, mobile = false }: { unread: number; mobile?: boolean }) {
  const pathname = usePathname();
  return (
    <nav className={cn(mobile ? "grid grid-cols-5" : "flex gap-1")} aria-label="Sections de l'extranet">
      {ITEMS.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              mobile
                ? "flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium"
                : "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13.5px] font-medium transition-colors",
              active ? (mobile ? "text-brand-700 dark:text-brand-400" : "border-brand-600 text-brand-700 dark:text-brand-400") : mobile ? "text-text-tertiary" : "border-transparent text-text-secondary hover:text-text-primary",
            )}
          >
            <span className="relative">
              <item.icon className={mobile ? "size-5" : "size-4"} />
              {item.href.endsWith("notifications") && unread > 0 && <span className="absolute -top-1 -right-1.5 flex size-4 items-center justify-center rounded-full bg-danger-600 text-[9.5px] font-bold text-white">{unread > 9 ? "9+" : unread}</span>}
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
