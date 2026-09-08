"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Camera, Check, FileText, Keyboard, Loader2, Pill, ScanBarcode, Search, UserRound, X } from "lucide-react";
import { createPrescriptionAction } from "@/server/actions/prescriptions";
import type {
  DepotOrdonnanceEvenement,
  DepotOrdonnanceReponse,
} from "@/app/api/ordonnances/depot/route";
import { readEventStream } from "@/lib/event-stream";
import { downscaleForUpload } from "@/lib/image";
import type { PrescriptionUploadResult } from "@/server/services/prescription-upload";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { PatientOption } from "@/components/app/patient-picker";
import type { DrugLookupResult } from "@/app/api/medicaments/recherche/route";
import { BarcodeScanner } from "./barcode-scanner";
import { PatientAssociationModal } from "./patient-association";
import { PrescriptionSourceModal } from "./prescription-source";

type DraftLine = { key: string; drugName: string; form: string };

/** Mêmes bornes que le serveur : refuser ici évite un envoi pour rien. */
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/**
 * Le départ d'une délivrance.
 *
 * Une page, trois gestes, et c'est tout : scanner, saisir, ou joindre
 * l'ordonnance. Le patient n'ouvre plus le parcours — il se rattache quand on
 * le connaît, et l'ordonnance le donne souvent d'elle-même. Faire commencer
 * par « qui est-ce ? » obligeait à répondre à une question dont on n'a pas
 * toujours la réponse, avant de pouvoir faire quoi que ce soit.
 */
