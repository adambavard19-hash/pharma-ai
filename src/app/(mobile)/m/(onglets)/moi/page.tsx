import type { Metadata } from "next";
import { LogOut, Store } from "lucide-react";
import { requireUser } from "@/server/auth/user-session";
import { consentHistory, currentConsents } from "@/server/services/mobile/consents";
import { mobileLogoutAction } from "@/server/actions/mobile-auth";
import { PROFESSION_LABELS } from "@/core/mobile/profile";
import { ListRow, MCard, Pill, ScreenTitle } from "../../_components/ui";
import { ProfileForm } from "./_components/profile-form";
import { ConsentsPanel } from "./_components/consents-panel";
import { PersonalSections } from "./_components/personal-sections";
import { PasswordPanel } from "./_components/password-panel";
import { DeleteAccountPanel } from "./_components/delete-account-panel";

export const metadata: Metadata = { title: "Mon espace" };

export default async function MyspacePage() {
  const session = await requireUser();
  const [consents, history] = await Promise.all([currentConsents(session.user.id), consentHistory(session.user.id)]);
  const several = session.memberships.length > 1;

  return (
    <div className="space-y-6">
      <ScreenTitle title="Mon espace" />

      {/* Qui je suis */}
      <MCard className="flex items-center gap-4">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-[22px] font-bold text-white shadow-md">{session.user.initials || "?"}</span>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate text-[18px] font-bold tracking-[-0.02em] text-ink-900">{session.user.fullName}</p>
          <p className="truncate text-[13.5px] text-text-secondary">{session.user.email}</p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {session.roleLabel && <Pill>{session.roleLabel}</Pill>}
            {session.user.profession && <Pill tone="neutral">{PROFESSION_LABELS[session.user.profession]}</Pill>}
            {!session.isClientStaff && <Pill tone="success">Compte gratuit</Pill>}
          </div>
        </div>
      </MCard>

      {/* Mon officine */}
      <section className="space-y-2.5">
        <h2 className="px-1 text-[13px] font-semibold tracking-wide text-ink-500 uppercase">Mon officine</h2>
        <div className="overflow-hidden rounded-[20px] bg-white shadow-[0_6px_28px_-8px_oklch(0.45_0.07_183/0.18)]">
          {session.activePharmacy ? (
            <ListRow
              href="/m/officine"
              icon={<Store className="size-[18px]" aria-hidden="true" />}
              label={session.activePharmacy.name}
              value={several ? `${session.memberships.length} officines` : session.roleLabel ?? undefined}
            />
          ) : (
            <div className="space-y-1 px-4 py-4">
              <p className="text-[15px] font-semibold text-ink-900">{session.user.declaredPharmacyName || "Aucune officine rattachée"}</p>
              <p className="text-[13px] leading-5 text-text-secondary">Votre officine utilise PharmaBoost ? Demandez à votre titulaire de vous inviter depuis l&apos;écran Équipe : votre compte rejoindra son officine, avec tout ce que vous avez déjà fait ici.</p>
            </div>
          )}
        </div>
      </section>

      {/* Mes résultats, mes primes, mes objectifs, le coach (équipes clientes) */}
      {session.scope && <PersonalSections scope={session.scope} />}

      <section className="space-y-2.5">
        <h2 className="px-1 text-[13px] font-semibold tracking-wide text-ink-500 uppercase">Mon profil</h2>
        <MCard>
          <ProfileForm
            isClientStaff={session.isClientStaff}
            defaults={{
              firstName: session.user.firstName,
              lastName: session.user.lastName,
              profession: session.user.profession,
              rpps: session.user.rppsDeclared ?? "",
              pharmacyName: session.user.declaredPharmacyName ?? "",
            }}
          />
        </MCard>
      </section>

      <section className="space-y-2.5">
        <h2 className="px-1 text-[13px] font-semibold tracking-wide text-ink-500 uppercase">Mes accords</h2>
        <ConsentsPanel
          initial={{ PHARMABOOST_NEWS: consents.PHARMABOOST_NEWS.granted, PARTNER_COMMUNICATIONS: consents.PARTNER_COMMUNICATIONS.granted }}
          history={history.map((entry) => ({ id: entry.id, kind: entry.kind, granted: entry.granted, at: entry.at.toISOString(), source: entry.source }))}
        />
      </section>

      <section className="space-y-2.5">
        <h2 className="px-1 text-[13px] font-semibold tracking-wide text-ink-500 uppercase">Sécurité</h2>
        <PasswordPanel />
      </section>

      <section className="space-y-2.5">
        <div className="overflow-hidden rounded-[20px] bg-white shadow-[0_6px_28px_-8px_oklch(0.45_0.07_183/0.18)] divide-y divide-ink-100">
          <form action={mobileLogoutAction}>
            <button type="submit" className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left transition-colors active:bg-ink-50">
              <span className="flex size-9 items-center justify-center rounded-xl bg-ink-100 text-ink-700"><LogOut className="size-[18px]" aria-hidden="true" /></span>
              <span className="flex-1 text-[15px] font-medium text-ink-900">Se déconnecter</span>
            </button>
          </form>
          <DeleteAccountPanel />
        </div>
      </section>
    </div>
  );
}
