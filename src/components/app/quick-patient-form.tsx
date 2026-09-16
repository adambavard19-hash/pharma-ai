"use client";

import { useState, useTransition } from "react";
import { UserPlus } from "lucide-react";
import { quickCreatePatientAction } from "@/server/actions/patients";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import type { PatientOption } from "./patient-picker";

/**
 * Un nouveau patient au comptoir, en trois champs.
 *
 * Le patient est devant nous : on prend son nom, son prénom, son adresse, et
 * on lui demande s'il veut recevoir ses conseils par e-mail. C'est tout ce
 * qu'il faut pour envoyer le plan à la fin et retrouver la délivrance dans
 * son historique. Le reste de la fiche se complète plus tard, si besoin.
 */
export function QuickPatientForm({
  prescriptionId,
  initialQuery = "",
  onCreated,
  onCancel,
  compact = false,
}: {
  prescriptionId?: string | null;
  /** Ce que le pharmacien a tapé dans la recherche : on s'en sert pour pré-remplir. */
  initialQuery?: string;
  onCreated: (patient: PatientOption) => void;
  onCancel?: () => void;
  compact?: boolean;
}) {
  const words = initialQuery.trim().split(/\s+/).filter(Boolean);
  const looksLikeEmail = initialQuery.includes("@");
  const [firstName, setFirstName] = useState(looksLikeEmail ? "" : (words[1] ?? ""));
  const [lastName, setLastName] = useState(looksLikeEmail ? "" : (words[0] ?? ""));
  const [email, setEmail] = useState(looksLikeEmail ? initialQuery.trim() : "");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});
  const [pending, start] = useTransition();
  const { push } = useToast();

  const submit = () =>
    start(async () => {
      setError(null);
      const result = await quickCreatePatientAction({ prescriptionId: prescriptionId ?? null, firstName, lastName, email, phone, adviceConsent: consent });
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      push({ tone: "success", title: result.message ?? "Patient créé." });
      onCreated({ id: result.data.patientId, firstName: result.data.firstName, lastName: result.data.lastName, reference: result.data.reference, email: result.data.email });
    });

  return (
    <div className={compact ? "space-y-2.5" : "space-y-3"}>
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Field label="Nom" htmlFor="qp-last" error={fieldErrors.lastName}>
          <Input id="qp-last" value={lastName} autoFocus={!lastName} onChange={(e) => setLastName(e.target.value)} placeholder="DUPONT" autoComplete="off" />
        </Field>
        <Field label="Prénom" htmlFor="qp-first" error={fieldErrors.firstName}>
          <Input id="qp-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Camille" autoComplete="off" />
        </Field>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Field label="Adresse e-mail" htmlFor="qp-email" error={fieldErrors.email} hint="Pour recevoir son plan et ses rappels.">
          <Input id="qp-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom.nom@exemple.fr" autoComplete="off" onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
        </Field>
        <Field label="Téléphone" htmlFor="qp-phone" hint="Facultatif.">
          <Input id="qp-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="06 …" autoComplete="off" />
        </Field>
      </div>
      <label className="flex items-start gap-2.5 text-[13px] leading-5 text-text-secondary">
        <Checkbox checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={!email} />
        <span>
          Le patient accepte de recevoir ses conseils et son plan par e-mail.
          {!email && <span className="text-text-tertiary"> (une adresse est nécessaire)</span>}
        </span>
      </label>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" loading={pending} leadingIcon={<UserPlus className="size-4" />} onClick={submit} disabled={!firstName.trim() || !lastName.trim()}>
          {prescriptionId ? "Créer et rattacher à cette délivrance" : "Créer le patient"}
        </Button>
        {onCancel && (
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Annuler
          </Button>
        )}
      </div>
    </div>
  );
}
