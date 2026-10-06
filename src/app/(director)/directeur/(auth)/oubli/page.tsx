import type { Metadata } from "next";
import Link from "next/link";
import { DirectorAuthShell } from "../auth-shell";
import { RequestDirectorLinkForm } from "./form";

export const metadata: Metadata = { title: { absolute: "Mot de passe oublié — PharmaBoost" } };

export default function DirectorForgotPage() {
  return (
    <DirectorAuthShell title="Recevoir un lien de connexion" intro="Un lien pour définir votre mot de passe sera envoyé à l'adresse de votre compte.">
      <RequestDirectorLinkForm />
      <p className="text-center text-[13px]"><Link href="/directeur/connexion" className="text-white/60 underline underline-offset-2 hover:text-white">Retour à la connexion</Link></p>
    </DirectorAuthShell>
  );
}
