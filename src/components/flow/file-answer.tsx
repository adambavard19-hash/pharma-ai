"use client";

import { useId, useRef, useState, type DragEvent, type ReactNode } from "react";
import { FileText, Upload, X } from "lucide-react";
import { FieldMessage } from "./controls";
import { cn } from "@/lib/utils";

/** « 842 Ko », « 2,4 Mo » : la taille d'un fichier, lisible. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
  return `${(bytes / (1024 * 1024)).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
}

/**
 * Un fichier à joindre : un bouton (au clavier comme à la souris) ou un
 * glisser-déposer. Le contrôle ne juge pas le fichier : la question le fait
 * (`validate`) et le serveur, seul juge, le relit.
 */
export function FileAnswer({
  label,
  accept,
  file,
  onFileChange,
  error,
  hint,
  chooseLabel = "Choisir un fichier",
}: {
  label: string;
  /** Les types proposés dans la fenêtre de choix (« application/pdf,.pdf »). */
  accept?: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
  error?: string;
  hint?: ReactNode;
  chooseLabel?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const messageId = `${useId()}-message`;

  const pick = (next: File | null) => {
    onFileChange(next);
    // Le même fichier peut être rechoisi après l'avoir retiré.
    if (inputRef.current) inputRef.current.value = "";
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    pick(event.dataTransfer.files?.[0] ?? null);
  };

  return (
    <div>
      <input ref={inputRef} type="file" accept={accept} tabIndex={-1} className="hidden" aria-label={label} onChange={(e) => pick(e.target.files?.[0] ?? null)} />
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "rounded-2xl border border-dashed bg-surface-app p-4 transition-colors sm:p-5",
          dragging ? "border-brand-500 bg-brand-50 dark:bg-brand-950/40" : error ? "border-danger-500" : "border-border-default",
        )}
      >
        {file ? (
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200" aria-hidden="true">
              <FileText className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold text-text-primary">{file.name}</span>
              <span className="block text-[13px] text-text-secondary">{formatFileSize(file.size)}</span>
            </span>
            <button
              type="button"
              onClick={() => pick(null)}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-border-default px-3 text-[13.5px] font-medium text-text-secondary hover:bg-surface-sunken hover:text-text-primary focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
              aria-label={`Retirer ${file.name}`}
            >
              <X className="size-4" aria-hidden="true" /> Retirer
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              aria-describedby={error || hint ? messageId : undefined}
              className="inline-flex h-12 shrink-0 items-center gap-2 rounded-xl bg-brand-600 px-5 text-[15px] font-semibold text-white shadow-sm hover:bg-brand-700 focus-visible:ring-4 focus-visible:ring-brand-500/30 focus-visible:outline-none"
            >
              <Upload className="size-4" aria-hidden="true" /> {chooseLabel}
            </button>
            <span className="text-[13.5px] text-text-secondary">ou déposez-le ici.</span>
          </div>
        )}
      </div>
      <FieldMessage id={messageId} error={error} hint={hint} />
    </div>
  );
}
