"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Plus } from "lucide-react";
import {
  createClientPharmacyAction,
  updateClientPharmacyAction,
} from "@/server/actions/platform-pharmacies";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";

export type PharmacyFormValues = {
  name: string;
  email: string;
  phone: string;
  addressLine1: string;
  postalCode: string;
  city: string;
  finessNumber: string;
  siret: string;
  brandColor: string;
};

const EMPTY: PharmacyFormValues = {
  name: "",
  email: "",
  phone: "",
  addressLine1: "",
  postalCode: "",
  city: "",
  finessNumber: "",
  siret: "",
  brandColor: "#0F766E",
};

/**
 * Signer une officine.
 *
 * Un seul formulaire crée l'officine ET son titulaire : c'est le geste réel de
 * l'éditeur le jour d'une signature. Les livrer séparément produirait des
 * officines sans personne pour s'y connecter.
 */
export function CreatePharmacyButton() {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<PharmacyFormValues>(EMPTY);
  const [owner, setOwner] = useState({
    ownerFirstName: "",
    ownerLastName: "",
    ownerEmail: "",
    ownerPassword: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { push } = useToast();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await createClientPharmacyAction({ ...values, ...owner });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      push({ tone: "success", title: result.message ?? "Officine créée" });
      setValues(EMPTY);
      setOwner({ ownerFirstName: "", ownerLastName: "", ownerEmail: "", ownerPassword: "" });
      setOpen(false);
      router.push(`/admin/pharmacies/${result.data.pharmacyId}`);
    });
  };

  return (
    <>
      <Button onClick={() => setOpen(true)} leadingIcon={<Plus className="size-[18px]" />}>
        Nouvelle officine
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nouvelle officine cliente"
        description="L'officine et son titulaire sont créés ensemble."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button
              onClick={submit}
              loading={pending}
              leadingIcon={<Building2 className="size-4" />}
            >
              Créer l&apos;environnement
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          {error && <Alert tone="danger">{error}</Alert>}

          <PharmacyFields values={values} onChange={setValues} />

          <div className="space-y-4 border-t border-border-subtle pt-5">
            <p className="text-[13px] font-semibold text-text-primary">Titulaire</p>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Prénom" htmlFor="ownerFirstName" required>
                <Input
                  id="ownerFirstName"
                  value={owner.ownerFirstName}
                  onChange={(e) => setOwner({ ...owner, ownerFirstName: e.target.value })}
                />
              </Field>
              <Field label="Nom" htmlFor="ownerLastName" required>
                <Input
                  id="ownerLastName"
                  value={owner.ownerLastName}
                  onChange={(e) => setOwner({ ...owner, ownerLastName: e.target.value })}
                />
              </Field>
            </div>

            <Field label="Adresse e-mail" htmlFor="ownerEmail" required hint="Son identifiant.">
              <Input
                id="ownerEmail"
                type="email"
                value={owner.ownerEmail}
                onChange={(e) => setOwner({ ...owner, ownerEmail: e.target.value })}
              />
            </Field>

            <Field
              label="Mot de passe initial"
              htmlFor="ownerPassword"
              required
              hint="12 caractères minimum, avec majuscule et chiffre."
            >
              <Input
                id="ownerPassword"
                type="text"
                value={owner.ownerPassword}
                onChange={(e) => setOwner({ ...owner, ownerPassword: e.target.value })}
              />
            </Field>
          </div>
        </div>
      </Modal>
    </>
  );
}

export function EditPharmacyButton({
  pharmacyId,
  initial,
}: {
  pharmacyId: string;
  initial: PharmacyFormValues;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { push } = useToast();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await updateClientPharmacyAction({ pharmacyId, ...values });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      push({ tone: "success", title: result.message ?? "Enregistré" });
      setOpen(false);
    });
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Modifier
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Modifier l'officine"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button onClick={submit} loading={pending}>
              Enregistrer
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          {error && <Alert tone="danger">{error}</Alert>}
          <PharmacyFields values={values} onChange={setValues} />
        </div>
      </Modal>
    </>
  );
}

function PharmacyFields({
  values,
  onChange,
}: {
  values: PharmacyFormValues;
  onChange: (values: PharmacyFormValues) => void;
}) {
  const set = (key: keyof PharmacyFormValues) => (value: string) =>
    onChange({ ...values, [key]: value });

  return (
    <div className="space-y-4">
      <Field label="Nom de l'officine" htmlFor="name" required>
        <Input
          id="name"
          value={values.name}
          onChange={(e) => set("name")(e.target.value)}
          placeholder="Pharmacie du Marché"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="E-mail de l'officine" htmlFor="email">
          <Input
            id="email"
            type="email"
            value={values.email}
            onChange={(e) => set("email")(e.target.value)}
          />
        </Field>
        <Field label="Téléphone" htmlFor="phone">
          <Input id="phone" value={values.phone} onChange={(e) => set("phone")(e.target.value)} />
        </Field>
      </div>

      <Field label="Adresse" htmlFor="addressLine1">
        <Input
          id="addressLine1"
          value={values.addressLine1}
          onChange={(e) => set("addressLine1")(e.target.value)}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Code postal" htmlFor="postalCode">
          <Input
            id="postalCode"
            value={values.postalCode}
            onChange={(e) => set("postalCode")(e.target.value)}
          />
        </Field>
        <Field label="Ville" htmlFor="city" className="sm:col-span-2">
          <Input id="city" value={values.city} onChange={(e) => set("city")(e.target.value)} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="FINESS" htmlFor="finessNumber">
          <Input
            id="finessNumber"
            value={values.finessNumber}
            onChange={(e) => set("finessNumber")(e.target.value)}
          />
        </Field>
        <Field label="SIRET" htmlFor="siret">
          <Input id="siret" value={values.siret} onChange={(e) => set("siret")(e.target.value)} />
        </Field>
        <Field label="Couleur" htmlFor="brandColor" hint="Reprise sur le plan patient.">
          <Input
            id="brandColor"
            type="color"
            value={values.brandColor || "#0F766E"}
            onChange={(e) => set("brandColor")(e.target.value)}
            className="h-10 p-1"
          />
        </Field>
      </div>
    </div>
  );
}
