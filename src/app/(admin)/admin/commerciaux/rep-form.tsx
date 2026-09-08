"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, UserPlus } from "lucide-react";
import { createSalesRepAction, updateSalesRepAction } from "@/server/actions/platform-sales";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";

export type RepFormValues = { firstName: string; lastName: string; email: string; phone: string; zone: string; commissionType: "FIXED" | "PERCENT" | "RECURRING"; commissionValue: string; isActive: boolean };

const EMPTY: RepFormValues = { firstName: "", lastName: "", email: "", phone: "", zone: "", commissionType: "FIXED", commissionValue: "300", isActive: true };

/** La valeur saisie en euros ou en pour cent, convertie pour le stockage (centimes / centièmes de %). */
function toStored(type: RepFormValues["commissionType"], value: string): number {
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function RepFields({ values, onChange }: { values: RepFormValues; onChange: (v: RepFormValues) => void }) {
  const set = (key: keyof RepFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange({ ...values, [key]: e.target.value });
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Prénom" htmlFor="r-first" required><Input id="r-first" value={values.firstName} onChange={set("firstName")} /></Field>
        <Field label="Nom" htmlFor="r-last" required><Input id="r-last" value={values.lastName} onChange={set("lastName")} /></Field>
        <Field label="E-mail" htmlFor="r-email" required hint="Son identifiant ; l'invitation y est envoyée."><Input id="r-email" type="email" value={values.email} onChange={set("email")} /></Field>
        <Field label="Téléphone" htmlFor="r-phone"><Input id="r-phone" value={values.phone} onChange={set("phone")} /></Field>
        <Field label="Zone" htmlFor="r-zone" hint="Département, région, secteur ou ville."><Input id="r-zone" value={values.zone} onChange={set("zone")} placeholder="Rhône, Lyon centre…" /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type de commission" htmlFor="r-type"><Select id="r-type" value={values.commissionType} onChange={set("commissionType")}><option value="FIXED">Fixe par contrat</option><option value="PERCENT">Pourcentage de la première année</option><option value="RECURRING">Récurrente mensuelle (12 mois)</option></Select></Field>
        <Field label={values.commissionType === "PERCENT" ? "Pourcentage" : "Montant (€)"} htmlFor="r-value" required><Input id="r-value" inputMode="decimal" value={values.commissionValue} onChange={set("commissionValue")} /></Field>
      </div>
      <Checkbox label="Compte actif" checked={values.isActive} onChange={(e) => onChange({ ...values, isActive: e.target.checked })} />
    </div>
  );
}

export function CreateSalesRepButton() {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(EMPTY);
  const [invite, setInvite] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { push } = useToast();
  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await createSalesRepAction({ ...values, commissionValue: toStored(values.commissionType, values.commissionValue), invite });
      if (!result.ok) return setError(result.error);
      push({ tone: result.data.invitation?.startsWith("Invitation NON") ? "warning" : "success", title: result.message ?? "Commercial créé" });
      setOpen(false);
      setValues(EMPTY);
      router.push(`/admin/commerciaux/${result.data.salesRepId}`);
    });
  };
  return (
    <>
      <Button onClick={() => setOpen(true)} leadingIcon={<Plus className="size-[18px]" />}>Nouveau commercial</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Nouveau commercial" description="Le compte est créé ; l'invitation lui envoie un lien pour définir son mot de passe." size="lg" footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button><Button onClick={submit} loading={pending} leadingIcon={<UserPlus className="size-4" />}>{invite ? "Créer et inviter" : "Créer"}</Button></>}>
        <div className="space-y-5">{error && <Alert tone="danger">{error}</Alert>}<RepFields values={values} onChange={setValues} /><Checkbox label="Envoyer l'invitation maintenant" checked={invite} onChange={(e) => setInvite(e.target.checked)} /></div>
      </Modal>
    </>
  );
}

export function EditSalesRepButton({ salesRepId, initial }: { salesRepId: string; initial: RepFormValues }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { push } = useToast();
  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await updateSalesRepAction({ salesRepId, ...values, commissionValue: toStored(values.commissionType, values.commissionValue) });
      if (!result.ok) return setError(result.error);
      push({ tone: "success", title: result.message ?? "Enregistré" });
      setOpen(false);
      router.refresh();
    });
  };
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>Modifier</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Modifier le commercial" size="lg" footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button><Button onClick={submit} loading={pending}>Enregistrer</Button></>}>
        <div className="space-y-5">{error && <Alert tone="danger">{error}</Alert>}<RepFields values={values} onChange={setValues} /></div>
      </Modal>
    </>
  );
}
