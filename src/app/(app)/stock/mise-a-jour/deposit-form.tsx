"use client";

import { useRef, useState, useTransition } from "react";
import { ChevronDown, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { sendStockAction } from "@/server/actions/stock-deposits";
import { DEPOSIT_ACCEPTED_LABEL, DEPOSIT_MAX_BYTES } from "@/core/stock-deposit/rules";
import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FULL_STOCK_REMINDER, checkDepositFile, formatFileSize, submitDeposit, type SendOutcome } from "./view";

/**
 * « Envoyer mon fichier » — pour ceux qui n'ont pas le dossier PharmaBoost.
 *
 * Une zone, un fichier, un seul bouton. Le bloc est replié : le chemin simple,
 * c'est le dossier. Il s'ouvre tout seul quand le dossier n'est pas (encore)
 * là. Le contrôle du fichier (format, poids) se fait avant l'envoi ; la
 * lecture, le garde-fou et la remise à zéro, eux, sont ceux du serveur.
 */
export function DepositForm({ defaultOpen }: { defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [outcome, setOutcome] = useState<SendOutcome | null>(null);
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const pick = (picked: File | null) => {
    setFile(picked);
    setProblem(picked ? checkDepositFile(picked) : null);
    setOutcome(null);
  };

  const send = () => {
    if (!file || problem || pending) return;
    setOutcome(null);
    startTransition(async () => {
      const { outcome: result, sent } = await submitDeposit(file, sendStockAction);
      setOutcome(result);
      // Le fichier est parti (lu, ou en vérification) : la zone est prête pour le suivant.
      if (sent) {
        setFile(null);
        if (input.current) input.current.value = "";
      }
    });
  };

  return (
    <section className="rounded-2xl border border-border-subtle bg-surface-card">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="envoi-fichier"
        className="flex w-full items-center gap-3 rounded-2xl px-5 py-4 text-left transition-colors hover:bg-surface-sunken/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      >
        <Upload className="size-5 shrink-0 text-text-tertiary" aria-hidden="true" />
        <span className="min-w-0 flex-1 text-[15px] leading-6 font-semibold text-text-primary">Je n&apos;ai pas le dossier PharmaBoost, ou je préfère envoyer le fichier ici</span>
        <ChevronDown className={cn("size-5 shrink-0 text-text-tertiary transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>

      <div id="envoi-fichier" hidden={!open} className="space-y-4 border-t border-border-subtle px-5 py-5">
        <Alert tone="info">
          <p className="font-medium text-text-primary">{FULL_STOCK_REMINDER}</p>
        </Alert>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
          className="space-y-4"
        >
          <label
            htmlFor="stock-deposit-file"
            onDragOver={(event) => {
              event.preventDefault();
              if (!pending) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              if (!pending) pick(event.dataTransfer.files?.[0] ?? null);
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-9 text-center transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-500",
              dragging ? "border-brand-500 bg-brand-50/60 dark:bg-brand-950/30" : "border-border-default bg-surface-sunken/40 hover:border-brand-400 hover:bg-brand-50/40 dark:hover:bg-brand-950/20",
              pending && "pointer-events-none opacity-60",
            )}
          >
            <FileSpreadsheet className="size-7 text-text-tertiary" aria-hidden="true" />
            <span className="text-[14.5px] font-medium text-text-primary">{file ? file.name : "Glissez votre fichier ici"}</span>
            <span className="text-[13px] text-text-secondary">
              {file ? formatFileSize(file.size) : <span className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-400">Choisir le fichier</span>}
            </span>
            <span className="text-[12px] text-text-tertiary">
              {DEPOSIT_ACCEPTED_LABEL}. {DEPOSIT_MAX_BYTES / (1024 * 1024)} Mo au plus.
            </span>
            <input
              ref={input}
              id="stock-deposit-file"
              name="file"
              type="file"
              accept=".csv,.txt,.xlsx,.xls,.pdf,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              disabled={pending}
              onChange={(event) => pick(event.target.files?.[0] ?? null)}
            />
          </label>

          {problem && <Alert tone="danger">{problem}</Alert>}

          <Button type="submit" size="lg" className="w-full sm:w-auto" loading={pending} disabled={!file || Boolean(problem)} leadingIcon={<Upload className="size-[18px]" />}>
            Envoyer
          </Button>
          <p className="text-[12.5px] text-text-secondary">En envoyant, vous confirmez que ce fichier remplace votre stock : ce qui n&apos;y figure pas passe à 0.</p>
        </form>

        <div role="status" aria-live="polite" className="space-y-3">
          {pending && (
            <p className="flex items-center gap-2 text-[14px] text-text-secondary">
              <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
              Lecture du fichier… ça peut prendre jusqu&apos;à une minute.
            </p>
          )}
          {outcome && (
            <Alert tone={outcome.tone} title={outcome.title}>
              {outcome.detail}
            </Alert>
          )}
        </div>
      </div>
    </section>
  );
}
