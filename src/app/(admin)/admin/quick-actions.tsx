"use client";

import Link from "next/link";
import { Building2, CalendarClock, FileSignature, Megaphone, Plus, UserPlus, Briefcase } from "lucide-react";
import { Dropdown, DropdownLabel } from "@/components/ui/dropdown";

const ACTIONS = [
  { href: "/admin/pharmacies?nouveau=officine", label: "Nouvelle officine", icon: Building2 },
  { href: "/admin/pipeline?nouveau=prospect", label: "Nouveau prospect", icon: Briefcase },
  { href: "/admin/demonstrations?nouveau=demo", label: "Programmer une démo", icon: CalendarClock },
  { href: "/admin/contrats?vue=a-envoyer", label: "Envoyer un contrat", icon: FileSignature },
  { href: "/admin/commerciaux?nouveau=commercial", label: "Créer un commercial", icon: UserPlus },
  { href: "/admin/campagnes/nouvelle", label: "Campagne", icon: Megaphone },
];

/** « Créer » : les gestes les plus fréquents, à un clic de n'importe quelle page de la console. */
export function QuickActions() {
  return (
    <Dropdown
      triggerLabel="Créer"
      trigger={
        <>
          <Plus className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">Créer</span>
        </>
      }
      triggerClassName="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
      className="w-60"
    >
      <DropdownLabel>Actions rapides</DropdownLabel>
      {ACTIONS.map((action) => (
        <Link key={action.href} href={action.href} role="menuitem" data-dropdown-item="" className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] text-text-primary transition-colors hover:bg-surface-sunken">
          <action.icon className="size-4 text-text-tertiary" aria-hidden="true" />
          {action.label}
        </Link>
      ))}
    </Dropdown>
  );
}
