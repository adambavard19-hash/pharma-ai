import type { ReactNode } from "react";
import Link from "next/link";
import { Bell, LogOut } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { platformLogoutAction } from "@/server/actions/platform";
import { Dropdown, DropdownLabel, DropdownSeparator } from "@/components/ui/dropdown";
import { AdminNav } from "./admin-nav";
import { AdminSearch } from "./admin-search";
import { QuickActions } from "./quick-actions";
import { countUnreadAdminNotifications } from "@/server/services/sales/notifications";

/**
 * La console éditeur : le centre de contrôle de PharmaBoost.
 *
 * Volontairement distincte de l'application officine : quand on bascule d'un
 * espace à l'autre, on doit voir immédiatement qu'on a changé de monde. Ici
 * on administre des clients, pas des patients.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await requirePlatformSession();
  const unread = await countUnreadAdminNotifications();

  return (
    <div className="min-h-dvh bg-surface-app">
      <header className="sticky top-[env(safe-area-inset-top,0px)] z-40 border-b border-border-subtle bg-surface-card/95 backdrop-blur supports-[backdrop-filter]:bg-surface-card/85">
        <div className="mx-auto flex max-w-[1320px] items-center gap-3 px-6 pt-3">
          <Link href="/admin" className="flex shrink-0 items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-ink-900 text-[15px] font-semibold text-white dark:bg-white dark:text-ink-900">✚</span>
            <span className="hidden sm:block">
              <span className="block text-[14px] leading-4 font-semibold text-text-primary">PharmaBoost</span>
              <span className="block text-[11.5px] text-text-tertiary">Centre de contrôle</span>
            </span>
          </Link>

          <div className="flex min-w-0 flex-1 justify-center px-2">
            <AdminSearch />
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <QuickActions />
            <Link href="/admin/notifications" className="relative flex size-9 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-sunken hover:text-text-primary" aria-label={unread > 0 ? `Notifications : ${unread} non lue${unread > 1 ? "s" : ""}` : "Notifications"}>
              <Bell className="size-[18px]" aria-hidden="true" />
              {unread > 0 && <span className="absolute top-1 right-1 min-w-4 rounded-full bg-brand-600 px-1 text-center text-[10px] leading-4 font-semibold text-white tabular-nums">{unread > 99 ? "99+" : unread}</span>}
            </Link>
            <Dropdown
              triggerLabel="Mon compte"
              trigger={<span className="flex size-8 items-center justify-center rounded-full bg-brand-100 text-[12px] font-semibold text-brand-800 dark:bg-brand-900 dark:text-brand-100">{session.admin.initials}</span>}
              triggerClassName="rounded-full p-0.5 transition-colors hover:bg-surface-sunken"
              className="w-60"
            >
              <DropdownLabel>
                <span className="block text-[13px] font-semibold text-text-primary normal-case">{session.admin.fullName}</span>
                <span className="block text-[12px] font-normal text-text-tertiary normal-case">{session.admin.email}</span>
              </DropdownLabel>
              <DropdownSeparator />
              <form action={platformLogoutAction}>
                <button type="submit" role="menuitem" data-dropdown-item="" className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] text-text-primary transition-colors hover:bg-surface-sunken">
                  <LogOut className="size-4 text-text-tertiary" aria-hidden="true" />
                  Se déconnecter
                </button>
              </form>
            </Dropdown>
          </div>
        </div>

        <div className="mx-auto max-w-[1320px] px-6">
          <AdminNav unread={unread} />
        </div>
      </header>

      <main className="mx-auto max-w-[1320px] space-y-6 px-6 py-8">{children}</main>
    </div>
  );
}
