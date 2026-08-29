"use client";

import { useActionState, useState } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";
import { importDrugStockAction, type DrugStockImportReport } from "@/server/actions/drug-stock";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { ActionResult } from "@/server/actions/types";

/**
 * L'import en masse du stock médicament.
 *
 * Deux entrées pour la même chose : un fichier exporté du logiciel de gestion,
 * ou une liste collée. Le résultat rend chaque ligne refusée avec son numéro —
 * c'est ce qui permet de corriger un export de plusieurs milliers de lignes
 * sans le relire à l'œil.
 */
export function DrugStockImportForm() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState<
    ActionResult<DrugStockImportReport> | null,
    FormData
  >(importDrugStockAction, null);

  return (
    <form action={formAction} className="space-y-5">
      {state?.ok === false && <Alert tone="danger">{state.error}</Alert>}
      {state?.ok === true && <ImportReport report={state.data} />}

      <Field
        label="Coller une liste de codes"
        htmlFor="codes"
        hint="Un code par ligne : CIP13 ou CIP7, éventuellement suivi de la quantité (« 3400949497294;12 »)."
      >
        <Textarea
          id="codes"
          name="codes"
          rows={8}
          className="font-mono text-[12.5px]"
          placeholder={"3400949497294;12\n3400949497706;4\n4949729"}
        />
      </Field>

      <div className="flex items-center gap-3 text-[12.5px] text-text-tertiary">
        <span className="h-px flex-1 bg-border-subtle" />
        ou
        <span className="h-px flex-1 bg-border-subtle" />
      </div>

      <label
        htmlFor="file"
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-default bg-surface-sunken/40 px-6 py-8 text-center transition-colors hover:border-brand-400 hover:bg-brand-50/40 dark:hover:bg-brand-950/30"
      >
        <FileSpreadsheet className="size-7 text-text-tertiary" />
        <span className="text-[13.5px] font-medium text-text-primary">
          {fileName ?? "Choisir un fichier exporté (CSV ou texte)"}
        </span>
        <span className="text-[12px] text-text-tertiary">5 Mo maximum</span>
        <input
          id="file"
          name="file"
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          className="sr-only"
          onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
        />
      </label>

      <Field
        label="Quantité pour les lignes sans quantité"
        htmlFor="defaultQuantity"
        hint="Zéro par défaut : une liste sans quantité déclare des références connues, pas des boîtes en rayon. Une référence à zéro n'est jamais proposée au patient."
      >
        <Input
          id="defaultQuantity"
          name="defaultQuantity"
          type="number"
          min={0}
          max={999999}
          step={1}
          defaultValue={0}
          className="w-32 tabular"
        />
      </Field>

      <Button
        type="submit"
        className="w-full"
        loading={pending}
        leadingIcon={<Upload className="size-[18px]" />}
      >
        Lancer l&apos;import
      </Button>
    </form>
  );
}

function ImportReport({ report }: { report: DrugStockImportReport }) {
  const problems = report.rejected.length + report.unknown;

  return (
    <div className="space-y-3">
      <Alert
        tone={problems > 0 ? "warning" : "success"}
        title={`${report.created} référence(s) ajoutée(s), ${report.updated} mise(s) à jour`}
      >
        {report.read} ligne(s) lue(s).
        {report.unknown > 0 && (
          <>
            {" "}
            {report.unknown} code(s) bien formé(s) mais absent(s) du catalogue national —{" "}
            <strong>aucune référence n&apos;a été créée à partir d&apos;eux</strong>.
          </>
        )}
        {report.duplicates > 0 && ` ${report.duplicates} doublon(s) : la dernière valeur l'emporte.`}
        {report.withoutQuantity > 0 && report.defaultQuantity === 0 && (
          <>
            {" "}
            {report.withoutQuantity} ligne(s) sans quantité sont à zéro : référencées, mais pas
            proposées tant que vous n&apos;aurez pas saisi de stock.
          </>
        )}
      </Alert>

      {report.rejected.length > 0 && (
        <TableWrapper>
          <Table>
            <THead>
              <TR>
                <TH>Ligne</TH>
                <TH>Contenu</TH>
                <TH>Motif du refus</TH>
              </TR>
            </THead>
            <TBody>
              {report.rejected.map((rejection) => (
                <TR key={rejection.lineNumber}>
                  <TD className="tabular">{rejection.lineNumber}</TD>
                  <TD className="font-mono text-[12.5px]">{rejection.raw}</TD>
                  <TD className="text-text-secondary">{rejection.reason}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrapper>
      )}
    </div>
  );
}
