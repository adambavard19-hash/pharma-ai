import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/user-session";
import { BottomTabBar, SideRail } from "../_components/tab-nav";
import { TopBar } from "../_components/top-bar";

/**
 * Les écrans à onglets : une session est exigée (compte gratuit ou équipe cliente), et le parcours « Bienvenue »
 * doit avoir été fait une fois. Colonne de contenu centrée ; barre d'onglets en bas au téléphone, rail à gauche à
 * partir de 1024 px.
 */
export default async function MobileTabsLayout({ children }: { children: ReactNode }) {
  const session = await requireUser();
  if (!session.user.mobileOnboardedAt) redirect("/m/bienvenue");

  return (
    <div className="min-h-dvh bg-[radial-gradient(120%_60%_at_50%_-10%,oklch(0.95_0.03_185)_0%,transparent_60%)] lg:pl-[104px]">
      <SideRail />
      <TopBar session={session} />
      <main id="contenu" className="m-tabbar-space mx-auto max-w-2xl px-4 pt-4 lg:max-w-3xl lg:px-8 lg:pt-8">
        {children}
      </main>
      <BottomTabBar />
    </div>
  );
}
