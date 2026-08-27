"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, EyeOff, Sparkles, X } from "lucide-react";
import { verifyPrescriptionAction } from "@/server/actions/prescriptions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { OCR_REVIEW_THRESHOLD } from "@/config/constants";
import { cn } from "@/lib/utils";

type LineState = {
  id: string;
  position: number;
  rawText: string | null;
  drugName: string;
  dosage: string;
  form: string;
  posology: string;
  durationDays: number | null;
  quantity: number | null;
  instructions: string;
  confidence: Record<string, number>;
  unreadableFields: string[];
  confirmed: boolean;
};

/**
 * Écran de vérification humaine.
 *
 * Chaque champ affiche son niveau de confiance et signale explicitement une
 * lecture incertaine ou impossible. Rien ne part à l'analyse sans une
 * confirmation ligne à ligne.
 */
export function VerificationForm({
  prescription,
  lines: initialLines,
  patients,
}: {
  prescription: {
    id: string;
    reference: string;
    prescriberName: string | null;
    prescribedAt: string | null;
    patientId: string | null;
    ocrConfidence: number | null;
  };
  lines: LineState[];
  patients: { id: string; firstName: string; lastName: string; reference: string }[];
}) {
  const [lines, setLines] = useState<LineState[]>(initialLines);
  const [patientId, setPatientId] = useState(prescription.patientId ?? "");
  const [prescriberName, setPrescriberName] = useState(prescription.prescriberName ?? "");
  const [prescribedAt, setPrescribedAt] = useState(prescription.prescribedAt ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { push } = useToast();

  const update = (id: string, patch: Partial<LineState>) => {
    setLines((current) =>
      current.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    );
  };

  const confirmedCount = lines.filter((line) => line.confirmed).length;

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await verifyPrescriptionAction({
        prescriptionId: prescription.id,
        patientId: patientId || null,
        prescriberName,
        prescribedAt,
        lines: lines.map((line) => ({
          id: line.id,
          drugName: line.drugName,
          dosage: line.dosage,
          form: line.form,
          posology: line.posology,
          durationDays: line.durationDays ?? undefined,
          quantity: line.quantity ?? undefined,
          instructions: line.instructions,
          confirmed: line.confirmed,
        })),
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      push({
        tone: "success",
        title: "Ordonnance vérifiée",
        description: `${result.data.recommendationCount} conseil(s) proposé(s) par le moteur.`,
      });
      router.push(`/ordonnances/${prescription.id}/copilote`);
    });
  };

  return (
    <div className="space-y-5">
      {error && <Alert tone="danger">{error}</Alert>}

      <Card>
        <CardHeader title="Contexte de l'ordonnance" />
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field label="Patient" htmlFor="patientId">
            <Select
              id="patientId"
              value={patientId}
              onChange={(event) => setPatientId(event.target.value)}
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
              onChange={(event) => setPrescriberName(event.target.value)}
              placeholder="Dr …"
            />
          </Field>
          <Field label="Date de prescription" htmlFor="prescribedAt">
            <Input
              id="prescribedAt"
              type="date"
              value={prescribedAt}
              onChange={(event) => setPrescribedAt(event.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {lines.map((line, index) => (
          <LineCard
            key={line.id}
            line={line}
            index={index}
            onChange={(patch) => update(line.id, patch)}
          />
        ))}
      </div>

      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border-subtle bg-surface-card p-4 shadow-lg">
        <div className="min-w-0">
          <p className="text-[13.5px] font-medium text-text-primary">
            {confirmedCount} ligne{confirmedCount > 1 ? "s" : ""} confirmée
            {confirmedCount > 1 ? "s" : ""} sur {lines.length}
          </p>
          <p className="text-[12px] text-text-tertiary">
            Seules les lignes confirmées alimentent l&apos;analyse et la fiche patient.
          </p>
        </div>
        <Button
          size="lg"
          onClick={submit}
          loading={pending}
          disabled={confirmedCount === 0}
          leadingIcon={pending ? undefined : <Sparkles className="size-[18px]" />}
        >
          {pending ? "Analyse en cours…" : "Confirmer et analyser"}
        </Button>
      </div>
    </div>
  );
}

function LineCard({
  line,
  index,
  onChange,
}: {
  line: LineState;
  index: number;
  onChange: (patch: Partial<LineState>) => void;
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
          <div className="flex items-center gap-2">
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
          </div>
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
  // `useId` garantit un identifiant stable entre les rendus et entre le serveur
  // et le client — indispensable pour l'association label/champ.
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
