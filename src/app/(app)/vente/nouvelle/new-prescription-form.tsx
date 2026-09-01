"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ChevronRight, Upload, UserRound } from "lucide-react";
import { createPrescriptionAction } from "@/server/actions/prescriptions";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/server/actions/types";

type Source = "PHOTO" | "SCAN" | "IMAGE_UPLOAD" | "PDF_UPLOAD" | "MANUAL";

/**
 * Formats acceptés, en un seul endroit : la zone de dépôt les accepte tous.
 * Demander d'abord « comment souhaitez-vous importer ? » posait au pharmacien
 * une question dont le fichier porte déjà la réponse.
 */
const ACCEPTED = "image/jpeg,image/png,image/webp,image/heic,application/pdf";

/**
 * La provenance déduite du fichier.
 *
 * Elle n'est affichée nulle part dans l'application : elle est enregistrée pour
 * la traçabilité. La déduire évite un choix inutile au comptoir — et elle reste
 * corrigeable sous « Préciser la provenance », pour l'officine qui distingue
 * vraiment un scan d'un import.
 */
function derivedSource(mimeType: string | null, fromCamera: boolean): Source {
  if (fromCamera) return "PHOTO";
  if (!mimeType) return "MANUAL";
  return mimeType === "application/pdf" ? "PDF_UPLOAD" : "IMAGE_UPLOAD";
}

const SOURCE_LABELS: { value: Source; label: string }[] = [
  { value: "PHOTO", label: "Photo prise au comptoir" },
  { value: "SCAN", label: "Document numérisé au scanner" },
  { value: "IMAGE_UPLOAD", label: "Image importée" },
  { value: "PDF_UPLOAD", label: "PDF — ordonnance électronique" },
  { value: "MANUAL", label: "Saisie manuelle, sans document" },
];

