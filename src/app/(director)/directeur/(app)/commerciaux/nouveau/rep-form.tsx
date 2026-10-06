"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, UserPlus } from "lucide-react";
import { createRepAction } from "@/server/actions/director-reps";
import { commissionInputFromStored, parseCommissionInput, type CommissionTypeKey } from "@/core/sales/director/team";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { CommissionFields } from "../_components/commission-fields";

type Created = { salesRepId: string; name: string; invitation: { status: string; detail: string } | null };

/**
 * « Ajouter un commercial ». Le compte est créé (il apparaît aussitôt dans la
 * console), et l'invitation lui est envoyée par e-mail si la case est cochée.
 * Le résultat reste affiché à la place du formulaire : l'issue de l'envoi est
 * dite telle quelle, jamais passée sous silence.
 */
export function RepForm({ defaultCommissionCents }: { defaultCommissionCents: number }) {
  const [values, setValues] = useState({ firstName: "", lastName: "", email: "", phone: "", zone: "" });
  const [commissionType, setCommissionType] = useState<CommissionTypeKey>("FIXED");
  const [commissionValue, setCommissionValue] = useState(commissionInputFromStored(defaultCommissionCents));
  const [invite, setInvite] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [pending, startTransition] = useTransition();

  const set = (key: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement>) => setValues((current) => ({ ...current, [key]: event.target.value }));

  const reset = () => {
    setValues({ firstName: "", lastName: "", email: "", phone: "", zone: "" });
    setCommissionType("FIXED");
    setCommissionValue(commissionInputFromStored(defaultCommissionCents));
    setInvite(true);
    setErrors({});
    setError(null);
    setCreated(null);
  };

  const submit = () => {
    setError(null);
    const stored = parseCommissionInput(commissionType, commissionValue);
    if (stored === null) {
      setErrors({ commissionValue: "Indiquez un montant valide, par exemple 250 ou 12,5." });
      return;
    }
    setErrors({});
    startTransition(async () => {
      const result = await createRepAction({ ...values, commissionType, commissionValue: stored, invite });
      if (!result.ok) {
        setError(result.error);
        setErrors(result.fieldErrors ?? {});
        return;
      }
      setCreated(result.data);
    });
  };

  if (created) {
    const sent = created.invitation?.status === "SENT";
    return (
      <div className="space-y-4" role="status">
        <Alert tone={created.invitation === null || sent ? "success" : "warning"} icon={<CheckCircle2 className="size-[18px]" aria-hidden="true" />} title={`${created.name} est ajouté(e) à l'équipe.`}>
          {created.invitation === null ? "Aucune invitation n'a été envoyée. Vous pourrez l'envoyer depuis sa fiche." : sent ? "L'invitation est partie : il pourra choisir son mot de passe depuis l'e-mail reçu." : `L'invitation n'est PAS partie : ${created.invitation.detail}. Renvoyez-la depuis sa fiche.`}
        </Alert>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href={`/directeur/commerciaux/${created.salesRepId}`}>Voir sa fiche</Link>
          </Button>
          <Button type="button" variant="outline" onClick={reset}>
            Ajouter un autre commercial
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="space-y-6"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {error && <Alert tone="danger">{error}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Prénom" htmlFor="rep-first" required error={errors.firstName}>
          <Input id="rep-first" autoComplete="off" value={values.firstName} onChange={set("firstName")} />
        </Field>
        <Field label="Nom" htmlFor="rep-last" required error={errors.lastName}>
          <Input id="rep-last" autoComplete="off" value={values.lastName} onChange={set("lastName")} />
        </Field>
        <Field label="Adresse e-mail" htmlFor="rep-email" required hint="C'est son identifiant de connexion. L'invitation y est envoyée." error={errors.email}>
          <Input id="rep-email" type="email" autoComplete="off" value={values.email} onChange={set("email")} />
        </Field>
        <Field label="Téléphone" htmlFor="rep-phone" error={errors.phone}>
          <Input id="rep-phone" inputMode="tel" autoComplete="off" value={values.phone} onChange={set("phone")} />
        </Field>
        <Field label="Zone" htmlFor="rep-zone" hint="Département, région, secteur ou ville." error={errors.zone} className="sm:col-span-2">
          <Input id="rep-zone" value={values.zone} onChange={set("zone")} placeholder="Rhône, Lyon centre…" />
        </Field>
      </div>

      <CommissionFields idPrefix="rep" type={commissionType} value={commissionValue} onType={setCommissionType} onValue={setCommissionValue} error={errors.commissionValue} />

      <Checkbox id="rep-invite" checked={invite} onChange={(event) => setInvite(event.target.checked)} label="Envoyer l'invitation maintenant" description="Il reçoit un e-mail avec un lien personnel pour choisir son mot de passe." />

      <div className="flex flex-wrap justify-end gap-2">
        <Button asChild variant="ghost">
          <Link href="/directeur/commerciaux">Annuler</Link>
        </Button>
        <Button type="submit" loading={pending} leadingIcon={<UserPlus className="size-4" />}>
          {invite ? "Ajouter et inviter" : "Ajouter le commercial"}
        </Button>
      </div>
    </form>
  );
}
