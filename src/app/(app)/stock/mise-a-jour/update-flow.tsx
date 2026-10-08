"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { previewStockAction, sendStockAction } from "@/server/actions/stock-deposits";
import { DEPOSIT_ACCEPTED_LABEL, DEPOSIT_CONFIRMATION, DEPOSIT_MAX_BYTES } from "@/core/stock-deposit/rules";
import type { StockPreview } from "@/core/stock-deposit/types";
import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/field";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SEND_FAILED, checkDepositFile, formatFileSize, uploadSummary, type SendOutcome } from "./view";
import { UPDATE_STEPS, confirmButtonLabel, confirmationText, needsZeroConsent, previewFacts, zeroConsentLabel } from "./preview-view";

/**
 * Mettre à jour mon stock, en trois étapes : choisir le fichier, vérifier ce qu'il contient, confirmer.
 *
 * Rien n'est écrit dans le stock avant le dernier clic. L'étape « Vérifier » lit le fichier avec les MÊMES contrôles que
 * l'envoi réel (fichier incomplet, lignes illisibles, trop de produits à zéro) et dit en clair ce qui va se passer ; si
 * des produits doivent passer à 0, une case à cocher demande la confirmation. Le serveur refait ces contrôles à
 * l'envoi et exige la confirmation : l'écran les montre, il ne les remplace pas.
 */

type Phase =
  | { name: "choose" }
  | { name: "checking"; file: File }
  | { name: "review"; file: File; preview: StockPreview }
  | { name: "confirm"; file: File; preview: StockPreview }
  | { name: "sending"; file: File; preview: StockPreview }
  | { name: "done"; outcome: SendOutcome };

const stepOf = (phase: Phase): 1 | 2 | 3 => (phase.name === "choose" ? 1 : phase.name === "checking" || phase.name === "review" ? 2 : 3);