export function NewPrescriptionForm({
  patients,
  preselectedPatientId,
  canReadPrescriptions,
}: {
  patients: PatientOption[];
  preselectedPatientId: string | null;
  canReadPrescriptions: boolean;
}) {
  const [patient, setPatient] = useState<PatientOption | null>(
    () => patients.find((item) => item.id === preselectedPatientId) ?? null,
  );
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [upload, setUpload] = useState<PrescriptionUploadResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [readingStage, setReadingStage] = useState<ReadingStage | null>(null);

  const [mode, setMode] = useState<"IDLE" | "SAISIE" | "DOUCHETTE">("IDLE");
  const [sourceOuverte, setSourceOuverte] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Ouvre le sélecteur de fichiers du système.
   *
   * Appelé DIRECTEMENT depuis le clic de l'utilisateur, sans `await` ni
   * minuteur avant : c'est la condition pour que le navigateur considère le
   * geste comme actif et laisse macOS afficher son Finder. Un appel différé,
   * même d'un tick, est silencieusement ignoré.
   *
   * `value` est vidée AVANT l'ouverture, jamais dans le gestionnaire de
   * `change` : une annulation déclenche elle aussi un `change`, et remettre la
   * valeur à zéro à ce moment rouvrait la boîte de dialogue en boucle. La
   * vider ici permet en plus de re-choisir deux fois le même fichier.
   */
  const ouvrirSelecteur = () => {
    const input = fileInputRef.current;
    if (!input) return;
    input.value = "";
    input.click();
  };
  const [scannerOuvert, setScannerOuvert] = useState(false);
  const [associationOuverte, setAssociationOuverte] = useState(false);
  const [suggestionRejetee, setSuggestionRejetee] = useState(false);

  const [fileError, setFileError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { push } = useToast();

  const addLine = (drugName: string, form = "") =>
    setLines((current) => [...current, { key: crypto.randomUUID(), drugName, form }]);

  const hasContent = lines.length > 0 || upload !== null;

  const sendFile = (chosen: File | null) => {
    setFileError(null);
    if (!chosen) return;

    if (!ACCEPTED_MIME.has(chosen.type)) {
      setFileError("Format non pris en charge. Utilisez un PDF ou une photo (JPG, PNG, WEBP).");
      return;
    }
    if (chosen.size > MAX_FILE_BYTES) {
      setFileError("Ce fichier dépasse 10 Mo. Choisissez un fichier plus léger.");
      return;
    }

    setUploading(true);
    setReadingStage({ stage: "SENDING" });

    // Route Handler, et non Server Action : une action plafonne le corps de
    // la requête à 1 Mo et rendait une page d'erreur Next dès la première
    // vraie photo d'ordonnance. La réponse arrive en flux : l'écran suit
    // chaque étape réelle du dépôt et de la lecture.
    void (async () => {
      try {
        // Réduite ici, avant l'envoi : dix fois moins d'octets sur le réseau
        // de l'officine, pour la même lecture.
        const toSend = await downscaleForUpload(chosen);
        const data = new FormData();
        data.set("file", toSend, chosen.name);
        const response = await fetch("/api/ordonnances/depot", { method: "POST", body: data });
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as DepotOrdonnanceReponse | null;
          setFileError(payload && !payload.ok ? payload.error : "L'envoi a échoué. Réessayez.");
          return;
        }
        let outcome: DepotOrdonnanceEvenement | null = null;
        await readEventStream<DepotOrdonnanceEvenement>(response, (event) => {
          if (event.type === "stage") {
            setReadingStage({ stage: event.stage, sizeBytes: event.sizeBytes, lines: event.lines });
          } else {
            outcome = event;
          }
        });
        const final = outcome as DepotOrdonnanceEvenement | null;
        if (!final || final.type === "stage") {
          setFileError("La lecture s'est interrompue. Réessayez.");
          return;
        }
        if (final.type === "error") {
          setFileError(final.error);
          return;
        }
        setUpload(final.data);
        setSuggestionRejetee(false);
        const lues = final.data.extraction?.lines.length ?? 0;
        push({
          tone: "success",
          title:
            lues > 0
              ? `${chosen.name} lue : ${lues} médicament${lues > 1 ? "s" : ""}.`
              : `${chosen.name} ajoutée.`,
        });
      } catch {
        setFileError("L'envoi a échoué. Vérifiez votre connexion et réessayez.");
      } finally {
        setUploading(false);
        setReadingStage(null);
      }
    })();
  };

  const submit = () => {
    setError(null);
    const data = new FormData();
    data.set("source", upload ? "IMAGE_UPLOAD" : "MANUAL");
    if (patient) data.set("patientId", patient.id);
    if (upload) {
      data.set("storedFileKey", upload.fileKey);
      data.set("storedFileName", upload.fileName);
      data.set("storedFileMimeType", upload.mimeType);
      // La lecture faite au dépôt part entière : posologies, durées,
      // quantités, prescripteur, date. Rien n'est relu, rien n'est perdu.
      if (upload.extraction) data.set("extractionJson", JSON.stringify(upload.extraction));
    }
    if (lines.length > 0) {
      data.set(
        "manualLines",
        JSON.stringify(lines.map(({ drugName, form }) => ({ drugName, form }))),
      );
    }

    startTransition(async () => {
      const result = await createPrescriptionAction(null, data);
      if (!result?.ok) {
        setError(result?.error ?? "La délivrance n'a pas pu être ouverte.");
        return;
      }
      router.push(`/vente/${result.data.prescriptionId}`);
    });
  };

  const suggestion =
    upload?.suggestedPatient && !patient && !suggestionRejetee ? upload.suggestedPatient : null;

  return (
    <div className="space-y-5">
      {error && <Alert tone="danger">{error}</Alert>}

      {/* Le patient, en bandeau : une information, pas une étape. */}
      <div className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-card px-4 py-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full",
            patient
              ? "bg-success-600 text-white"
              : "bg-surface-sunken text-text-tertiary",
          )}
        >
          {patient ? <Check className="size-5" strokeWidth={2.5} /> : <UserRound className="size-[18px]" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-medium text-text-primary">
            {patient ? `${patient.firstName} ${patient.lastName.toUpperCase()}` : "Patient non identifié"}
          </span>
          {patient?.email && (
            <span className="block truncate text-[12px] text-text-tertiary">{patient.email}</span>
          )}
        </span>
        <button
          type="button"
          onClick={() => setAssociationOuverte(true)}
          className="shrink-0 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-brand-700 transition-colors hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-950"
        >
          {patient ? "Changer" : "Associer"}
        </button>
      </div>

      {/* Nom lu sur l'ordonnance : proposé, jamais appliqué d'office. */}
      {suggestion && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-brand-300 bg-brand-50/70 px-4 py-3 dark:border-brand-800 dark:bg-brand-950/50">
          <span className="min-w-0 flex-1 text-[13.5px] text-text-primary">
            Lu sur l&apos;ordonnance :{" "}
            <span className="font-semibold">
              {suggestion.firstName} {suggestion.lastName.toUpperCase()}
            </span>
          </span>
          <Button
            size="sm"
            onClick={() =>
              setPatient({
                id: suggestion.id,
                firstName: suggestion.firstName,
                lastName: suggestion.lastName,
                reference: "",
                email: suggestion.email,
              })
            }
          >
            Associer
          </Button>
          <button
            type="button"
            onClick={() => setSuggestionRejetee(true)}
            className="text-[13px] text-text-tertiary underline underline-offset-2"
          >
            Ignorer
          </button>
        </div>
      )}

      {/* Les quatre gestes, nommés par ce qu'ils sont. Une douchette n'est
          pas une caméra : elle tape le code dans un champ, comme un clavier.
          Les deux passent par la même recherche — c'est le champ qui change
          de consigne, pas la mécanique. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <BigAction
          icon={<Keyboard className="size-7" />}
          title="Clavier"
          subtitle="Nom du médicament"
          active={mode === "SAISIE"}
          onClick={() => setMode(mode === "SAISIE" ? "IDLE" : "SAISIE")}
        />
        <BigAction
          icon={<ScanBarcode className="size-7" />}
          title="Douchette"
          subtitle="Code CIP de la boîte"
          active={mode === "DOUCHETTE"}
          onClick={() => setMode(mode === "DOUCHETTE" ? "IDLE" : "DOUCHETTE")}
        />
        <BigAction
          icon={<Camera className="size-7" />}
          title="Caméra"
          subtitle="Scanner le code-barres"
          active={scannerOuvert}
          onClick={() => setScannerOuvert(true)}
        />
        <BigAction
          icon={<FileText className="size-7" />}
          title="Ordonnance"
          subtitle="Photo ou fichier"
          active={sourceOuverte || upload !== null}
          onClick={() => setSourceOuverte(true)}
        />
      </div>

      {(mode === "SAISIE" || mode === "DOUCHETTE") && (
        <DrugField
          scanner={mode === "DOUCHETTE"}
          onAdd={(nom, forme) => {
            addLine(nom, forme);
            push({ tone: "success", title: `${nom} ajouté.` });
          }}
        />
      )}

      {uploading && <ReadingIndicator stage={readingStage} />}

      {fileError && <Alert tone="danger">{fileError}</Alert>}

      {upload && (
        <div className="flex items-center gap-3 rounded-xl border border-success-300 bg-success-50/60 px-4 py-3 dark:border-success-800 dark:bg-success-900/20">
          <FileText className="size-[18px] shrink-0 text-success-700 dark:text-success-400" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-medium text-text-primary">
              {upload.fileName}
            </span>
            <span className="block text-[12px] text-text-tertiary">
              ✓ Ordonnance ajoutée · {formatSize(upload.sizeBytes)}
              {upload.wasRead
                ? upload.lines.length > 0
                  ? ` · ${upload.lines.length} médicament(s) lu(s)`
                  : " · aucun médicament lu"
                : ""}
            </span>
          </span>
          <button
            type="button"
            onClick={() => setSourceOuverte(true)}
            className="shrink-0 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-brand-700 transition-colors hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-950"
          >
            Remplacer
          </button>
          <button
            type="button"
            onClick={() => setUpload(null)}
            className="shrink-0 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-text-tertiary transition-colors hover:bg-surface-sunken hover:text-danger-600"
          >
            Supprimer
          </button>
        </div>
      )}

      {/* Lecteur branché mais rien de lisible : on le dit en français, sans
          jamais montrer une trace technique au pharmacien. */}
      {upload?.wasRead && upload.lines.length === 0 && (
        <p className="text-[12.5px] leading-5 text-warning-700 dark:text-warning-500">
          Nous n&apos;avons pas réussi à lire cette ordonnance. Réessayez avec une photo plus
          nette, ou saisissez les médicaments avec « Scanner » ou « Saisir ».
        </p>
      )}

      {upload && !canReadPrescriptions && !upload.extraction && lines.length === 0 && (
        <p className="text-[12.5px] leading-5 text-text-tertiary">
          La lecture automatique n&apos;est pas activée : ajoutez les médicaments avec
          « Scanner » ou « Saisir ». L&apos;ordonnance reste jointe à la délivrance.
        </p>
      )}

      {upload?.extraction && upload.extraction.lines.length > 0 && (
        <div className="space-y-2">
          {(upload.extraction.prescriberName.value ||
            upload.extraction.prescribedAt.value) && (
            <p className="text-[12.5px] text-text-tertiary">
              {[
                upload.extraction.prescriberName.value,
                upload.extraction.prescribedAt.value
                  ? `le ${formatDateFr(upload.extraction.prescribedAt.value)}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          <ul className="space-y-1.5">
            {upload.extraction.lines.map((line) => (
              <li
                key={line.position}
                className="flex items-start gap-3 rounded-xl border border-brand-200 bg-brand-50/40 px-4 py-3 dark:border-brand-800 dark:bg-brand-950/30"
              >
                <Pill className="mt-0.5 size-[18px] shrink-0 text-brand-600 dark:text-brand-400" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-medium text-text-primary">
                    {line.drugName.value ?? "Médicament illisible"}
                    {line.dosage.value && (
                      <span className="font-normal text-text-secondary"> {line.dosage.value}</span>
                    )}
                  </span>
                  <span className="block truncate text-[12.5px] text-text-secondary">
                    {[
                      line.posology.value,
                      line.durationDays.value ? `${line.durationDays.value} j` : null,
                      line.quantity.value ? `${line.quantity.value} boîte${line.quantity.value > 1 ? "s" : ""}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "posologie à saisir au comptoir"}
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-medium text-brand-800 dark:bg-brand-900 dark:text-brand-200">
                  lu sur l&apos;ordonnance
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {lines.length > 0 && (
        <ul className="space-y-1.5">
          {lines.map((line) => (
            <li
              key={line.key}
              className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-card px-4 py-3"
            >
              <Pill className="size-[18px] shrink-0 text-brand-600 dark:text-brand-400" />
              <span className="min-w-0 flex-1 truncate text-[14px] text-text-primary">
                {line.drugName}
              </span>
              <button
                type="button"
                onClick={() => setLines((current) => current.filter((i) => i.key !== line.key))}
                aria-label={`Retirer ${line.drugName}`}
                className="shrink-0 rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-surface-sunken hover:text-danger-600"
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {hasContent && (
        <div className="sticky bottom-4 z-10">
          <Button
            size="xl"
            className="w-full shadow-lg"
            loading={pending && !uploading}
            onClick={submit}
            trailingIcon={pending ? undefined : <ArrowRight className="size-5" />}
          >
            {pending && !uploading ? "Ouverture…" : "Continuer"}
          </Button>
        </div>
      )}

      {scannerOuvert && (
        <BarcodeScanner
          onDetected={(code) => {
            setScannerOuvert(false);
            void resolveCode(code, addLine, push);
          }}
          onFallback={() => {
            setScannerOuvert(false);
            setMode("SAISIE");
          }}
          onClose={() => setScannerOuvert(false)}
        />
      )}

      {/* Le champ de fichier vit ICI, monté en permanence, hors de toute
          fenêtre. Une modale qui se ferme, un focus qui part vers le
          sélecteur macOS, un rendu React : rien de tout cela ne peut le
          démonter pendant que l'utilisateur choisit son fichier. C'est la
          cause des échecs précédents — le champ disparaissait avant que le
          navigateur ne rende la main. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        aria-label="Choisir un fichier d'ordonnance"
        className="sr-only"
        onChange={(event) => {
          const chosen = event.target.files?.[0] ?? null;
          if (!chosen) return;
          setSourceOuverte(false);
          sendFile(chosen);
        }}
      />

      <PrescriptionSourceModal
        open={sourceOuverte}
        onClose={() => setSourceOuverte(false)}
        onOpenFilePicker={ouvrirSelecteur}
        onFile={sendFile}
      />

      <PatientAssociationModal
        open={associationOuverte}
        patients={patients}
        onClose={() => setAssociationOuverte(false)}
        onSelect={(chosen) => {
          setPatient(chosen);
          setAssociationOuverte(false);
        }}
        onDetach={() => {
          setPatient(null);
          setAssociationOuverte(false);
        }}
      />
    </div>
  );
}

/** Résout un code-barres scanné en médicament du catalogue. */
async function resolveCode(
  code: string,
  addLine: (drugName: string, form?: string) => void,
  push: (toast: { tone: "success" | "error" | "warning"; title: string }) => void,
) {
  try {
    const response = await fetch(`/api/medicaments/recherche?q=${encodeURIComponent(code)}`);
    const data = (await response.json()) as { results: DrugLookupResult[] };
    const found = data.results?.[0];
    if (found) {
      addLine(found.name, found.form ?? "");
      push({ tone: "success", title: `${found.name} ajouté.` });
      return;
    }
  } catch {
    // Réseau indisponible : on garde le code, le pharmacien tranchera.
  }
  addLine(`Code ${code}`, "");
  push({ tone: "warning", title: `Code ${code} inconnu du catalogue — ajouté tel quel.` });
}

function BigAction({
  icon,
  title,
  subtitle,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-2.5 rounded-2xl border-2 px-4 py-7 text-center",
        "transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
        active
          ? "border-brand-600 bg-brand-600 text-white shadow-md"
          : "border-border-default bg-surface-card hover:border-brand-400",
      )}
      aria-pressed={active}
    >
      <span
        className={cn(
          "flex size-14 items-center justify-center rounded-2xl transition-colors",
          active ? "bg-white/15 text-white" : "bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-400",
        )}
      >
        {icon}
      </span>
      <span>
        <span
          className={cn(
            "block text-[17px] leading-6 font-semibold tracking-[-0.01em]",
            active ? "text-white" : "text-text-primary",
          )}
        >
          {title}
        </span>
        <span className={cn("mt-0.5 block text-[12.5px]", active ? "text-white/80" : "text-text-tertiary")}>
          {subtitle}
        </span>
      </span>
    </button>
  );
}

/**
 * Le champ unique de saisie.
 *
 * Autofocus, résultat immédiat, ajout immédiat. Une douchette tape très vite
 * et termine par « Entrée » : le champ ajoute alors le résultat unique sans
 * clic, ou le texte tel quel si le catalogue ne connaît pas le code.
 */
function DrugField({ onAdd, scanner = false }: { onAdd: (drugName: string, form: string) => void; scanner?: boolean }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DrugLookupResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const needle = query.trim();
    const controller = new AbortController();

    const timer = setTimeout(async () => {
      if (needle.length < 2) {
        setResults([]);
        setSearched(false);
        return;
      }
      setLoading(true);
      try {
        const response = await fetch(
          `/api/medicaments/recherche?q=${encodeURIComponent(needle)}`,
          { signal: controller.signal },
        );
        if (response.ok) {
          const data = (await response.json()) as { results: DrugLookupResult[] };
          setResults(data.results);
          setSearched(true);
        }
      } catch {
        // Requête annulée.
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  const take = (drugName: string, form: string) => {
    onAdd(drugName, form);
    setQuery("");
    setResults([]);
    setSearched(false);
    inputRef.current?.focus();
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-text-tertiary">
          {loading ? <Loader2 className="size-5 animate-spin" /> : <Search className="size-5" />}
        </span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          autoFocus
          autoComplete="off"
          placeholder={scanner ? "Passez la douchette sur la boîte (code CIP)" : "Tapez le nom du médicament"}
          aria-label={scanner ? "Code CIP lu par la douchette" : "Saisir un médicament"}
          inputMode={scanner ? "numeric" : "text"}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            if (results.length >= 1) take(results[0].name, results[0].form ?? "");
            else if (query.trim()) take(query.trim(), "");
          }}
          className={cn(
            "h-14 w-full rounded-xl border-2 border-brand-500 bg-surface-card py-3.5 pr-4 pl-12",
            "text-[16px] text-text-primary placeholder:text-text-tertiary",
            "focus:ring-4 focus:ring-brand-500/15 focus:outline-none",
          )}
        />
      </div>

      {results.length > 0 && (
        <ul className="max-h-72 overflow-y-auto rounded-xl border border-border-default bg-surface-card">
          {results.map((result) => (
            <li key={result.presentationId} className="border-b border-border-subtle last:border-0">
              <button
                type="button"
                onClick={() => take(result.name, result.form ?? "")}
                className="w-full px-4 py-3 text-left transition-colors hover:bg-surface-sunken"
              >
                <span className="block truncate text-[14px] text-text-primary">{result.name}</span>
                <span className="block truncate text-[11.5px] text-text-tertiary">
                  {[result.form, result.substances.join(", ")].filter(Boolean).join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {searched && !loading && results.length === 0 && query.trim().length >= 2 && (
        <div className="rounded-xl border border-dashed border-border-default px-4 py-3">
          <p className="text-[13.5px] text-text-secondary">
            Rien au catalogue pour « {query.trim()} ».
          </p>
          <button
            type="button"
            onClick={() => take(query.trim(), "")}
            className="mt-1 text-[13.5px] font-medium text-brand-700 underline underline-offset-2 dark:text-brand-400"
          >
            L&apos;ajouter tel quel
          </button>
        </div>
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return "moins de 1 Ko";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
}

/** « 2026-09-02 » → « 02/09/2026 », sans rien deviner si la forme diffère. */
function formatDateFr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

type ReadingStage = {
  stage: "SENDING" | "RECEIVED" | "STORED" | "PREPARED" | "READING" | "READ";
  sizeBytes?: number;
  lines?: number;
};

const READING_STEPS: { key: ReadingStage["stage"][]; label: string; done: string }[] = [
  { key: ["SENDING"], label: "Envoi de la photo…", done: "Photo envoyée" },
  { key: ["RECEIVED", "STORED", "PREPARED"], label: "Préparation de l'image…", done: "Image préparée" },
  { key: ["READING"], label: "Lecture de l'ordonnance…", done: "Ordonnance lue" },
];

/**
 * Ce qui se passe pendant qu'on attend — étape par étape, en vrai.
 *
 * Chaque ligne s'allume quand le serveur annonce l'étape, pas selon un
 * minuteur. La lecture elle-même dure une douzaine de secondes : le compteur
 * dit combien, et la coche arrive quand elle est réellement finie.
 */
function ReadingIndicator({ stage }: { stage: ReadingStage | null }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.round((Date.now() - started) / 1000)), 500);
    return () => clearInterval(timer);
  }, []);

  const current = stage?.stage ?? "SENDING";
  const currentIndex =
    current === "READ" ? READING_STEPS.length : READING_STEPS.findIndex((step) => step.key.includes(current));

  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50/40 px-4 py-3 dark:border-brand-800 dark:bg-brand-950/30">
      <ol className="space-y-1.5">
        {READING_STEPS.map((step, index) => {
          const done = index < currentIndex;
          const active = index === currentIndex;
          return (
            <li
              key={step.label}
              className={cn(
                "flex items-center gap-2.5 text-[13.5px] transition-colors",
                done ? "text-text-secondary" : active ? "font-medium text-text-primary" : "text-text-tertiary",
              )}
            >
              {done ? (
                <Check className="size-4 shrink-0 text-success-600 dark:text-success-500" />
              ) : active ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-brand-600 dark:text-brand-400" />
              ) : (
                <span className="size-4 shrink-0 rounded-full border border-border-default" />
              )}
              <span>{done ? step.done : step.label}</span>
              {active && index === 2 && seconds > 0 && (
                <span className="text-text-tertiary tabular">{seconds} s</span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
