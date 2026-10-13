import type { Metadata } from "next";
import Link from "next/link";
import { AUTH_LINK } from "@/components/app/helix/helix-auth-layout";
import { SalesAuthShell } from "../sales-auth-shell";
import { RequestSalesLinkForm } from "./form";

export const metadata: Metadata = { title: { absolute: "Mot de passe oublié — PharmaBoost" } };

export default function SalesForgotPage() {
  return (
    <SalesAuthShell title="Recevoir un lien de connexion" intro="Un lien pour définir votre mot de passe sera envoyé à l'adresse de votre compte.">
      <RequestSalesLinkForm />
      <p className="text-center text-[13px]"><Link href="/extranet/connexion" className={AUTH_LINK}>Retour à la connexion</Link></p>
    </SalesAuthShell>
  );
}
