import type { Metadata } from "next";
import { requireSession } from "@/server/auth/session";
import { PageHeader, DataItem } from "@/components/ui/page";
import { Card, CardContent } from "@/components/ui/card";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Mon compte" };

/**
 * Les réglages qui appartiennent à la personne, pas à l'officine.
 *
 * Un collaborateur n'a rien à faire dans les paramètres de la pharmacie ; il a
 * en revanche besoin de changer son mot de passe sans demander à personne.
 */
export default async function AccountPage() {
  const session = await requireSession();

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader title="Mon compte" />

      <Card>
        <CardContent className="grid gap-x-6 gap-y-4 py-5 sm:grid-cols-2">
          <DataItem label="Nom">{session.user.fullName}</DataItem>
          <DataItem label="Rôle">{session.roleLabel}</DataItem>
          <DataItem label="Adresse e-mail">{session.user.email}</DataItem>
          <DataItem label="Officine">{session.pharmacy.name}</DataItem>
        </CardContent>
      </Card>

      <PasswordForm />
    </div>
  );
}
