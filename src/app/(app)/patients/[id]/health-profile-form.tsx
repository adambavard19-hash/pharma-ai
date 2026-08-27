"use client";

import { useActionState } from "react";
import { Save } from "lucide-react";
import { saveHealthProfileAction } from "@/server/actions/patients";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import type { HealthProfileView } from "@/server/services/patients";
import type { ActionResult } from "@/server/actions/types";

const TRI_STATE_OPTIONS = [
  { value: "unknown", label: "Non renseigné" },
  { value: "yes", label: "Oui" },
  { value: "no", label: "Non" },
];

function triValue(value: boolean | null): string {
  if (value === null) return "unknown";
  return value ? "yes" : "no";
}

/**
 * Profil de santé.
 *
 * Ces informations alimentent directement les garde-fous du moteur : une
 * allergie déclarée écarte les références correspondantes, une grossesse
 * déclarée bloque certaines catégories de conseil.
 */
export function HealthProfileForm({
  patientId,
  profile,
  readOnly,
}: {
  patientId: string;
  profile: HealthProfileView;
  readOnly: boolean;
}) {
  const [state, formAction, pending] = useActionState<
    ActionResult<null> | null,
    FormData
  >(saveHealthProfileAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="patientId" value={patientId} />

      {state?.ok === false && <Alert tone="danger">{state.error}</Alert>}
      {state?.ok === true && (
        <Alert tone="success">{state.message ?? "Profil mis à jour."}</Alert>
      )}

      <Alert tone="info" title="Ces informations sont utilisées par le moteur">
        Une allergie ou une contre-indication déclarée ici écarte automatiquement les
        références concernées, avant toute considération de disponibilité ou de marge.
      </Alert>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Allergies déclarées"
          htmlFor="allergies"
          hint="Une par ligne ou séparées par des virgules."
        >
          <Textarea
            id="allergies"
            name="allergies"
            rows={3}
            defaultValue={profile.allergies.join("\n")}
            disabled={readOnly}
            placeholder="pénicilline&#10;arachide"
          />
        </Field>

        <Field
          label="Pathologies chroniques"
          htmlFor="conditions"
          hint="Renseignées par le patient au comptoir."
        >
          <Textarea
            id="conditions"
            name="conditions"
            rows={3}
            defaultValue={profile.conditions.join("\n")}
            disabled={readOnly}
            placeholder="asthme&#10;hypertension"
          />
        </Field>
      </div>

      <Field
        label="Traitements en cours hors ordonnance"
        htmlFor="currentTreatments"
        hint="Automédication, compléments alimentaires."
      >
        <Textarea
          id="currentTreatments"
          name="currentTreatments"
          rows={2}
          defaultValue={profile.currentTreatments.join("\n")}
          disabled={readOnly}
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Grossesse" htmlFor="isPregnant">
          <Select
            id="isPregnant"
            name="isPregnant"
            defaultValue={triValue(profile.isPregnant)}
            disabled={readOnly}
          >
            {TRI_STATE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Allaitement" htmlFor="isBreastfeeding">
          <Select
            id="isBreastfeeding"
            name="isBreastfeeding"
            defaultValue={triValue(profile.isBreastfeeding)}
            disabled={readOnly}
          >
            {TRI_STATE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Insuffisance rénale" htmlFor="renalImpairment">
          <Select
            id="renalImpairment"
            name="renalImpairment"
            defaultValue={triValue(profile.renalImpairment)}
            disabled={readOnly}
          >
            {TRI_STATE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Insuffisance hépatique" htmlFor="hepaticImpairment">
          <Select
            id="hepaticImpairment"
            name="hepaticImpairment"
            defaultValue={triValue(profile.hepaticImpairment)}
            disabled={readOnly}
          >
            {TRI_STATE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Notes du pharmacien" htmlFor="notes">
        <Textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={profile.notes ?? ""}
          disabled={readOnly}
          placeholder="Observations utiles au conseil…"
        />
      </Field>

      {!readOnly && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-4">
          <p className="text-[12px] text-text-tertiary">
            {profile.updatedAt
              ? `Dernière mise à jour : ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" }).format(profile.updatedAt)}`
              : "Aucune donnée enregistrée pour l'instant."}
          </p>
          <Button type="submit" loading={pending} leadingIcon={<Save className="size-4" />}>
            Enregistrer
          </Button>
        </div>
      )}

      {readOnly && (
        <Badge tone="neutral">Lecture seule — votre rôle ne permet pas la modification</Badge>
      )}
    </form>
  );
}
