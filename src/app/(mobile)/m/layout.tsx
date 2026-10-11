import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { NativeLinkGuard, NativePushListener, NativeStatusBar } from "./_components/native-app";

/**
 * PharmaBoost Mobile — la racine de /m.
 *
 * Une application à part entière, posée sur le même serveur et le même système de comptes que le comptoir, mais qui
 * n'importe AUCUN élément de mise en page du comptoir (barre latérale, en-tête) : une modification ici ne peut pas
 * casser le comptoir, et inversement.
 *
 * `viewportFit: "cover"` laisse l'application occuper tout l'écran de l'iPhone (sous l'encoche) ; les zones sûres
 * sont rendues par les classes `m-safe-*` (globals.css). Le manifeste (src/app/manifest.ts) en fait une application
 * installable sur l'écran d'accueil.
 */
export const metadata: Metadata = {
  title: { default: "PharmaBoost Mobile", template: "%s · PharmaBoost" },
  description: "Formations, nouveautés des laboratoires et challenges de l'officine, dans votre poche.",
  applicationName: "PharmaBoost Mobile",
  appleWebApp: { capable: true, title: "PharmaBoost", statusBarStyle: "default" },
  icons: { apple: [{ url: "/mobile/apple-touch-icon.png", sizes: "180x180" }] },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Une seule couleur : le mode sombre n'est pas branché, la barre d'état du téléphone suit le fond de l'application.
  themeColor: "#f6fafa",
};

export default function MobileRootLayout({ children }: { children: ReactNode }) {
  return (
    <div className="m-root min-h-dvh bg-[#f6fafa] text-text-primary">
      <NativeLinkGuard />
      <NativeStatusBar />
      <NativePushListener />
      {children}
    </div>
  );
}
