import type { ReactNode } from "react";
import { requireSession } from "@/server/auth/session";
import { countUnreadNotifications } from "@/server/services/notifications";
import { getProviderSnapshot } from "@/server/ai/registry";
import { Sidebar } from "@/components/app/sidebar";
import { Topbar } from "@/components/app/topbar";
import { DemoBanner } from "@/components/app/demo-banner";
import { MobileNavProvider } from "@/components/app/mobile-nav";
import { PERMISSIONS } from "@/server/rbac/permissions";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  const [unread, providers] = await Promise.all([
    countUnreadNotifications(session.scope),
    Promise.resolve(getProviderSnapshot()),
  ]);

  return (
    <MobileNavProvider>
      <div className="min-h-dvh bg-surface-app">
        <a href="#contenu" className="skip-link">
          Aller au contenu principal
        </a>

        <Sidebar
          permissions={[...session.permissions]}
          pharmacyName={session.pharmacy.name}
          canCreatePrescription={session.permissions.has(PERMISSIONS.PRESCRIPTION_CREATE)}
        />

        <div className="lg:pl-[248px]">
          {session.pharmacy.isDemo && (
            <DemoBanner providersSimulated={providers.anySimulated} />
          )}
          <Topbar session={session} unreadNotifications={unread} />

          <main id="contenu" className="mx-auto max-w-[1400px] px-4 py-6 lg:px-8 lg:py-8">
            {children}
          </main>
        </div>
      </div>
    </MobileNavProvider>
  );
}
