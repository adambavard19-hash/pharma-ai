import type { Metadata } from "next";
import Link from "next/link";
import { AUTH_LINK } from "@/components/app/helix/helix-auth-layout";
import { AdminAuthShell } from "../admin-auth-shell";
import { RequestLinkForm } from "./form";

export const metadata: Metadata = { title: "Mot de passe oublié — PharmaBoost" };

export default function ForgotPasswordPage() {
  return (
    <AdminAuthShell
      title="Recevoir un lien de connexion"
      intro="Un lien pour définir un nouveau mot de passe sera envoyé à l'adresse du compte."
    >
      <RequestLinkForm />
      <p className="text-center text-[13px]">
        <Link href="/admin-connexion" className={AUTH_LINK}>
          Retour à la connexion
        </Link>
      </p>
    </AdminAuthShell>
  );
}
