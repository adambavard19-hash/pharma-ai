"use client";

import { useState, useTransition } from "react";
import { UserPlus } from "lucide-react";
import { createPharmacyOwnerAction } from "@/server/actions/platform-pharmacies";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";

export function AddOwnerButton({ pharmacyId }: { pharmacyId: string }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { push } = useToast();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await createPharmacyOwnerAction({ pharmacyId, ...form });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      push({ tone: "success", title: result.message ?? "Titulaire créé" });
      setForm({ firstName: "", lastName: "", email: "", password: "" });
      setOpen(false);
    });
  };

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        leadingIcon={<UserPlus className="size-[18px]" />}
      >
        Ajouter un titulaire
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Ajouter un titulaire"
        description="Il aura accès à l'ensemble de cette officine."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button onClick={submit} loading={pending}>
              Créer le compte
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error && <Alert tone="danger">{error}</Alert>}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Prénom" htmlFor="owner-first" required>
              <Input
                id="owner-first"
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              />
            </Field>
            <Field label="Nom" htmlFor="owner-last" required>
              <Input
                id="owner-last"
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Adresse e-mail" htmlFor="owner-mail" required>
            <Input
              id="owner-mail"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>

          <Field
            label="Mot de passe initial"
            htmlFor="owner-pass"
            required
            hint="12 caractères minimum, avec majuscule et chiffre."
          >
            <Input
              id="owner-pass"
              type="text"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </Field>
        </div>
      </Modal>
    </>
  );
}
