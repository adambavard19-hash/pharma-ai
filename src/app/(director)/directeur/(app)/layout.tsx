import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { requireDirectorSession } from "@/server/auth/director-session";
import { directorLogoutAction } from "@/server/actions/director-auth";
import { Dropdown, DropdownLabel, DropdownSeparator } from "@/components/ui/dropdown";
import { DIRECTOR_HOME } from "@/core/sales/director/nav";
import { DirectorNav } from "./director-nav";

export const metadata: Metadata = {
  title: { default: "Direction commerciale — PharmaBoost", template: "%s · Direction commerciale" },
  robots: { index: false, follow: false, nocache: true },
};

/**
 * La coquille de l'espace du directeur commercial : un en-tête sobre, le menu,
 * le compte. Aucune officine, aucun patient, aucune recherche : le directeur
 * gère l'équipe, rien d'autre.
 *
 * Cette garde ne suffit pas à elle seule : une navigation entre deux pages ne
 * rejoue pas le layout. Chaque page et chaque action rappelle donc
 * `requireDirectorSession()` en première ligne.
 */
export default async function DirectorLayout({ children }: { children: ReactNode }) {
  const session = await requireDirectorSession();

  return (
    <div className="min-h-dvh bg-surface-app">
      <header className="sticky top-[env(safe-area-inset-top,0px)] z-40 border-b border-border-subtle bg-surface-card/95 backdrop-blur supports-[backdrop-filter]:bg-surface-card/85">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-3 px-4 pt-3 pb-2 sm:px-6 sm:pb-0">
          <Link href={DIRECTOR_HOME} className="flex min-w-0 items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500">
            <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-[15px] font-semibold text-white">✚</span>
            <span className="min-w-0">
              <span className="block truncate text-[14px] leading-4 font-semibold text-text-primary">PharmaBoost · Direction commerciale</span>
            </span>
          </Link>
          <Dropdown
            triggerLabel="Mon compte"
            trigger={<span className="flex size-8 items-center justify-center rounded-full bg-brand-100 text-[12px] font-semibold text-brand-800 dark:bg-brand-900 dark:text-brand-100">{session.director.initials}</span>}
            triggerClassName="shrink-0 rounded-full p-0.5 transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            className="w-60"
          >
            <DropdownLabel>
              <span className="block text-[13px] font-semibold text-text-primary normal-case">{session.director.fullName}</span>
              <span className="block break-all text-[12px] font-normal text-text-tertiary normal-case">{session.director.email}</span>
            </DropdownLabel>
            <DropdownSeparator />
            <form action={directorLogoutAction}>
              <button type="submit" role="menuitem" data-dropdown-item="" className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] text-text-primary transition-colors hover:bg-surface-sunken">
                <LogOut className="size-4 text-text-tertiary" aria-hidden="true" />
                Se déconnecter
              </button>
            </form>
          </Dropdown>
        </div>
        <div className="mx-auto max-w-[1180px] px-4 sm:px-6">
          <DirectorNav />
        </div>
      </header>

      <main className="mx-auto max-w-[1180px] space-y-6 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
