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
import { personRobot } from "@/core/robot/counter-look";
import { AppIsland } from "@/components/island/app-island";
import { IslandSlotProvider } from "@/components/island/platform-island";
import { viewersOf } from "@/server/services/pharmacy-assistant/viewer";
import { pharmacySuggestions } from "@/core/pharmacy-assistant/assistant";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { NOT_LINKED, thisPcComptoir } from "@/server/services/post-link";
import { RobotPresenceProvider } from "@/components/robot/robot-presence";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  const [unread, supportUnread, thisPc] = await Promise.all([
    countUnreadNotifications(session.scope),
    countPharmacyUnread(session.pharmacy.id),
    // 1 robot pour 1 espace : sur le navigateur lié à un poste de CETTE pharmacie (le lien ouvert par le logiciel
    // PharmaBoost installé), le poste revient à la personne connectée, sans clic ; et si le logiciel y dessine déjà le
    // robot, l'espace n'en dessine aucun — mais garde tout ce que le robot porte (alertes, gestes, discussion), dans
    // l'île sans robot. Ailleurs (PC du bureau, Mac, téléphone) : rien ne change.
    thisPcComptoir(session.scope.pharmacyId, session.scope.userId, session.permissions.has(PERMISSIONS.PRESCRIPTION_CREATE)).catch(() => NOT_LINKED),
  ]);
  // Le robot de la personne connectée : le même partout dans le logiciel, et dans l'île du comptoir où elle est.
  const counterLook = personRobot(session.scope.userId);
  const robotOnPost = thisPc.robotOnPost;

  return (
    <RobotPresenceProvider inBrowser={!robotOnPost}>
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
            {/* L'île PharmaBoost au milieu de la bannière : le robot de la personne, ce qu'il signale, la discussion.
                Partout, même sur le PC où le logiciel installé a son robot : elle y perd seulement le dessin du robot. */}
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

        {/* Le robot compagnon, en bas à droite (hors « Nouvelle vente » et l'écran de vente, où il est déjà ; nulle part
            sur le PC où le logiciel installé a le sien : ses alertes s'y lisent dans l'île, sa phrase du moment sur
            « Nouvelle vente »). */}
        {!robotOnPost && <AppRobotCompanion />}
      </div>
    </MobileNavProvider>
    </IslandSlotProvider>
    </RobotAlertsProvider>
    </CounterLookProvider>
    </RobotPresenceProvider>
  );
}
