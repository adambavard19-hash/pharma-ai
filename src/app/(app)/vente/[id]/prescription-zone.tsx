"use client";

import { useId } from "react";
import { AlertTriangle, Check, EyeOff, Pencil, X } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { OCR_REVIEW_THRESHOLD } from "@/config/constants";
import { cn } from "@/lib/utils";
import type { SaleLineDraft } from "./types";

/**
 * Zone 1 — le traitement.
 *
 * La vérification ne mérite pas un écran : elle se fait ici, à l'endroit où les
 * lignes s'affichent. Une fois l'ordonnance confirmée, la zone se replie en un
 * résumé de trois lignes et le pharmacien passe aux conseils sans changer de
 * page. Un bouton « Corriger » la rouvre à tout moment.
 */
export function PrescriptionZone({
  editing,
  lines,
  onLineChange,
  patients,
  patientId,
  onPatientChange,
  prescriberName,
  onPrescriberChange,
  prescribedAt,
  onPrescribedAtChange,
  onEdit,
  canEdit,
  simulatedExtraction,
}: {
  editing: boolean;
  lines: SaleLineDraft[];
  onLineChange: (id: string, patch: Partial<SaleLineDraft>) => void;
  patients: { id: string; firstName: string; lastName: string; reference: string }[];
  patientId: string;
  onPatientChange: (value: string) => void;
  prescriberName: string;
  onPrescriberChange: (value: string) => void;
  prescribedAt: string;
  onPrescribedAtChange: (value: string) => void;
  onEdit: () => void;
  canEdit: boolean;
  simulatedExtraction: boolean;
}) {
  if (!editing) return <PrescriptionSummary lines={lines} onEdit={onEdit} canEdit={canEdit} />;

  const unreadableCount = lines.reduce((sum, line) => sum + line.unreadableFields.length, 0);

  return (
    <section className="space-y-3" aria-labelledby="zone-traitement">
      <ZoneTitle id="zone-traitement" step={1} title="Le traitement" />

      {simulatedExtraction && (
        <Alert tone="danger" title="Extraction simulée">
          Aucune image n&apos;a été analysée. Le contenu ci-dessous est un scénario fictif de
          démonstration : il ne correspond à aucune ordonnance réelle.
        </Alert>
      )}

      <Alert tone="warning" title="Rien n'a été deviné">
        Un champ illisible reste vide et doit être saisi par un professionnel.
        {unreadableCount > 0 && (
          <>
            {" "}
            <strong>
              {unreadableCount} champ{unreadableCount > 1 ? "s" : ""} illisible
              {unreadableCount > 1 ? "s" : ""}
            </strong>{" "}
            sur cette ordonnance.
          </>
        )}{" "}
        Seules les lignes confirmées alimentent l&apos;analyse et la fiche patient.
      </Alert>

      <Card>
        <CardContent className="grid gap-4 pt-5 sm:grid-cols-3">
          <Field label="Patient" htmlFor="patientId">
            <Select
              id="patientId"
              value={patientId}
              onChange={(event) => onPatientChange(event.target.value)}
            >
              <option value="">Aucun patient rattaché</option>
              {patients.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.lastName.toUpperCase()} {patient.firstName} — {patient.reference}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Prescripteur" htmlFor="prescriberName">
            <Input
              id="prescriberName"
              value={prescriberName}
              onChange={(event) => onPrescriberChange(event.target.value)}
              placeholder="Dr …"
            />
          </Field>
          <Field label="Date de prescription" htmlFor="prescribedAt">
            <Input
              id="prescribedAt"
              type="date"
              value={prescribedAt}
              onChange={(event) => onPrescribedAtChange(event.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      {lines.map((line, index) => (
        <LineCard
          key={line.id}
          line={line}
          index={index}
          onChange={(patch) => onLineChange(line.id, patch)}
        />
      ))}
    </section>
  );
}

/** Vue repliée : ce que le pharmacien a besoin de relire d'un coup d'œil. */
function PrescriptionSummary({
  lines,
  onEdit,
  canEdit,
}: {
  lines: SaleLineDraft[];
  onEdit: () => void;
  canEdit: boolean;
}) {
  const confirmed = lines.filter((line) => line.confirmed);

  return (
    <section className="space-y-3" aria-labelledby="zone-traitement">
      <ZoneTitle
        id="zone-traitement"
        step={1}
        title="Le traitement"
        action={
          canEdit ? (
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] font-medium text-brand-700 transition-colors hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-950"
            >
              <Pencil className="size-3.5" />
              Corriger
            </button>
          ) : undefined
        }
      />

      <Card>
        <CardContent className="pt-4 pb-4">
          <ul className="divide-y divide-border-subtle">
            {confirmed.map((line) => (
              <li key={line.id} className="space-y-1 py-2.5 first:pt-0 last:pb-0">
                <p className="text-[14px] font-medium text-text-primary">
                  {line.drugName}
                  {line.dosage && (
                    <span className="font-normal text-text-secondary"> {line.dosage}</span>
                  )}
                  {line.posology && (
                    <span className="font-normal text-text-secondary">
                      {" "}
                      — {line.posology}
                    </span>
                  )}
                  {line.durationDays ? (
                    <span className="font-normal text-text-tertiary">
                      {" "}
                      · {line.durationDays} j
                    </span>
                  ) : null}
                </p>
                {line.explanationSource === "UNAVAILABLE" ? (
                  <p className="text-[12px] leading-4 text-warning-700 dark:text-warning-500">
                    Aucune information dans le référentiel connecté : aucune explication
                    n&apos;est produite pour ce médicament.
                  </p>
                ) : line.purpose ? (
                  <p className="text-[12.5px] leading-5 text-text-tertiary">{line.purpose}</p>
                ) : null}
              </li>
            ))}
            {confirmed.length === 0 && (
              <li className="py-3 text-[13px] text-text-tertiary">Aucune ligne confirmée.</li>
            )}
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}

export function ZoneTitle({
  id,
  step,
  title,
  action,
  tone = "neutral",
}: {
  id: string;
  step: number;
  title: string;
  action?: React.ReactNode;
  tone?: "neutral" | "danger";
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 id={id} className="flex items-center gap-2.5">
        <span
          className={cn(
            "flex size-[22px] shrink-0 items-center justify-center rounded-full text-[11.5px] font-semibold tabular",
            tone === "danger"
              ? "bg-danger-600 text-white"
              : "bg-surface-sunken text-text-secondary",
          )}
        >
          {step}
        </span>
        <span className="text-[15px] font-semibold text-text-primary">{title}</span>
      </h2>
      {action}
    </div>
  );
}

function LineCard({
  line,
  index,
  onChange,
}: {
  line: SaleLineDraft;
  index: number;
  onChange: (patch: Partial<SaleLineDraft>) => void;
}) {
  const unreadable = new Set(line.unreadableFields);
  const nameConfidence = line.confidence.drugName ?? 0;
  const nameUncertain = nameConfidence > 0 && nameConfidence < OCR_REVIEW_THRESHOLD;

  return (
    <Card
      className={cn(
        "transition-colors",
        line.confirmed
          ? "border-success-500/40 bg-success-50/25 dark:bg-success-700/5"
          : "border-border-default",
      )}
    >
      <CardHeader
        title={`Ligne ${index + 1}`}
        description={line.rawText ? `Lu sur l'ordonnance : « ${line.rawText} »` : undefined}
        action={
          <button
            type="button"
            onClick={() => onChange({ confirmed: !line.confirmed })}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors",
              line.confirmed
                ? "bg-success-600 text-white hover:bg-success-700"
                : "border border-border-default text-text-secondary hover:bg-surface-sunken",
            )}
            aria-pressed={line.confirmed}
          >
            {line.confirmed ? (
              <>
                <Check className="size-3.5" /> Confirmée
              </>
            ) : (
              <>
                <X className="size-3.5" /> À confirmer
              </>
            )}
          </button>
        }
      />
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr]">
          <FieldWithConfidence
            label="Médicament"
            value={line.drugName}
            onChange={(value) => onChange({ drugName: value })}
            confidence={nameConfidence}
            unreadable={unreadable.has("drugName")}
            required
          />
          <FieldWithConfidence
            label="Dosage"
            value={line.dosage}
            onChange={(value) => onChange({ dosage: value })}
            confidence={line.confidence.dosage ?? 0}
            unreadable={unreadable.has("dosage")}
          />
          <FieldWithConfidence
            label="Forme"
            value={line.form}
            onChange={(value) => onChange({ form: value })}
            confidence={line.confidence.form ?? 0}
            unreadable={unreadable.has("form")}
          />
        </div>

        <FieldWithConfidence
          label="Posologie"
          value={line.posology}
          onChange={(value) => onChange({ posology: value })}
          confidence={line.confidence.posology ?? 0}
          unreadable={unreadable.has("posology")}
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Durée (jours)" htmlFor={`duration-${line.id}`}>
            <Input
              id={`duration-${line.id}`}
              type="number"
              min={0}
              value={line.durationDays ?? ""}
              onChange={(event) =>
                onChange({
                  durationDays: event.target.value ? Number(event.target.value) : null,
                })
              }
            />
          </Field>
          <Field label="Quantité" htmlFor={`quantity-${line.id}`}>
            <Input
              id={`quantity-${line.id}`}
              type="number"
              min={0}
              value={line.quantity ?? ""}
              onChange={(event) =>
                onChange({ quantity: event.target.value ? Number(event.target.value) : null })
              }
            />
          </Field>
          <FieldWithConfidence
            label="Instructions"
            value={line.instructions}
            onChange={(value) => onChange({ instructions: value })}
            confidence={line.confidence.instructions ?? 0}
            unreadable={unreadable.has("instructions")}
          />
        </div>

        {nameUncertain && (
          <Alert tone="warning" icon={<AlertTriangle className="size-[18px]" />}>
            Le nom du médicament a été lu avec une confiance de{" "}
            {Math.round(nameConfidence * 100)} %. Vérifiez-le sur l&apos;ordonnance avant de
            confirmer.
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

function FieldWithConfidence({
  label,
  value,
  onChange,
  confidence,
  unreadable,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  confidence: number;
  unreadable: boolean;
  required?: boolean;
}) {
  // `useId` garantit un identifiant stable entre serveur et client — sans quoi
  // l'association label/champ casse à l'hydratation.
  const id = useId();
  const uncertain = !unreadable && confidence > 0 && confidence < OCR_REVIEW_THRESHOLD;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-[13px] font-medium text-text-primary">
          {label}
          {required && (
            <span className="ml-0.5 text-danger-600" aria-hidden="true">
              *
            </span>
          )}
        </label>
        {unreadable ? (
          <Badge tone="danger" icon={<EyeOff className="size-3" />}>
            Illisible
          </Badge>
        ) : uncertain ? (
          <Badge tone="warning">{Math.round(confidence * 100)} %</Badge>
        ) : confidence > 0 ? (
          <Badge tone="success">{Math.round(confidence * 100)} %</Badge>
        ) : null}
      </div>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        placeholder={unreadable ? "Non lu — à saisir" : undefined}
        className={cn(
          unreadable && "border-danger-400 bg-danger-50/40 dark:bg-danger-700/10",
          uncertain && "border-warning-400 bg-warning-50/40 dark:bg-warning-700/10",
        )}
      />
    </div>
  );
}
