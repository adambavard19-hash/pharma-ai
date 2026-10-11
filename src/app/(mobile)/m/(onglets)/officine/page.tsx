import type { Metadata } from "next";
import { Check, Store } from "lucide-react";
import { requireUser } from "@/server/auth/user-session";
import { mobileSwitchPharmacyAction } from "@/server/actions/mobile-auth";
import { cn } from "@/lib/utils";
import { Pill, QuietState, ScreenTitle } from "../../_components/ui";

export const metadata: Metadata = { title: "Mon officine" };

/**
 * Choisir l'officine active, pour qui travaille dans plusieurs officines d'un même groupe. Toutes les données
 * d'officine de l'application suivent ce choix (la portée de la session). La liste vient de la session — jamais d'un
 * paramètre — et l'action revérifie l'appartenance (`switchPharmacy`).
 */
export default async function PharmacyPickerPage() {
  const session = await requireUser();

  if (session.memberships.length === 0) {
    return (
      <div className="space-y-5">
        <ScreenTitle title="Mon officine" />
        <QuietState
          icon={<Store className="size-6" aria-hidden="true" />}
          title="Aucune officine rattachée"
          body="Votre compte est un compte gratuit. Quand votre titulaire vous invite dans l'équipe de son officine, elle apparaît ici."
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <ScreenTitle title="Mon officine" subtitle={session.memberships.length > 1 ? "Choisissez l'officine dans laquelle vous travaillez maintenant." : undefined} />
      <ul className="space-y-3">
        {session.memberships.map((membership) => {
          const active = membership.pharmacyId === session.activePharmacy?.id;
          return (
            <li key={membership.pharmacyId}>
              <form action={mobileSwitchPharmacyAction}>
                <input type="hidden" name="pharmacyId" value={membership.pharmacyId} />
                <button
                  type="submit"
                  disabled={active}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "flex min-h-[72px] w-full items-center gap-4 rounded-[20px] border bg-white px-4 py-3 text-left shadow-[0_6px_28px_-8px_oklch(0.45_0.07_183/0.18)] transition-transform active:scale-[0.985]",
                    active ? "border-brand-400 ring-4 ring-brand-500/10" : "border-white/70",
                  )}
                >
                  <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-2xl", active ? "bg-brand-gradient text-white" : "bg-brand-50 text-brand-700")}>
                    <Store className="size-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15.5px] font-semibold text-ink-900">{membership.pharmacyName}</span>
                    <span className="block text-[13px] text-text-tertiary">
                      {membership.roleLabel}
                      {membership.city ? ` · ${membership.city}` : ""}
                    </span>
                  </span>
                  {membership.isDemo && <Pill tone="neutral">Démo</Pill>}
                  {active && <Check className="size-5 shrink-0 text-brand-700" strokeWidth={2.6} aria-label="Officine active" />}
                </button>
              </form>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
