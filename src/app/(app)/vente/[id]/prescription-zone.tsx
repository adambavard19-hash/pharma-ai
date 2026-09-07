"use client";

import { useId, useState } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronRight, Pencil, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PatientPicker, type PatientOption } from "@/components/app/patient-picker";
import { EMPTY_SCHEDULE, totalDailyDoses, unitsForDuration } from "@/core/posology";
import { VISION_REVIEW_THRESHOLD } from "@/core/extraction";
import { PosologyEditor } from "./posology-editor";
import { AddLine } from "./add-line";
import { SpecialtyLink } from "./specialty-link";
import type { SaleLineDraft } from "./types";

/**
 * Le traitement.
 *
 * Avant l'analyse : une liste que l'on vérifie en quelques secondes — une
 * ligne par médicament, une coche ou un point d'attention, et l'édition qui
 * s'ouvre au clic. Pas cinq formulaires. Un seul bouton confirme l'ensemble.
 *
 * Après l'analyse : une ligne (`TreatmentLine`) et, sous « Voir les détails »,
 * ce que le catalogue national en dit (`TreatmentDetails`). Le pharmacien
 * qui délivre un traitement qu'il connaît n'a pas à relire la composition.
 */
export function PrescriptionZone({
  prescriptionId,
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
  catalogAttribution,
}: {
  prescriptionId: string;
  editing: boolean;
  lines: SaleLineDraft[];
  onLineChange: (id: string, patch: Partial<SaleLineDraft>) => void;
  patients: PatientOption[];
  patientId: string;
  onPatientChange: (value: string) => void;
  prescriberName: string;
  onPrescriberChange: (value: string) => void;
  prescribedAt: string;
  onPrescribedAtChange: (value: string) => void;
  onEdit: () => void;
  canEdit: boolean;
  catalogAttribution: string | null;
}) {
  const [openLine, setOpenLine] = useState<string | null>(null);
  const [headerOpen, setHeaderOpen] = useState(!patientId);

  if (!editing) {
    return (
      <TreatmentDetails
        lines={lines}
        onEdit={onEdit}
        canEdit={canEdit}
        catalogAttribution={catalogAttribution}
      />
    );
  }

  const detected = lines.length;
  const issues = lines.filter((line) => lineIssues(line).length > 0).length;
  const patient = patients.find((option) => option.id === patientId) ?? null;

  return (
    <section className="space-y-3" aria-labelledby="zone-traitement">
      <div className="flex items-center justify-between gap-3">
        <h2 id="zone-traitement" className="flex items-center gap-2 text-[15px] font-semibold text-text-primary">
          {detected} médicament{detected > 1 ? "s" : ""} détecté{detected > 1 ? "s" : ""}
          {issues === 0 ? (
            <Check className="size-[18px] text-success-600 dark:text-success-500" />
          ) : (
            <span className="text-[12.5px] font-normal text-warning-700 dark:text-warning-500">
              {issues} à confirmer
            </span>
          )}
        </h2>
        <p className="text-[12.5px] text-text-tertiary">Un clic sur une ligne pour la corriger</p>
      </div>

      <Card>
        <ul className="divide-y divide-border-subtle">
          {lines.map((line, index) => (
            <CompactLine
              key={line.id}
              line={line}
              index={index}
              open={openLine === line.id}
              onToggle={() => setOpenLine((current) => (current === line.id ? null : line.id))}
              onChange={(patch) => onLineChange(line.id, patch)}
            />
          ))}
          {lines.length === 0 && (
            <li className="px-4 py-6 text-center text-[13.5px] text-text-secondary">
              Aucun médicament sur cette délivrance. Ajoutez-les ci-dessous.
            </li>
          )}
        </ul>
      </Card>

      <AddLine prescriptionId={prescriptionId} />

      {/* Prescripteur, date, patient : une ligne, qui s'ouvre si besoin. Le
          patient non rattaché ouvre la ligne d'office — c'est une action. */}
      <Card>
        <CardContent className="py-3">
          <button
            type="button"
            onClick={() => setHeaderOpen((value) => !value)}
            aria-expanded={headerOpen}
            className="flex w-full items-center gap-2 text-left text-[13px] text-text-secondary"
          >
            <span className="min-w-0 flex-1 truncate">
              {[
                patient ? `${patient.firstName} ${patient.lastName}` : "Patient non rattaché",
                prescriberName || "Prescripteur non lu",
                prescribedAt ? `le ${formatDateFr(prescribedAt)}` : "date non lue",
              ].join(" · ")}
            </span>
            <span className="flex shrink-0 items-center gap-1 text-[12.5px] text-text-tertiary">
              <Pencil className="size-3.5" />
              Modifier
            </span>
          </button>
          {headerOpen && (
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <Field label="Patient" htmlFor="patientId">
                <PatientPicker patients={patients} value={patientId} onChange={onPatientChange} />
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
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

/** Ce qui, sur une ligne, mérite un regard avant de confirmer. */
export function lineIssues(line: SaleLineDraft): string[] {
  const unreadable = new Set(line.unreadableFields);
  const low = (field: string) => (line.confidence[field] ?? 1) < VISION_REVIEW_THRESHOLD;
  const issues: string[] = [];

  if (!line.drugName.trim()) issues.push("nom à saisir");
  else if (unreadable.has("drugName") || low("drugName")) issues.push("nom à confirmer");

  if (unreadable.has("dosage") && !line.dosage) issues.push("dosage à confirmer");
  else if (line.dosage && low("dosage")) issues.push("dosage à confirmer");

  if (!line.schedule && !line.posology) issues.push("posologie à saisir");
  else if (line.posology && low("posology")) issues.push("posologie à confirmer");

  return issues;
}

/** « Efferalgan 1 g · 3/j · 5 j · 2 boîtes » */
function describeLine(line: SaleLineDraft): string {
  const perDay = line.schedule ? totalDailyDoses(line.schedule) : 0;
  return [
    perDay > 0 ? `${perDay}/j` : line.posology || null,
    line.durationDays ? `${line.durationDays} j` : null,
    line.quantity ? `${line.quantity} boîte${line.quantity > 1 ? "s" : ""}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function CompactLine({
  line,
  index,
  open,
  onToggle,
  onChange,
}: {
  line: SaleLineDraft;
  index: number;
  open: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<SaleLineDraft>) => void;
}) {
  const issues = lineIssues(line);
  const excluded = !line.confirmed;

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={`${line.drugName || `Ligne ${index + 1}`} — ${open ? "replier" : "corriger"}`}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-sunken/50"
      >
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full",
            excluded
              ? "bg-surface-sunken text-text-tertiary"
              : issues.length > 0
                ? "bg-warning-100 text-warning-700 dark:bg-warning-900/40 dark:text-warning-400"
                : "bg-success-100 text-success-700 dark:bg-success-900/40 dark:text-success-400",
          )}
        >
          {excluded ? (
            <X className="size-4" />
          ) : issues.length > 0 ? (
            <AlertTriangle className="size-4" />
          ) : (
            <Check className="size-4" strokeWidth={2.5} />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block truncate text-[15px] leading-5 text-text-primary",
              excluded && "text-text-tertiary line-through",
            )}
          >
            <span className="font-medium">{line.drugName || "Médicament à saisir"}</span>
            {line.dosage && <span className="text-text-secondary"> {line.dosage}</span>}
            {describeLine(line) && (
              <span className="text-text-secondary"> · {describeLine(line)}</span>
            )}
          </span>
          {issues.length > 0 && !excluded && (
            <span className="block truncate text-[12.5px] text-warning-700 dark:text-warning-500">
              {issues.join(" · ")}
            </span>
          )}
          {excluded && (
            <span className="block text-[12.5px] text-text-tertiary">Exclu de l&apos;analyse</span>
          )}
        </span>
        <ChevronDown
          className={cn("size-4 shrink-0 text-text-tertiary transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="border-t border-border-subtle bg-surface-sunken/30 px-4 py-4">
          <LineEditor line={line} onChange={onChange} />
        </div>
      )}
    </li>
  );
}

function LineEditor({
  line,
  onChange,
}: {
  line: SaleLineDraft;
  onChange: (patch: Partial<SaleLineDraft>) => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const unreadable = new Set(line.unreadableFields);
  const schedule = line.schedule ?? EMPTY_SCHEDULE;
  const perDay = totalDailyDoses(schedule);
  const suggestedUnits = unitsForDuration(schedule, line.durationDays);

  return (
    <div className="space-y-3.5">
      <div className="grid gap-2 sm:grid-cols-[2fr_1fr]">
        <CompactField
          label="Médicament"
          value={line.drugName}
          onChange={(value) => onChange({ drugName: value })}
          unreadable={unreadable.has("drugName")}
        />
        <CompactField
          label="Dosage"
          value={line.dosage}
          onChange={(value) => onChange({ dosage: value })}
          unreadable={unreadable.has("dosage")}
        />
      </div>

      <PosologyEditor
        schedule={schedule}
        inferred={line.scheduleInferred}
        onChange={(next) => onChange({ schedule: next, scheduleInferred: false })}
      />

      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="block text-[11.5px] font-medium text-text-tertiary">Durée</span>
          <span className="flex items-center gap-1.5">
            <Input
              type="number"
              min={0}
              value={line.durationDays ?? ""}
              onChange={(event) =>
                onChange({ durationDays: event.target.value ? Number(event.target.value) : null })
              }
              className="w-[72px] text-center"
              aria-label="Durée en jours"
            />
            <span className="text-[13px] text-text-secondary">jours</span>
          </span>
        </label>

        <label className="space-y-1">
          <span className="block text-[11.5px] font-medium text-text-tertiary">Quantité</span>
          <Input
            type="number"
            min={0}
            value={line.quantity ?? ""}
            onChange={(event) =>
              onChange({ quantity: event.target.value ? Number(event.target.value) : null })
            }
            className="w-[80px] text-center"
            aria-label="Quantité délivrée"
          />
        </label>

        {suggestedUnits !== null && line.quantity !== suggestedUnits && (
          <button
            type="button"
            onClick={() => onChange({ quantity: suggestedUnits })}
            className="mb-2 text-[12.5px] text-brand-700 underline underline-offset-2 dark:text-brand-400"
          >
            {suggestedUnits} pour la cure
          </button>
        )}

        {perDay > 0 && (
          <span className="mb-2 ml-auto text-[12.5px] text-text-tertiary tabular">
            {perDay} / jour
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setDetailsOpen((value) => !value)}
          aria-expanded={detailsOpen}
          className="flex items-center gap-1 text-[12.5px] text-text-tertiary transition-colors hover:text-text-secondary"
        >
          Détails
          <ChevronRight className={cn("size-3.5 transition-transform", detailsOpen && "rotate-90")} />
        </button>
        <button
          type="button"
          onClick={() => onChange({ confirmed: !line.confirmed })}
          className="text-[12.5px] text-text-tertiary underline-offset-2 hover:text-text-secondary hover:underline"
        >
          {line.confirmed ? "Exclure cette ligne de l'analyse" : "Réintégrer cette ligne"}
        </button>
      </div>

      {detailsOpen && (
        <div className="space-y-2.5">
          {line.rawText && (
            <p className="text-[12px] leading-4 text-text-tertiary">
              Lu sur l&apos;ordonnance : « {line.rawText} »
            </p>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <CompactField
              label="Forme"
              value={line.form}
              onChange={(value) => onChange({ form: value })}
              unreadable={unreadable.has("form")}
            />
            <CompactField
              label="Instructions"
              value={line.instructions}
              onChange={(value) => onChange({ instructions: value })}
              unreadable={unreadable.has("instructions")}
            />
          </div>
          <CompactField
            label="Posologie écrite"
            value={line.posology}
            onChange={(value) => onChange({ posology: value })}
            unreadable={unreadable.has("posology")}
            hint="Utilisée telle quelle si aucune prise n'est renseignée ci-dessus."
          />
        </div>
      )}
    </div>
  );
}

/**
 * Après l'analyse : la ligne du traitement, à lire en un regard.
 *
 * « 5 médicaments détectés ✓ » puis les noms. Ce qui appelle une action du
 * pharmacien — un médicament à rattacher au catalogue — est dit ici, en
 * petit, et conduit aux détails.
 */
export function TreatmentLine({
  lines,
  onEdit,
  canEdit,
  onOpenDetails,
}: {
  lines: SaleLineDraft[];
  onEdit: () => void;
  canEdit: boolean;
  onOpenDetails: () => void;
}) {
  const confirmed = lines.filter((line) => line.confirmed);
  const unattached = confirmed.filter((line) => !line.official && line.candidates.length > 0);

  return (
    <section aria-labelledby="zone-traitement" className="space-y-1">
      <div className="flex items-center justify-between gap-3">
        <h2 id="zone-traitement" className="flex items-center gap-2 text-[15px] font-semibold text-text-primary">
          {confirmed.length} médicament{confirmed.length > 1 ? "s" : ""} détecté
          {confirmed.length > 1 ? "s" : ""}
          <Check className="size-[18px] text-success-600 dark:text-success-500" strokeWidth={2.5} />
        </h2>
        {canEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] font-medium text-brand-700 transition-colors hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-950"
          >
            <Pencil className="size-3.5" />
            Corriger
          </button>
        )}
      </div>
      <p className="text-[13.5px] leading-5 text-text-secondary">
        {confirmed
          .map((line) => [line.drugName, line.dosage].filter(Boolean).join(" "))
          .join(" · ")}
      </p>
      {unattached.length > 0 && (
        <button
          type="button"
          onClick={onOpenDetails}
          className="text-[12.5px] text-warning-700 underline-offset-2 hover:underline dark:text-warning-500"
        >
          {unattached.length} à rattacher au catalogue national
        </button>
      )}
    </section>
  );
}

/** Ce que le catalogue national dit de chaque ligne — sous « Voir les détails ». */
export function TreatmentDetails({
  lines,
  onEdit,
  canEdit,
  catalogAttribution,
}: {
  lines: SaleLineDraft[];
  onEdit: () => void;
  canEdit: boolean;
  catalogAttribution: string | null;
}) {
  const confirmed = lines.filter((line) => line.confirmed);

  return (
    <section className="space-y-3" aria-label="Détail du traitement">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[13px] font-semibold text-text-primary">Le traitement, en détail</h3>
        {canEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-brand-700 hover:underline dark:text-brand-400"
          >
            <Pencil className="size-3.5" />
            Corriger
          </button>
        )}
      </div>

      <Card>
        <CardContent className="pt-3 pb-3">
          <ul className="divide-y divide-border-subtle">
            {confirmed.map((line) => (
              <DetailLine key={line.id} line={line} canEdit={canEdit} attribution={catalogAttribution} />
            ))}
            {confirmed.length === 0 && (
              <li className="py-3 text-[13px] text-text-tertiary">Aucune ligne confirmée.</li>
            )}
          </ul>

          {catalogAttribution && confirmed.some((line) => line.official) && (
            <p className="mt-3 border-t border-border-subtle pt-2.5 text-[11.5px] leading-4 text-text-tertiary">
              {catalogAttribution}
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function DetailLine({
  line,
  canEdit,
  attribution,
}: {
  line: SaleLineDraft;
  canEdit: boolean;
  attribution: string | null;
}) {
  return (
    <li className="py-2 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className="min-w-0 flex-1 text-[13.5px] leading-5 text-text-primary">
          <span className="font-medium">{line.drugName}</span>
          {line.dosage && <span className="text-text-secondary"> {line.dosage}</span>}
          {line.posology && <span className="text-text-secondary"> — {line.posology}</span>}
          {line.durationDays ? (
            <span className="text-text-tertiary"> · {line.durationDays} j</span>
          ) : null}
        </p>
        <AvailabilityChip availability={line.availability} />
      </div>

      {line.official ? (
        <details className="group mt-0.5">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[12px] leading-4 text-text-tertiary hover:text-text-secondary">
            <ChevronRight className="size-3 shrink-0 transition-transform group-open:rotate-90" />
            <span className="min-w-0 truncate">
              {line.official.name}
              {line.official.prescriptionConditions.length > 0 &&
                ` · ${line.official.prescriptionConditions.join(", ")}`}
            </span>
          </summary>
          <div className="mt-1.5 pl-[1.125rem]">
            <SpecialtyLink
              lineId={line.id}
              official={line.official}
              availability={line.availability}
              identifiedBy={line.identifiedBy}
              candidates={line.candidates}
              refusal={line.identificationRefusal}
              attribution={null}
              canEdit={canEdit}
            />
            {line.purpose && (
              <p className="mt-1.5 text-[12.5px] leading-5 text-text-secondary">{line.purpose}</p>
            )}
          </div>
        </details>
      ) : (
        <SpecialtyLink
          lineId={line.id}
          official={line.official}
          availability={line.availability}
          identifiedBy={line.identifiedBy}
          candidates={line.candidates}
          refusal={line.identificationRefusal}
          attribution={attribution}
          canEdit={canEdit}
        />
      )}
    </li>
  );
}

/** L'état du stock, en trois mots et une couleur. */
function AvailabilityChip({ availability }: { availability: SaleLineDraft["availability"] }) {
  if (!availability) return null;

  const { state, quantity } = availability;
  if (state === "IN_STOCK") {
    return <Badge tone="success">En stock · {quantity}</Badge>;
  }
  if (state === "REFERENCED_EMPTY") return <Badge tone="warning">Stock à zéro</Badge>;
  if (state === "NOT_REFERENCED") return <Badge tone="warning">Hors stock</Badge>;
  return <Badge tone="neutral">Disponibilité inconnue</Badge>;
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

/** Un champ court, étiquette au-dessus, sans bordure de section. */
function CompactField({
  label,
  value,
  onChange,
  unreadable,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  unreadable?: boolean;
  hint?: string;
}) {
  const id = useId();

  return (
    <div className="space-y-1">
      <label
        htmlFor={id}
        className="flex items-center gap-1.5 text-[11.5px] font-medium text-text-tertiary"
      >
        {label}
        {unreadable && (
          <span className="text-warning-700 dark:text-warning-500">· non lu</span>
        )}
      </label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={unreadable ? "À saisir" : undefined}
        className={cn(unreadable && !value && "border-warning-400")}
      />
      {hint && <p className="text-[11px] leading-4 text-text-tertiary">{hint}</p>}
    </div>
  );
}

/** « 2026-09-02 » → « 02/09/2026 ». */
function formatDateFr(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : iso;
}
