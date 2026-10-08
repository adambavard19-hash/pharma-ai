import Link from "next/link";
import { Bell, LogOut, ScanLine, Settings, Store } from "lucide-react";
import { GlobalSearch } from "./global-search";
import { MobileNavTrigger } from "./mobile-nav";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Dropdown,
  DropdownLabel,
  DropdownLink,
  DropdownSeparator,
} from "@/components/ui/dropdown";
import { logoutAction, switchPharmacyAction } from "@/server/actions/auth";
import type { SessionContext } from "@/server/auth/session";
import { DEMO_MODE_HINT, DEMO_MODE_LABEL, isCommercialDemoPharmacy } from "@/core/demo/identity";

export function Topbar({
  session,
  unreadNotifications,
}: {
  session: SessionContext;
  unreadNotifications: number;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border-subtle bg-surface-app/80 px-4 backdrop-blur-xs lg:px-6">
      <MobileNavTrigger />

      <div className="min-w-0 flex-1">
        <GlobalSearch />
      </div>

      {session.pharmacy.isDemo && (
        <span title={DEMO_MODE_HINT} className="hidden shrink-0 rounded-full border border-warning-300 bg-warning-50 px-2.5 py-0.5 text-[11.5px] font-medium text-warning-800 sm:inline dark:border-warning-800 dark:bg-warning-950/30 dark:text-warning-400">
          {DEMO_MODE_LABEL}
        </span>
      )}
      {isCommercialDemoPharmacy(session.pharmacy) && (
        <Link
          href="/demo"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-brand-300 bg-brand-50 px-3 py-1.5 text-[12.5px] font-medium text-brand-800 transition-colors hover:bg-brand-100 dark:border-brand-800 dark:bg-brand-950/30 dark:text-brand-300"
        >
          <ScanLine className="size-3.5" aria-hidden="true" />
          Simuler une délivrance
        </Link>
      )}

      <Link
        href="/notifications"
        className="relative rounded-lg p-2 text-text-secondary transition-colors hover:bg-surface-sunken hover:text-text-primary"
        aria-label={`Notifications${unreadNotifications > 0 ? ` — ${unreadNotifications} non lues` : ""}`}
      >
        <Bell className="size-[18px]" />
        {unreadNotifications > 0 && (
          <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-danger-600 text-[9.5px] font-semibold text-white tabular">
            {unreadNotifications > 9 ? "9+" : unreadNotifications}
          </span>
        )}
      </Link>

      <UserMenu session={session} />
    </header>
  );
}

function UserMenu({ session }: { session: SessionContext }) {
  const multiSite = session.availablePharmacies.length > 1;

  return (
    <Dropdown
      triggerLabel="Menu utilisateur"
      triggerClassName="flex items-center gap-2.5 rounded-lg py-1 pr-1 pl-2 transition-colors hover:bg-surface-sunken"
      trigger={
        <>
          <span className="hidden text-right sm:block">
            <span className="block text-[13px] leading-4 font-medium text-text-primary">
              {session.user.fullName}
            </span>
            <span className="block text-[11px] leading-4 text-text-tertiary">
              {session.roleLabel}
            </span>
          </span>
          <Avatar
            initials={session.user.initials}
            name={session.user.fullName}
            imageUrl={session.user.avatarUrl}
            size="md"
          />
        </>
      }
    >
      <div className="px-2.5 py-2">
        <p className="truncate text-[13px] font-medium text-text-primary">
          {session.user.fullName}
        </p>
        <p className="truncate text-[11.5px] text-text-tertiary">{session.user.email}</p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          <Badge tone="brand">{session.roleLabel}</Badge>
        </div>
      </div>

      <DropdownSeparator />

      {multiSite && (
        <>
          <DropdownLabel>Officine active</DropdownLabel>
          {session.availablePharmacies.map((pharmacy) => (
            <form key={pharmacy.id} action={switchPharmacyAction}>
              <input type="hidden" name="pharmacyId" value={pharmacy.id} />
              <button
                type="submit"
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] text-text-primary transition-colors hover:bg-surface-sunken"
              >
                <Store className="size-4 shrink-0 text-text-tertiary" />
                <span className="min-w-0 flex-1 truncate">
                  {pharmacy.name}
                  {pharmacy.city && (
                    <span className="text-text-tertiary"> · {pharmacy.city}</span>
                  )}
                </span>
                {pharmacy.id === session.pharmacy.id && (
                  <span className="size-1.5 shrink-0 rounded-full bg-brand-500" />
                )}
              </button>
            </form>
          ))}
          <DropdownSeparator />
        </>
      )}

      <Link href="/mon-compte" className="block">
        <DropdownLink icon={<Settings className="size-4" />}>Mon compte</DropdownLink>
      </Link>

      <DropdownSeparator />

      <form action={logoutAction}>
        <button
          type="submit"
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] text-danger-600 transition-colors hover:bg-danger-50 dark:hover:bg-danger-700/15"
        >
          <LogOut className="size-4 shrink-0" />
          Se déconnecter
        </button>
      </form>
    </Dropdown>
  );
}
