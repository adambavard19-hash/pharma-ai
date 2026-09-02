"use client";

import { useId } from "react";
import { AlertTriangle, Check, ChevronRight, EyeOff, Pencil, X } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { FIELD_READING_LABELS, fieldReading } from "@/core/extraction/reading";
import { stockTone } from "@/config/counter-tone";
import { cn } from "@/lib/utils";
import { SpecialtyLink } from "./specialty-link";
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
  awaitingValidation,
  catalogAttribution,
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
  /** Les lignes ont été retenues par la lecture ; personne n'a encore validé. */
  awaitingValidation: boolean;
  catalogAttribution: string | null;
}) {
  if (!editing) {
    return (
      <PrescriptionSummary
        lines={lines}
        onEdit={onEdit}
        canEdit={canEdit}
        simulatedExtraction={simulatedExtraction}
        awaitingValidation={awaitingValidation}
        catalogAttribution={catalogAttribution}
      />
    );
  }

  const unreadableCount = lines.reduce((sum, line) => sum + line.unreadableFields.length, 0);

  return (
    <section className="space-y-3" aria-labelledby="zone-traitement">
      <ZoneTitle id="zone-traitement" step={1} title="Le traitement" />

      <SimulatedExtractionAlert shown={simulatedExtraction} />

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

/**
 * L'avertissement d'extraction simulée.
 *
 * Il suit l'ordonnance dans les deux vues. Une ordonnance fictive peut
 * désormais s'ouvrir directement sur l'écran complet, sans passer par la
 * saisie : si cette phrase ne vivait que dans la vue d'édition, elle
 * disparaîtrait précisément du chemin le plus court.
 */
function SimulatedExtractionAlert({ shown }: { shown: boolean }) {
  if (!shown) return null;
  return (
    <Alert tone="danger" title="Extraction simulée">
      Aucune image n&apos;a été analysée. Le contenu ci-dessous est un scénario fictif de
      démonstration : il ne correspond à aucune ordonnance réelle.
    </Alert>
  );
}

/** Vue repliée : ce que le pharmacien a besoin de relire d'un coup d'œil. */
function PrescriptionSummary({
  lines,
  onEdit,
  canEdit,
  simulatedExtraction,
  awaitingValidation,
  catalogAttribution,
}: {
  lines: SaleLineDraft[];
  onEdit: () => void;
  canEdit: boolean;
  simulatedExtraction: boolean;
  awaitingValidation: boolean;
  catalogAttribution: string | null;
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

      <SimulatedExtractionAlert shown={simulatedExtraction} />

      {/* Ce que la machine a fait, et ce qu'elle n'a pas fait. Un écran qui
          affiche des lignes sans dire qui les a retenues laisserait croire
          qu'un professionnel les a relues. Le texte lu sur l'ordonnance
          s'affiche sous chaque ligne, pour que la relecture soit possible ici,
          sans ouvrir « Corriger ». */}
      {awaitingValidation && (
        <Alert
          tone="warning"
          title={`${confirmed.length} ligne${confirmed.length > 1 ? "s" : ""} retenue${
            confirmed.length > 1 ? "s" : ""
          } par la lecture, pas encore validée${confirmed.length > 1 ? "s" : ""}`}
        >
          Chaque champ a été lu au-dessus du seuil de relecture : aucune case n&apos;était à
          cocher. Aucun professionnel ne les a relues pour autant — c&apos;est votre validation,
          en bas de l&apos;écran, qui en fait un acte signé.
        </Alert>
      )}

      <Card>
        <CardContent className="pt-3 pb-3">
          <ul className="divide-y divide-border-subtle">
            {confirmed.map((line) => (
              <SummaryLine
                key={line.id}
                line={line}
                canEdit={canEdit}
                showRawText={awaitingValidation}
                attribution={catalogAttribution}
              />
            ))}
            {confirmed.length === 0 && (
              <li className="py-3 text-[13px] text-text-tertiary">Aucune ligne confirmée.</li>
            )}
          </ul>

          {/* La licence du catalogue national impose de mentionner la source et
              sa date partout où ses données sont affichées. Une fois pour la
              carte entière : la répéter sous chaque ligne occupait quatre fois
              la place pour la même phrase. */}
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

/**
 * Une ligne d'ordonnance, en une ligne.
 *
 * Niveau 1 — ce qui est prescrit, et si l'officine l'a. Niveau 2 — la
 * composition officielle, les conditions de délivrance et l'explication du
 * traitement, à un clic. Un pharmacien qui délivre un traitement qu'il connaît
 * n'a pas besoin de relire la composition à chaque fois ; celui qui a un doute
 * l'ouvre.
 *
 * Exception : une ligne NON rattachée reste dépliée. Ce n'est pas un détail,
 * c'est une action qui lui revient.
 */
function SummaryLine({
  line,
  canEdit,
  showRawText,
  attribution,
}: {
  line: SaleLineDraft;
  canEdit: boolean;
  /** Affiche le texte lu sur l'ordonnance, pour permettre la relecture ici. */
  showRawText?: boolean;
  attribution: string | null;
}) {
  // Quand la ligne est rattachée, l'explication vit dans le repli ci-dessous.
  const hasDetail = Boolean(line.official);

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

      {/* Le texte brut, jamais réécrit. C'est lui qu'on compare au papier — et
          la seule chose qui rende la relecture possible sans rouvrir la
          saisie. */}
      {showRawText && line.rawText && (
        <p className="mt-0.5 text-[12px] leading-4 text-text-tertiary">
          Lu sur l&apos;ordonnance : «&nbsp;{line.rawText}&nbsp;»
        </p>
      )}

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

      {!hasDetail && line.explanationSource === "UNAVAILABLE" && (
        <p className="mt-0.5 text-[12px] leading-4 text-warning-700 dark:text-warning-500">
          Aucune information dans le référentiel connecté : aucune explication n&apos;est
          produite pour ce médicament.
        </p>
      )}
    </li>
  );
}

/** Ce que l'officine détient, en trois mots. */
const AVAILABILITY_TEXT: Record<string, string> = {
  IN_STOCK: "En stock",
  REFERENCED_EMPTY: "Stock à zéro",
  NOT_REFERENCED: "Hors stock",
  // UNKNOWN : la ligne n'est pas rattachée. Ne pas savoir n'est pas une
  // rupture, et l'écran ne doit jamais laisser croire le contraire — c'est la
  // règle de couleur qui l'empêche, pas une vigilance de relecteur.
  UNKNOWN: "Disponibilité inconnue",
};

/** L'état du stock, en trois mots et une couleur — celle de la règle. */
function AvailabilityChip({ availability }: { availability: SaleLineDraft["availability"] }) {
  if (!availability) return null;

  const { state, quantity } = availability;
  return (
    <Badge tone={stockTone(state)}>
      {AVAILABILITY_TEXT[state] ?? AVAILABILITY_TEXT.UNKNOWN}
      {state === "IN_STOCK" && ` · ${quantity}`}
    </Badge>
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
  const nameUncertain =
    fieldReading({
      unreadable: unreadable.has("drugName"),
      confidence: line.confidence.drugName,
    }) === "TO_CHECK";

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
          <FieldWithReading
            label="Médicament"
            value={line.drugName}
            onChange={(value) => onChange({ drugName: value })}
            confidence={line.confidence.drugName}
            unreadable={unreadable.has("drugName")}
            required
          />
          <FieldWithReading
            label="Dosage"
            value={line.dosage}
            onChange={(value) => onChange({ dosage: value })}
            confidence={line.confidence.dosage}
            unreadable={unreadable.has("dosage")}
          />
          <FieldWithReading
            label="Forme"
            value={line.form}
            onChange={(value) => onChange({ form: value })}
            confidence={line.confidence.form}
            unreadable={unreadable.has("form")}
          />
        </div>

        <FieldWithReading
          label="Posologie"
          value={line.posology}
          onChange={(value) => onChange({ posology: value })}
          confidence={line.confidence.posology}
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
          <FieldWithReading
            label="Instructions"
            value={line.instructions}
            onChange={(value) => onChange({ instructions: value })}
            confidence={line.confidence.instructions}
            unreadable={unreadable.has("instructions")}
          />
        </div>

        {nameUncertain && (
          <Alert tone="warning" icon={<AlertTriangle className="size-[18px]" />}>
            Le nom du médicament n&apos;a pas été lu avec une certitude suffisante. Vérifiez-le
            sur l&apos;ordonnance avant de confirmer.
          </Alert>
        )}

        <ReadingScores line={line} />
      </CardContent>
    </Card>
  );
}

/** Les champs mesurés par la lecture, dans l'ordre où ils s'affichent au-dessus. */
const MEASURED_FIELDS = [
  { key: "drugName", label: "Médicament" },
  { key: "dosage", label: "Dosage" },
  { key: "form", label: "Forme" },
  { key: "posology", label: "Posologie" },
  { key: "instructions", label: "Instructions" },
] as const;

/**
 * Le détail technique de la lecture — replié.
 *
 * Les chiffres ne disparaissent pas du produit : ils quittent le parcours du
 * comptoir. Un pharmacien qui veut comprendre pourquoi un champ est signalé
 * les ouvre ; celui qui délivre n'a pas à les traverser pour atteindre le
 * bouton « Confirmée ».
 */
function ReadingScores({ line }: { line: SaleLineDraft }) {
  const unreadable = new Set(line.unreadableFields);
  const rows = MEASURED_FIELDS.map((field) => ({
    ...field,
    confidence: line.confidence[field.key],
    state: fieldReading({
      unreadable: unreadable.has(field.key),
      confidence: line.confidence[field.key],
    }),
  })).filter((row) => row.state !== "NO_SIGNAL");

  if (rows.length === 0) return null;

  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[12px] text-text-tertiary transition-colors hover:text-text-secondary">
        <ChevronRight className="size-3 shrink-0 transition-transform group-open:rotate-90" />
        Détail technique de la lecture
      </summary>
      <ul className="mt-1.5 space-y-1 pl-[1.125rem]">
        {rows.map((row) => (
          <li
            key={row.key}
            className="flex items-baseline justify-between gap-3 text-[11.5px] text-text-tertiary"
          >
            <span>{row.label}</span>
            <span className="tabular">
              {row.state === "UNREADABLE"
                ? "aucune lecture retenue"
                : `${Math.round((row.confidence ?? 0) * 100)} %`}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 pl-[1.125rem] text-[11px] leading-4 text-text-tertiary">
        Confiance annoncée par la lecture automatique. Elle ne vaut pas vérification : seule
        votre confirmation de la ligne engage l&apos;analyse.
      </p>
    </details>
  );
}

/**
 * Un champ extrait, avec son état de lecture — pas son pourcentage.
 *
 * « Illisible », « À vérifier », « Lu » : trois mots qui disent quoi faire.
 * Le chiffre qui les a produits est sous « Détail technique de la lecture »,
 * au bas de la ligne.
 */
function FieldWithReading({
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
  confidence: number | null | undefined;
  unreadable: boolean;
  required?: boolean;
}) {
  // `useId` garantit un identifiant stable entre serveur et client — sans quoi
  // l'association label/champ casse à l'hydratation.
  const id = useId();
  const state = fieldReading({ unreadable, confidence });
  const uncertain = state === "TO_CHECK";

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
        {state === "UNREADABLE" ? (
          <Badge tone="danger" icon={<EyeOff className="size-3" />}>
            {FIELD_READING_LABELS.UNREADABLE.label}
          </Badge>
        ) : state === "TO_CHECK" ? (
          <Badge tone="warning" title={FIELD_READING_LABELS.TO_CHECK.description}>
            {FIELD_READING_LABELS.TO_CHECK.label}
          </Badge>
        ) : state === "READ" ? (
          <Badge tone="success" title={FIELD_READING_LABELS.READ.description}>
            {FIELD_READING_LABELS.READ.label}
          </Badge>
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
