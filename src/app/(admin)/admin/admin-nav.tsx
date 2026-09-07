"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/admin/pharmacies", label: "Officines clientes" },
  { href: "/admin", label: "Vue plateforme" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1" aria-label="Sections de la console">
      {ITEMS.map((item) => {
        const active =
          item.href === "/admin"
            ? pathname === "/admin"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "-mb-px border-b-2 px-3.5 py-2.5 text-[13.5px] font-medium transition-colors",
              active
                ? "border-brand-600 text-brand-700 dark:text-brand-400"
                : "border-transparent text-text-secondary hover:text-text-primary",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
