import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserSession } from "@/server/auth/user-session";
import { AuthFrame } from "../../_components/auth-frame";
import { MobileSignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Créer un compte" };

export default async function MobileSignupPage() {
  if (await getUserSession()) redirect("/m");
  return (
    <AuthFrame
      title="Un compte gratuit, pour progresser."
      subtitle="Réservé aux professionnels de l'officine et aux étudiants en pharmacie."
      footer={
        <p className="text-center text-[13.5px] text-ink-700">
          Déjà un compte ?{" "}
          <Link href="/m/connexion" className="inline-flex min-h-11 items-center font-semibold text-brand-800 underline underline-offset-2">
            Se connecter
          </Link>
        </p>
      }
    >
      <div className="space-y-1">
        <h2 className="text-[22px] font-bold tracking-[-0.025em] text-ink-950">Créer mon compte</h2>
        <p className="text-[14px] text-text-secondary">Deux minutes, et c&apos;est gratuit. Votre officine utilise déjà PharmaBoost ? Votre titulaire peut aussi vous inviter.</p>
      </div>
      <MobileSignupForm />
    </AuthFrame>
  );
}
