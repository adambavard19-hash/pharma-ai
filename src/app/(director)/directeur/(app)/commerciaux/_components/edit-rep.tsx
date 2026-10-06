"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { updateRepAction } from "@/server/actions/director-reps";
import { commissionInputFromStored, parseCommissionInput, type CommissionTypeKey } from "@/core/sales/director/team";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { CommissionFields } from "./commission-fields";

export type EditRepInitial = { firstName: string; lastName: string; email: string; phone: string; zone: string; commissionType: CommissionTypeKey; commissionValue: number };

/**
 * « Modifier » : prénom, nom, téléphone, zone et commission. L'e-mail est
 * l'identifiant de connexion : il s'affiche, il ne se change pas ici. Une
 * nouvelle commission ne vaut que pour les prochains contrats.
 */
export function EditRepButton({ salesRepId, initial }: { salesRepId: string; initial: EditRepInitial }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({ firstName: initial.firstName, lastName: initial.lastName, phone: initial.phone, zone: initial.zone, commissionType: initial.commissionType, commissionValue: commissionInputFromStored(initial.commissionValue) });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { push } = useToast();

  const set = (key: "firstName" | "lastName" | "phone" | "zone") => (event: React.ChangeEvent<HTMLInputElement>) => setValues((current) => ({ ...current, [key]: event.target.value }));

  const close = () => {
    if (pending) return;
    setOpen(false);
    setError(null);
    setErrors({});
  };

  const submit = () => {
    setError(null);
    const stored = parseCommissionInput(values.commissionType, values.commissionValue);
    if (stored === null) {
      setErrors({ commissionValue: "Indiquez un montant valide, par exemple 250 ou 12,5." });
      return;
    }
    setErrors({});
    startTransition(async () => {
      const result = await updateRepAction({ salesRepId, firstName: values.firstName, lastName: values.lastName, phone: values.phone, zone: values.zone, commissionType: values.commissionType, commissionValue: stored });
      if (!result.ok) {
        setError(result.error);
        setErrors(result.fieldErrors ?? {});
        return;
      }
      push({ tone: "success", title: result.message ?? "Enregistré." });
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <Button type="button" variant="outline" leadingIcon={<Pencil className="size-4" />} onClick={() => setOpen(true)}>
        Modifier
      </Button>
      <Modal
        open={open}
        onClose={close}
        title="Modifier le commercial"
        description={`Son adresse e-mail (${initial.email}) est son identifiant : elle ne change pas ici.`}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={pending}>
              Annuler
            </Button>
            <Button onClick={submit} loading={pending}>
              Enregistrer
            </Button>
          </>
        }
      >
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          {error && <Alert tone="danger">{error}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Prénom" htmlFor="edit-first" required error={errors.firstName}>
              <Input id="edit-first" value={values.firstName} onChange={set("firstName")} />
            </Field>
            <Field label="Nom" htmlFor="edit-last" required error={errors.lastName}>
              <Input id="edit-last" value={values.lastName} onChange={set("lastName")} />
            </Field>
            <Field label="Téléphone" htmlFor="edit-phone" error={errors.phone}>
              <Input id="edit-phone" inputMode="tel" value={values.phone} onChange={set("phone")} />
            </Field>
            <Field label="Zone" htmlFor="edit-zone" hint="Département, région, secteur ou ville." error={errors.zone}>
              <Input id="edit-zone" value={values.zone} onChange={set("zone")} placeholder="Rhône, Lyon centre…" />
            </Field>
          </div>
          <CommissionFields idPrefix="edit" type={values.commissionType} value={values.commissionValue} onType={(commissionType) => setValues((current) => ({ ...current, commissionType }))} onValue={(commissionValue) => setValues((current) => ({ ...current, commissionValue }))} error={errors.commissionValue} />
          <p className="text-[12.5px] text-text-tertiary">Cette règle vaut pour les prochains contrats. Une commission prévisionnelle est recalculée à la signature du contrat, avec la règle du moment ; celles déjà acquises gardent leur montant.</p>
          <button type="submit" className="sr-only" tabIndex={-1}>
            Enregistrer
          </button>
        </form>
      </Modal>
    </>
  );
}
