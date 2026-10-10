"use client";

import { useState, useTransition } from "react";
import { UserCheck } from "lucide-react";
import { acceptInvitationAction } from "@/server/actions/team-access";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";

export function AcceptInvitationForm({ token, existingAccount, firstName, lastName }: { token: string; existingAccount: boolean; firstName: string; lastName: string }) {
  const [form, setForm] = useState({ firstName, lastName, password: "", confirm: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!existingAccount && form.password !== form.confirm) return setError("Les deux mots de passe ne sont pas identiques.");
    start(async () => {
      // En cas de succès, l'action connecte la personne et la renvoie dans l'application : rien à faire ici.
      const result = await acceptInvitationAction(token, { firstName: form.firstName, lastName: form.lastName, password: form.password });
      if (result && !result.ok) setError(result.error);
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}
      {existingAccount ? (
        <>
          <p className="text-[13.5px] leading-5 text-text-secondary">Vous avez déjà un compte PharmaBoost : saisissez votre mot de passe pour ajouter cette officine.</p>
          <Field label="Votre mot de passe" htmlFor="password" required>
            <Input id="password" type="password" required autoComplete="current-password" autoFocus value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
          </Field>
        </>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Prénom" htmlFor="firstName" required>
              <Input id="firstName" required autoComplete="given-name" value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} />
            </Field>
            <Field label="Nom" htmlFor="lastName" required>
              <Input id="lastName" required autoComplete="family-name" value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} />
            </Field>
          </div>
          <Field label="Choisissez votre mot de passe" htmlFor="password" required hint="12 caractères au minimum, avec une majuscule et un chiffre.">
            <Input id="password" type="password" required minLength={12} autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
          </Field>
          <Field label="Confirmez-le" htmlFor="confirm" required>
            <Input id="confirm" type="password" required minLength={12} autoComplete="new-password" value={form.confirm} onChange={(event) => setForm({ ...form, confirm: event.target.value })} />
          </Field>
        </>
      )}
      <Button type="submit" size="lg" className="w-full" loading={pending} leadingIcon={pending ? undefined : <UserCheck className="size-[18px]" />}>
        Créer mon compte et entrer
      </Button>
    </form>
  );
}