export function UpdateFlow() {
  const [phase, setPhase] = useState<Phase>({ name: "choose" });
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [, start] = useTransition();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);

  const restart = () => {
    setPhase({ name: "choose" });
    setConsent(false);
    if (input.current) input.current.value = "";
  };

  const pick = (file: File | null) => {
    if (!file) return;
    setError(null);
    const problem = checkDepositFile(file);
    if (problem) {
      setError(problem);
      if (input.current) input.current.value = "";
      return;
    }
    setPhase({ name: "checking", file });
    start(async () => {
      try {
        const body = new FormData();
        body.set("file", file);
        const result = await previewStockAction(body);
        if (!result.ok) {
          setError(result.error);
          setPhase({ name: "choose" });
          if (input.current) input.current.value = "";
          return;
        }
        setConsent(false);
        setPhase({ name: "review", file, preview: result.data });
      } catch {
        setError("Le fichier n'a pas pu être vérifié. Vérifiez votre connexion et réessayez.");
        setPhase({ name: "choose" });
      }
    });
  };

  const send = (file: File, preview: StockPreview) => {
    setPhase({ name: "sending", file, preview });
    start(async () => {
      try {
        const body = new FormData();
        body.set("file", file);
        body.set("confirmation", DEPOSIT_CONFIRMATION);
        const result = await sendStockAction(body);
        setPhase({ name: "done", outcome: uploadSummary(result, new Date()) });
        router.refresh();
      } catch {
        setPhase({ name: "done", outcome: { tone: "danger", title: "Votre stock n'a pas été mis à jour", detail: SEND_FAILED } });
      }
    });
  };

  const step = stepOf(phase);
  const finished = phase.name === "done";

  return (
    <section aria-label="Mettre à jour mon stock" className="space-y-5 rounded-2xl border border-border-subtle bg-surface-card p-4 sm:p-6">
      <ol className="flex items-center gap-2" aria-label="Étapes">
        {UPDATE_STEPS.map((label, index) => {
          const number = index + 1;
          const done = finished ? phase.outcome.tone !== "danger" : number < step;
          const current = !finished && number === step;
          return (
            <li key={label} aria-current={current ? "step" : undefined} className="flex min-w-0 flex-1 items-center gap-2">
              <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold", done ? "bg-success-600 text-white" : current ? "bg-brand-600 text-white" : "bg-surface-sunken text-text-tertiary")}>
                {done ? <Check className="size-4" aria-hidden="true" /> : number}
              </span>
              <span className={cn("hidden truncate text-[13.5px] sm:block", current || done ? "font-medium text-text-primary" : "text-text-tertiary")}>{label}</span>
              {number < 3 && <span className="h-px min-w-3 flex-1 bg-border-default" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
      <p className="text-[13.5px] font-medium text-text-secondary sm:hidden" aria-hidden="true">
        {finished ? "Terminé" : `Étape ${step} sur 3 : ${UPDATE_STEPS[step - 1]}`}
      </p>

      <input
        ref={input}
        type="file"
        aria-label="Fichier de stock"
        accept=".csv,.txt,.xlsx,.xls,.pdf,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => pick(event.target.files?.[0] ?? null)}
      />

      {phase.name === "choose" && (
        <div className="space-y-4">
          <div>
            <h2 className="text-[20px] leading-7 font-semibold tracking-[-0.01em] text-text-primary">Choisissez le fichier de votre stock</h2>
            <p className="text-[14.5px] leading-6 text-text-secondary">Le fichier exporté de votre logiciel de pharmacie ({DEPOSIT_ACCEPTED_LABEL}, {DEPOSIT_MAX_BYTES / (1024 * 1024)} Mo au plus).</p>
          </div>
          {error && <Alert tone="danger" title="Ce fichier ne peut pas être utilisé">{error}</Alert>}
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              pick(event.dataTransfer.files?.[0] ?? null);
            }}
            className={cn("flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors", dragging ? "border-success-600 bg-success-50/60 dark:bg-success-950/20" : "border-border-default bg-surface-sunken/40")}
          >
            <FileSpreadsheet className="size-8 text-text-tertiary" aria-hidden="true" />
            <Button variant="success" size="xl" className="w-full max-w-xs rounded-full" onClick={() => input.current?.click()} leadingIcon={<Upload className="size-5" />}>
              Choisir mon fichier
            </Button>
            <p className="text-[13px] text-text-tertiary">ou glissez-le ici</p>
          </div>
          <Link href="/connexion/guide?logiciel=lgpi" className="inline-block text-[13.5px] font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800 dark:text-brand-400">
            Comment récupérer mon stock dans LGPI ?
          </Link>
        </div>
      )}

      {phase.name === "checking" && (
        <div role="status" aria-live="polite" className="flex flex-col items-center gap-3 py-8 text-center">
          <Loader2 className="size-8 animate-spin text-brand-600" aria-hidden="true" />
          <p className="text-[16px] font-medium text-text-primary">Lecture de votre fichier…</p>
          <p className="min-w-0 max-w-full truncate text-[13.5px] text-text-secondary">{phase.file.name} · cela peut prendre jusqu&apos;à une minute</p>
        </div>
      )}

      {phase.name === "review" && (
        <div className="space-y-4">
          <div>
            <h2 className="text-[20px] leading-7 font-semibold tracking-[-0.01em] text-text-primary">
              {formatNumber(phase.preview.products)} produit{phase.preview.products > 1 ? "s" : ""} dans ce fichier
            </h2>
            <p className="flex items-center gap-2 text-[13.5px] text-text-secondary">
              <FileSpreadsheet className="size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 truncate">{phase.file.name}</span>
              <span className="shrink-0 text-text-tertiary">{formatFileSize(phase.file.size)}</span>
            </p>
          </div>
          <ul className="divide-y divide-border-subtle rounded-xl border border-border-subtle">
            {previewFacts(phase.preview).map((fact) => (
              <li key={fact.key} className="flex items-start justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block text-[14.5px] leading-5 font-medium text-text-primary">{fact.label}</span>
                  {fact.hint && <span className="block text-[12.5px] leading-5 text-text-secondary">{fact.hint}</span>}
                </span>
                <span className={cn("shrink-0 text-[18px] leading-6 font-semibold tabular", fact.tone === "warning" ? "text-warning-700 dark:text-warning-400" : "text-text-primary")}>{fact.value}</span>
              </li>
            ))}
          </ul>
          {phase.preview.warnings.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-[13px] leading-5 text-text-secondary">
              {phase.preview.warnings.slice(0, 3).map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
          {phase.preview.verdict === "HOLD" ? (
            <Alert tone="warning" title="Ce fichier ne sera pas appliqué tout de suite">
              {phase.preview.reason} Vous pouvez choisir un autre fichier, ou l&apos;envoyer à l&apos;équipe PharmaBoost qui le vérifiera.
            </Alert>
          ) : (
            <p className="flex items-center gap-2 text-[14px] font-medium text-success-700 dark:text-success-400">
              <CheckCircle2 className="size-5 shrink-0" aria-hidden="true" />
              Ce fichier peut être appliqué.
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="success" size="lg" className="rounded-full sm:flex-1" onClick={() => setPhase({ name: "confirm", file: phase.file, preview: phase.preview })}>
              Continuer
            </Button>
            <Button variant="outline" size="lg" className="rounded-full" onClick={restart} leadingIcon={<ArrowLeft className="size-4" />}>
              Choisir un autre fichier
            </Button>
          </div>
        </div>
      )}

      {(phase.name === "confirm" || phase.name === "sending") && (
        <div className="space-y-4">
          <h2 className="text-[20px] leading-7 font-semibold tracking-[-0.01em] text-text-primary">Confirmer la mise à jour</h2>
          <div className={cn("space-y-3 rounded-xl border p-4", phase.preview.verdict === "HOLD" || phase.preview.absent ? "border-warning-300 bg-warning-50/60 dark:border-warning-800 dark:bg-warning-950/20" : "border-border-subtle bg-surface-sunken/50")}>
            <p className="flex items-start gap-2 text-[15px] leading-6 text-text-primary">
              {(phase.preview.verdict === "HOLD" || Boolean(phase.preview.absent)) && <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning-700 dark:text-warning-400" aria-hidden="true" />}
              <span>{confirmationText(phase.preview)}</span>
            </p>
            {needsZeroConsent(phase.preview) && (
              <Checkbox id="confirmer-zero" checked={consent} disabled={phase.name === "sending"} onChange={(event) => setConsent(event.target.checked)} label={zeroConsentLabel(phase.preview)} />
            )}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="success"
              size="lg"
              className="rounded-full sm:flex-1"
              loading={phase.name === "sending"}
              disabled={needsZeroConsent(phase.preview) && !consent}
              onClick={() => send(phase.file, phase.preview)}
            >
              {phase.name === "sending" ? "Mise à jour en cours…" : confirmButtonLabel(phase.preview)}
            </Button>
            <Button variant="outline" size="lg" className="rounded-full" disabled={phase.name === "sending"} onClick={() => setPhase({ name: "review", file: phase.file, preview: phase.preview })} leadingIcon={<ArrowLeft className="size-4" />}>
              Retour
            </Button>
          </div>
        </div>
      )}

      {phase.name === "done" && (
        <div role="status" aria-live="polite" className="space-y-4">
          <Alert tone={phase.outcome.tone} title={phase.outcome.title}>
            {phase.outcome.detail}
          </Alert>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild variant="success" size="lg" className="rounded-full sm:flex-1">
              <Link href="/stock">Voir mon stock</Link>
            </Button>
            <Button variant="outline" size="lg" className="rounded-full" onClick={restart}>
              Envoyer un autre fichier
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