export function NewPrescriptionForm({
  patients,
  preselectedPatientId,
  scenarios,
  simulated,
}: {
  patients: { id: string; firstName: string; lastName: string; reference: string }[];
  preselectedPatientId: string | null;
  scenarios: { id: string; label: string; description: string; drugCount: number }[];
  /** Aucun moteur de lecture réel n'est branché sur cet environnement. */
  simulated: boolean;
}) {
  const [file, setFile] = useState<{ name: string; type: string } | null>(null);
  // L'appareil photo se demande sur l'attribut `capture`, qui doit être posé
  // AVANT l'ouverture du sélecteur. Un seul champ `file` est monté à la fois :
  // deux champs de même nom enverraient deux valeurs au serveur.
  const [cameraMode, setCameraMode] = useState(false);
  const openAfterSwitch = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [sourceOverride, setSourceOverride] = useState<Source | "">("");
  const [scenarioId, setScenarioId] = useState<string>(scenarios[0]?.id ?? "");
  const [state, formAction, pending] = useActionState<
    ActionResult<{ prescriptionId: string }> | null,
    FormData
  >(createPrescriptionAction, null);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) router.push(`/vente/${state.data.prescriptionId}`);
  }, [state, router]);

  // Le champ vient d'être remonté avec (ou sans) `capture` : on l'ouvre. Le
  // drapeau est une référence, pas un état : rouvrir le sélecteur n'est pas
  // une information que la vue doit afficher.
  useEffect(() => {
    if (!openAfterSwitch.current) return;
    openAfterSwitch.current = false;
    fileRef.current?.click();
  }, [cameraMode]);

  const source = sourceOverride || derivedSource(file?.type ?? null, cameraMode);
  const chosenScenario = scenarios.find((scenario) => scenario.id === scenarioId);

  const switchTo = (camera: boolean) => {
    if (cameraMode === camera) {
      fileRef.current?.click();
      return;
    }
    setFile(null);
    openAfterSwitch.current = true;
    setCameraMode(camera);
  };

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="source" value={source} />
      {scenarioId && <input type="hidden" name="demoScenarioId" value={scenarioId} />}

      {state?.ok === false && <Alert tone="danger">{state.error}</Alert>}

      {/* Une seule entrée. Le fichier dit lui-même s'il est une photo, un scan
          ou un PDF ; le pharmacien n'a pas à le déclarer avant de l'ouvrir. */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => switchTo(false)}
          className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-default bg-surface-sunken/40 px-6 py-12 text-center transition-colors hover:border-brand-400 hover:bg-brand-50/40 dark:hover:bg-brand-950/30"
        >
          <Upload className="size-7 text-text-tertiary" />
          <span className="text-[14px] font-medium text-text-primary">
            {file?.name ?? "Déposer l'ordonnance — photo, scan, image ou PDF"}
          </span>
          <span className="text-[12px] text-text-tertiary">
            JPEG, PNG, WEBP ou PDF · 12 Mo maximum
            {simulated ? " · facultatif, l'extraction est simulée" : ""}
          </span>
        </button>

        <input
          key={cameraMode ? "camera" : "fichier"}
          ref={fileRef}
          id="file"
          name="file"
          type="file"
          accept={cameraMode ? "image/*" : ACCEPTED}
          {...(cameraMode ? { capture: "environment" as const } : {})}
          className="sr-only"
          onChange={(event) => {
            const picked = event.target.files?.[0];
            setFile(picked ? { name: picked.name, type: picked.type } : null);
          }}
        />

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {/* L'appareil photo reste à portée : c'est le geste le plus fréquent
              sur tablette au comptoir. */}
          <button
            type="button"
            onClick={() => switchTo(true)}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-brand-700 hover:underline dark:text-brand-400"
          >
            <Camera className="size-3.5" />
            Prendre une photo
          </button>

          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-1 text-[12px] text-text-tertiary transition-colors hover:text-text-secondary">
              <ChevronRight className="size-3 shrink-0 transition-transform group-open:rotate-90" />
              Préciser la provenance
            </summary>
            <div className="mt-2 w-full sm:w-72">
              <Select
                value={sourceOverride}
                onChange={(event) => setSourceOverride(event.target.value as Source | "")}
                aria-label="Provenance du document"
              >
                <option value="">
                  Déduite du fichier — {SOURCE_LABELS.find((item) => item.value === source)?.label}
                </option>
                {SOURCE_LABELS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-[11.5px] leading-4 text-text-tertiary">
                Enregistrée avec l&apos;ordonnance pour la traçabilité. Sans effet sur la
                lecture.
              </p>
            </div>
          </details>
        </div>
      </div>

      <Field
        label="Patient"
        htmlFor="patientId"
        hint="Rattacher l'ordonnance permet d'utiliser le profil de santé et l'historique du patient."
      >
        <Select id="patientId" name="patientId" defaultValue={preselectedPatientId ?? ""}>
          <option value="">Aucun patient rattaché</option>
          {patients.map((patient) => (
            <option key={patient.id} value={patient.id}>
              {patient.lastName.toUpperCase()} {patient.firstName} — {patient.reference}
            </option>
          ))}
        </Select>
      </Field>

      {/* Le choix du scénario quitte le parcours principal — mais pas l'écran :
          tant que l'extraction est simulée, le pharmacien doit lire d'un coup
          d'œil CE QUI SERA restitué, sans rien ouvrir. */}
      {scenarios.length > 0 && (
        <details className="group rounded-xl border border-accent-200 bg-accent-50/50 dark:border-accent-800/60 dark:bg-accent-900/15">
          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 px-3.5 py-2.5 text-[12.5px] text-accent-900 dark:text-accent-100">
            <ChevronRight className="size-3.5 shrink-0 transition-transform group-open:rotate-90" />
            <span className="font-medium">Mode démo — tester un scénario</span>
            {chosenScenario && (
              <span className="text-accent-800 dark:text-accent-200">
                · {chosenScenario.label}
              </span>
            )}
          </summary>

          <div className="space-y-2 px-3.5 pb-3.5">
            <p className="text-[12px] leading-4 text-accent-800 dark:text-accent-200">
              Ces ordonnances sont fictives. Chacune illustre un comportement précis du
              moteur — conseil de tolérance, conseil de sécurité, champ illisible.
            </p>
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
          </div>
        </details>
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
