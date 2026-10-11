import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserSession } from "@/server/auth/user-session";
import { AuthFrame } from "../../_components/auth-frame";
import { MobileLoginForm } from "./login-form";

export const metadata: Metadata = { title: "Connexion" };

export default async function MobileLoginPage({ searchParams }: { searchParams: Promise<{ defini?: string }> }) {
  const [session, { defini }] = await Promise.all([getUserSession(), searchParams]);
  if (session) redirect(session.user.mobileOnboardedAt ? "/m" : "/m/bienvenue");

  return (
    <AuthFrame
      title="Votre officine, dans votre poche."
      subtitle="Formations courtes, nouveautés des laboratoires et challenges d'équipe."
      footer={
        <p className="text-center text-[12px] leading-5 text-text-tertiary">
          Un seul compte pour l&apos;application et le comptoir PharmaBoost.{" "}
          <Link href="/decouvrir/confidentialite" className="underline underline-offset-2">Confidentialité</Link>
        </p>
      }
    >
      {defini === "1" && (
        <p className="rounded-2xl border border-success-200 bg-success-50 px-4 py-3 text-[13.5px] font-medium text-success-800">
          Mot de passe enregistré. Connectez-vous avec votre adresse e-mail et ce nouveau mot de passe.
        </p>
      )}
      <div className="space-y-1">
        <h2 className="text-[22px] font-bold tracking-[-0.025em] text-ink-950">Connexion</h2>
        <p className="text-[14px] text-text-secondary">Pharmacien, préparateur, titulaire ou étudiant : bienvenue.</p>
      </div>
      <MobileLoginForm />
      <div className="rounded-2xl border border-brand-100 bg-white p-4 text-center">
        <p className="text-[14px] text-ink-700">Pas encore de compte ?</p>
        <Link href="/m/inscription" className="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-[14px] border border-brand-200 bg-brand-50 px-4 text-[15px] font-semibold text-brand-800 transition-transform active:scale-[0.985]">
          Créer un compte gratuit
        </Link>
      </div>
    </AuthFrame>
  );
}
