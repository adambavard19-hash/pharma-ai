import type { ReactNode } from "react";
import { requireSession } from "@/server/auth/session";
import { countUnreadNotifications } from "@/server/services/notifications";
import { Sidebar } from "@/components/app/sidebar";
import { Topbar } from "@/components/app/topbar";
import { MobileNavProvider } from "@/components/app/mobile-nav";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  const unread = await countUnreadNotifications(session.scope);

  return (
    <MobileNavProvider>
      <div className="min-h-dvh bg-surface-app">
        <a href="#contenu" className="skip-link">
          Aller au contenu principal
        </a>

        {/* Le mobilier de l'application ne s'imprime pas : une impression
            déclenchée depuis un écran de l'app doit sortir une feuille A4
            propre — le plan du patient, rien d'autre. */}
        <div className="no-print">
          <Sidebar
            permissions={[...session.permissions]}
            pharmacyName={session.pharmacy.name}
          />
        </div>

        <div className="lg:pl-[248px] print:pl-0">
          <div className="no-print">
            <Topbar session={session} unreadNotifications={unread} />
          </div>

          <main
            id="contenu"
            className="mx-auto max-w-[1400px] px-4 py-6 lg:px-8 lg:py-8 print:max-w-none print:p-0"
          >
            {children}
          </main>
        </div>
      </div>
    </MobileNavProvider>
  );
}
