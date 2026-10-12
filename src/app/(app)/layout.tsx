import type { ReactNode } from "react";
import { requireSession } from "@/server/auth/session";
import { patientDataEnabled } from "@/config/env";
import { countUnreadNotifications } from "@/server/services/notifications";
import { countPharmacyUnread } from "@/server/services/support";
import { Sidebar } from "@/components/app/sidebar";
import { Topbar } from "@/components/app/topbar";
import { MobileNavProvider } from "@/components/app/mobile-nav";
import { AppRobotCompanion } from "@/components/robot/app-companion";
import { CounterLookProvider } from "@/components/robot/counter-look-context";
import { RobotAlertsProvider } from "@/components/robot/robot-alerts";
import { myComptoirRobot } from "@/server/services/comptoirs";
import { AppIsland } from "@/components/island/app-island";
import { IslandSlotProvider } from "@/components/island/platform-island";
import { viewersOf } from "@/server/services/pharmacy-assistant/viewer";
import { pharmacySuggestions } from "@/core/pharmacy-assistant/assistant";
import { PERMISSIONS } from "@/server/rbac/permissions";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  const [unread, supportUnread, counterLook] = await Promise.all([
    countUnreadNotifications(session.scope),
    countPharmacyUnread(session.pharmacy.id),
    // Le robot du comptoir de cette personne : le même partout dans le logiciel.
    myComptoirRobot(session.scope).catch(() => null),
  ]);

  return (
    <CounterLookProvider value={counterLook}>
    {/* Ce que le robot signale (menu et coin de l'écran), par personne et par officine. */}
    <RobotAlertsProvider viewerKey={`${session.scope.userId}:${session.scope.pharmacyId}`}>
    <IslandSlotProvider>
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
            hiddenHrefs={patientDataEnabled() ? [] : ["/patients", "/suivis"]}
            pharmacyName={session.pharmacy.name}
            supportUnread={supportUnread}
          />
        </div>

        <div className="lg:pl-[256px] print:pl-0">
          <div className="no-print">
            {/* L'île PharmaBoost au milieu de la bannière : le robot du comptoir de la personne, ce qu'il signale, la discussion. */}
            <Topbar
              session={session}
              unreadNotifications={unread}
              island={<AppIsland suggestions={pharmacySuggestions(viewersOf(session).viewer)} canImportStock={session.permissions.has(PERMISSIONS.PRODUCT_IMPORT)} />}
            />
          </div>

          <main
            id="contenu"
            className="mx-auto max-w-[1400px] px-4 py-6 lg:px-10 lg:py-10 print:max-w-none print:p-0"
          >
            {children}
          </main>
        </div>

        {/* Le robot compagnon, en bas à droite (hors « Nouvelle vente » et l'écran de vente, où il est déjà). */}
        <AppRobotCompanion />
      </div>
    </MobileNavProvider>
    </IslandSlotProvider>
    </RobotAlertsProvider>
    </CounterLookProvider>
  );
}
