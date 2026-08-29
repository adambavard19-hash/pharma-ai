"use client";

import { useActionState, useState } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";
import { importProductsAction } from "@/server/actions/products";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import type { ActionResult } from "@/server/actions/types";

export function ImportForm() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState<
    ActionResult<{ created: number; updated: number; errors: number }> | null,
    FormData
  >(importProductsAction, null);

  return (
    <form action={formAction} className="space-y-4">
      {state?.ok === false && <Alert tone="danger">{state.error}</Alert>}
      {state?.ok === true && (
        <Alert
          tone={state.data.errors > 0 ? "warning" : "success"}
          title="Import terminé"
        >
          {state.message}
        </Alert>
      )}

      <label
        htmlFor="file"
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-default bg-surface-sunken/40 px-6 py-10 text-center transition-colors hover:border-brand-400 hover:bg-brand-50/40 dark:hover:bg-brand-950/30"
      >
        <FileSpreadsheet className="size-7 text-text-tertiary" />
        <span className="text-[13.5px] font-medium text-text-primary">
          {fileName ?? "Choisir un fichier CSV"}
        </span>
        <span className="text-[12px] text-text-tertiary">5 Mo maximum</span>
        <input
          id="file"
          name="file"
          type="file"
          accept=".csv,text/csv"
          required
          className="sr-only"
          onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
        />
      </label>

      <Button
        type="submit"
        className="w-full"
        loading={pending}
        disabled={!fileName}
        leadingIcon={<Upload className="size-[18px]" />}
      >
        Lancer l&apos;import
      </Button>
    </form>
  );
}
