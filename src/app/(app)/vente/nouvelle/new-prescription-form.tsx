"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  FileText,
  Image as ImageIcon,
  ScanLine,
  Sparkles,
  Upload,
  UserRound,
} from "lucide-react";
import { createPrescriptionAction } from "@/server/actions/prescriptions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/server/actions/types";

type Source = "PHOTO" | "SCAN" | "IMAGE_UPLOAD" | "PDF_UPLOAD";

const SOURCES: {
  value: Source;
  label: string;
  hint: string;
  icon: typeof Camera;
  capture?: boolean;
  accept: string;
}[] = [
  {
    value: "PHOTO",
    label: "Prendre une photo",
    hint: "Appareil photo du poste ou de la tablette",
    icon: Camera,
    capture: true,
    accept: "image/*",
  },
  {
    value: "SCAN",
    label: "Scanner",
    hint: "Document numérisé au comptoir",
    icon: ScanLine,
    accept: "image/*,application/pdf",
  },
  {
    value: "IMAGE_UPLOAD",
    label: "Importer une image",
    hint: "JPEG, PNG ou WEBP",
    icon: ImageIcon,
    accept: "image/jpeg,image/png,image/webp",
  },
  {
    value: "PDF_UPLOAD",
    label: "Importer un PDF",
    hint: "Ordonnance électronique",
    icon: FileText,
    accept: "application/pdf",
  },
];

export function NewPrescriptionForm({
  patients,
  preselectedPatientId,
  scenarios,
}: {
  patients: { id: string; firstName: string; lastName: string; reference: string }[];
  preselectedPatientId: string | null;
  scenarios: { id: string; label: string; description: string; drugCount: number }[];
}) {
  const [source, setSource] = useState<Source>("PHOTO");
  const [fileName, setFileName] = useState<string | null>(null);
  const [scenarioId, setScenarioId] = useState<string>(scenarios[0]?.id ?? "");
  const [state, formAction, pending] = useActionState<
    ActionResult<{ prescriptionId: string }> | null,
    FormData
  >(createPrescriptionAction, null);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) router.push(`/vente/${state.data.prescriptionId}`);
  }, [state, router]);

  const activeSource = SOURCES.find((item) => item.value === source)!;

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="source" value={source} />
      {scenarioId && <input type="hidden" name="demoScenarioId" value={scenarioId} />}

      {state?.ok === false && <Alert tone="danger">{state.error}</Alert>}

      <fieldset className="space-y-3">
        <legend className="text-[13px] font-semibold text-text-primary">
          Comment souhaitez-vous importer l&apos;ordonnance ?
        </legend>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {SOURCES.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setSource(item.value)}
              aria-pressed={source === item.value}
              className={cn(
                "flex items-start gap-3 rounded-xl border p-4 text-left transition-all",
                source === item.value
                  ? "border-brand-500 bg-brand-50 ring-2 ring-brand-500/20 dark:bg-brand-950"
                  : "border-border-default bg-surface-card hover:border-border-strong",
              )}
            >
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-lg",
                  source === item.value
                    ? "bg-brand-600 text-white"
                    : "bg-surface-sunken text-text-tertiary",
                )}
              >
                <item.icon className="size-[18px]" />
              </span>
              <span className="min-w-0">
                <span className="block text-[13.5px] font-medium text-text-primary">
                  {item.label}
                </span>
                <span className="block text-[12px] text-text-tertiary">{item.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      <label
        htmlFor="file"
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-default bg-surface-sunken/40 px-6 py-12 text-center transition-colors hover:border-brand-400 hover:bg-brand-50/40 dark:hover:bg-brand-950/30"
      >
        <Upload className="size-7 text-text-tertiary" />
        <span className="text-[14px] font-medium text-text-primary">
          {fileName ?? `${activeSource.label} — sélectionner le fichier`}
        </span>
        <span className="text-[12px] text-text-tertiary">
          JPEG, PNG, WEBP ou PDF · 12 Mo maximum · facultatif en mode démonstration
        </span>
        <input
          id="file"
          name="file"
          type="file"
          accept={activeSource.accept}
          {...(activeSource.capture ? { capture: "environment" as const } : {})}
          className="sr-only"
          onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
        />
      </label>

      <Field
        label="Patient"
        htmlFor="patientId"
        hint="Rattacher l'ordonnance permet d'utiliser le profil de santé et l'historique du patient."
      >
        <Select
          id="patientId"
          name="patientId"
          defaultValue={preselectedPatientId ?? ""}
        >
          <option value="">Aucun patient rattaché</option>
          {patients.map((patient) => (
            <option key={patient.id} value={patient.id}>
              {patient.lastName.toUpperCase()} {patient.firstName} — {patient.reference}
            </option>
          ))}
        </Select>
      </Field>

      {scenarios.length > 0 && (
        <Card className="border-accent-200 bg-accent-50/60 dark:border-accent-800/60 dark:bg-accent-900/20">
          <CardContent className="space-y-3 pt-5">
            <div className="flex items-start gap-2.5">
              <Sparkles className="mt-0.5 size-[18px] shrink-0 text-accent-700 dark:text-accent-300" />
              <div className="space-y-0.5">
                <p className="text-[13px] font-semibold text-accent-900 dark:text-accent-100">
                  Scénario de démonstration
                </p>
                <p className="text-[12.5px] leading-5 text-accent-800 dark:text-accent-200">
                  Ces ordonnances sont fictives. Chacune illustre un comportement précis du
                  moteur — conseil de tolérance, conseil de sécurité, champ illisible.
                </p>
              </div>
            </div>

            <div className="grid gap-2">
              {scenarios.map((scenario) => (
                <button
                  key={scenario.id}
                  type="button"
                  onClick={() => setScenarioId(scenario.id)}
                  aria-pressed={scenarioId === scenario.id}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors",
                    scenarioId === scenario.id
                      ? "border-accent-500 bg-surface-card ring-2 ring-accent-500/20"
                      : "border-accent-200 bg-surface-card/70 hover:border-accent-400 dark:border-accent-800/60",
                  )}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="text-[13px] font-medium text-text-primary">
                      {scenario.label}
                    </span>
                    <span className="shrink-0 text-[11.5px] text-text-tertiary">
                      {scenario.drugCount} ligne{scenario.drugCount > 1 ? "s" : ""}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[12px] leading-4 text-text-secondary">
                    {scenario.description}
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Button
        type="submit"
        size="xl"
        className="w-full"
        loading={pending}
        leadingIcon={pending ? undefined : <UserRound className="size-5" />}
      >
        {pending ? "Extraction en cours…" : "Importer et extraire"}
      </Button>
    </form>
  );
}
