import Link from "next/link";
import { ChevronDown, Store } from "lucide-react";
import type { UserSessionContext } from "@/server/auth/user-session";
import { Robot } from "@/components/robot";
import { Wordmark } from "./ui";

/**
 * La barre du haut : la marque à gauche ; à droite, l'officine active (équipes clientes — un toucher ouvre le choix
 * de l'officine) et les initiales qui mènent à « Mon espace ». Translucide, collée en haut, sous l'encoche.
 */
export function TopBar({ session }: { session: UserSessionContext }) {
  const pharmacy = session.activePharmacy;
  const several = session.memberships.length > 1;
  return (
    <header className="m-safe-top sticky top-0 z-30 border-b border-ink-200/60 bg-[#f6fafa]/85 backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-4 lg:max-w-3xl lg:px-8">
        <Link href="/m" className="flex items-center gap-2 lg:hidden" aria-label="PharmaBoost — accueil">
          {/* Le robot vivant, présent sur chaque onglet : c'est lui qui fête un quiz réussi ou un badge (emitRobotMood). */}
          <Robot size={30} listen sound="mobile" />
          {/* Au téléphone, l'officine passe avant le nom de la marque : le robot suffit à la reconnaître. */}
          <Wordmark className={pharmacy ? "hidden min-[440px]:inline" : undefined} />
        </Link>
        <div className="flex-1" />
        {pharmacy && (
          // La zone touchable fait 44 px de haut ; la pastille visible, 36.
          <Link href="/m/officine" className="group flex h-11 min-w-0 max-w-[70vw] items-center sm:max-w-xs" aria-label={`Officine active : ${pharmacy.name}${several ? " — changer d'officine" : ""}`}>
            <span className="flex h-9 min-w-0 items-center gap-1.5 rounded-full border border-brand-200/80 bg-white px-3 text-[12.5px] font-semibold text-brand-800 shadow-xs transition-transform group-active:scale-95">
              <Store className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{pharmacy.name}</span>
              {several && <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />}
            </span>
          </Link>
        )}
        <Link href="/m/moi" className="group -mr-1 flex size-11 shrink-0 items-center justify-center" aria-label="Mon espace">
          <span className="flex size-9 items-center justify-center rounded-full bg-brand-gradient text-[12.5px] font-bold text-white shadow-sm transition-transform group-active:scale-95">
            {session.user.initials || "?"}
          </span>
        </Link>
      </div>
    </header>
  );
}
