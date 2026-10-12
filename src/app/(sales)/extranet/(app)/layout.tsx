import type { ReactNode } from "react";
import Link from "next/link";
import { requireSalesSession } from "@/server/auth/sales-session";
import { countUnreadSalesNotifications } from "@/server/services/sales/notifications";
import { salesLogoutAction } from "@/server/actions/extranet";
import { Button } from "@/components/ui/button";
import { SalesNav } from "./sales-nav";
import { PlatformIsland } from "@/components/island/platform-island";

/**
 * L'extranet commercial : une coque légère, pensée pour le téléphone.
 * Navigation en haut sur grand écran, en bas du pouce sur mobile.
 * À l'impression, la coque disparaît : seule la page imprimée part (la plaquette, en A4).
 */
export default async function SalesLayout({ children }: { children: ReactNode }) {
  const session = await requireSalesSession();
  const unread = await countUnreadSalesNotifications(session.rep.id);
  return (
    <div className="min-h-dvh bg-surface-app pb-20 sm:pb-0 print:min-h-0 print:bg-white print:pb-0">
      <header className="sticky top-0 z-30 border-b border-border-subtle bg-surface-card/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/extranet" className="rounded-lg">
            <span className="block text-[14px] leading-4 font-semibold text-text-primary">PharmaBoost</span><span className="block text-[11.5px] text-text-tertiary">Extranet commercial</span>
          </Link>
          {/* L'île PharmaBoost : les tâches du jour, les démos à venir, les commissions du commercial. */}
          <PlatformIsland label="L'île du commercial" homeEndpoint="/api/ile/extranet" />
          <div className="flex items-center gap-2">
            <span className="hidden text-[13px] text-text-secondary sm:block">{session.rep.fullName}</span>
            <form action={salesLogoutAction}><Button type="submit" variant="ghost" size="sm">Déconnexion</Button></form>
          </div>
        </div>
        <div className="mx-auto hidden max-w-[1100px] px-4 sm:block sm:px-6"><SalesNav unread={unread} /></div>
      </header>
      <main className="mx-auto max-w-[1100px] space-y-6 px-4 py-5 sm:px-6 sm:py-8 print:max-w-none print:space-y-0 print:p-0">{children}</main>
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border-subtle bg-surface-card/95 backdrop-blur sm:hidden print:hidden"><SalesNav unread={unread} mobile /></div>
    </div>
  );
}
