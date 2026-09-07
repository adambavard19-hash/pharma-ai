"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, Check, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import {
  analyseStockImportAction,
  commitStockImportAction,
  remapStockImportAction,
} from "@/server/actions/stock-import";
import type { ImportOutcome, ImportPreview } from "@/server/services/stock-import";
import { FIELD_LABELS, ISSUE_LABELS, type ClassifiedRow, type ImportField, type RowDecision } from "@/core/stock-import";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { Select } from "@/components/ui/field";
import { formatCents } from "@/lib/format";
import { cn } from "@/lib/utils";

const FIELDS: ImportField[] = ["name", "code", "quantity", "salePrice", "purchasePrice"];

const STATUS_LABELS: Record<ClassifiedRow["status"], string> = {
  MEDICAMENT: "Médicament reconnu",
  PRODUIT_EXISTANT: "Produit reconnu",
  A_VERIFIER: "À vérifier",
  NON_RECONNU: "Non reconnu",
  INVALIDE: "Ligne invalide",
};

/**
 * Trois étapes, une seule écriture.
 *
 * 1. Le fichier. 2. Les colonnes et l'aperçu — ce qui est reconnu, ce qui
 * attend une décision, ce qui ne passera pas. 3. La validation, en une
 * transaction. Aucune correspondance incertaine n'est validée en silence :
 * une ligne « à vérifier » sans décision est ignorée.
 */
export function ImportWizard() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [decisions, setDecisions] = useState<Record<string, RowDecision>>({});
  const [createUnknown, setCreateUnknown] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const analyse = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const result = await analyseStockImportAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPreview(result.data);
      setDecisions({});
    });
  };

  const remap = (field: ImportField, column: string) => {
    if (!preview) return;
    const mapping = { ...preview.mapping, [field]: column || undefined };
    startTransition(async () => {
      const result = await remapStockImportAction({ jobId: preview.jobId, mapping });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPreview(result.data);
      setDecisions({});
    });
  };

  const commit = () => {
    if (!preview) return;
    setError(null);
    startTransition(async () => {
      const result = await commitStockImportAction({ jobId: preview.jobId, decisions, createUnknownByDefault: createUnknown });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOutcome(result.data);
    });
  };

  if (outcome) {
    return (
      <Card>
        <CardContent className="space-y-4 py-6">
          <p className="flex items-center gap-2 text-[16px] font-semibold text-text-primary">
            <Check className="size-5 text-success-600" />
            Import terminé
          </p>
          <dl className="grid gap-3 sm:grid-cols-4">
            <Stat label="Médicaments" value={outcome.drugsUpserted} />
            <Stat label="Produits mis à jour" value={outcome.productsUpdated} />
            <Stat label="Produits créés" value={outcome.productsCreated} />
            <Stat label="Ignorés / invalides" value={`${outcome.ignored} / ${outcome.invalid}`} />
          </dl>
          <Button asChild>
            <Link href="/stock">Voir mon stock</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!preview) {
    return (
      <Card>
        <CardHeader title="1. Votre fichier" description="CSV ou Excel, première ligne = en-têtes. 8 Mo et 50 000 lignes au plus." />
        <CardContent>
          <form action={analyse} className="space-y-4">
            {error && <Alert tone="danger">{error}</Alert>}
            <label
              htmlFor="stock-file"
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-default bg-surface-sunken/40 px-6 py-10 text-center transition-colors hover:border-brand-400 hover:bg-brand-50/40 dark:hover:bg-brand-950/30"
            >
              <FileSpreadsheet className="size-7 text-text-tertiary" />
              <span className="text-[13.5px] font-medium text-text-primary">{fileName ?? "Choisir un fichier CSV ou Excel"}</span>
              <span className="text-[12px] text-text-tertiary">Colonnes attendues : nom, CIP/EAN, quantité, prix TTC, prix d&apos;achat (facultatif)</span>
              <input
                id="stock-file"
                name="file"
                type="file"
                accept=".csv,.txt,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                required
                className="sr-only"
                onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
              />
            </label>
            <Button type="submit" className="w-full" loading={pending} disabled={!fileName} leadingIcon={<Upload className="size-[18px]" />}>
              Analyser le fichier
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  const { summary } = preview;
  const attention = preview.rows.filter((row) => row.status !== "MEDICAMENT" && row.status !== "PRODUIT_EXISTANT" || row.issues.length > 0);

  return (
    <div className="space-y-5">
      {error && <Alert tone="danger">{error}</Alert>}

      <Card>
        <CardHeader title="2. Les colonnes" description={`${preview.fileName} — dites à Pharma.ai quelle colonne contient quoi. La proposition vient des en-têtes ; corrigez si besoin.`} />
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {FIELDS.map((field) => (
              <label key={field} className="space-y-1">
                <span className="block text-[11.5px] font-medium text-text-tertiary">
                  {FIELD_LABELS[field]}
                  {field === "quantity" && " *"}
                </span>
                <Select value={preview.mapping[field] ?? ""} onChange={(event) => remap(field, event.target.value)} disabled={pending}>
                  <option value="">— non utilisée —</option>
                  {preview.headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </Select>
              </label>
            ))}
          </div>
          {preview.missing.length > 0 && (
            <Alert tone="warning" className="mt-4">
              Il manque : {preview.missing.map((field) => FIELD_LABELS[field as ImportField]).join(", ")}. Choisissez les colonnes pour lancer l&apos;analyse.
            </Alert>
          )}
        </CardContent>
      </Card>

      {preview.missing.length === 0 && (
        <>
          <Card>
            <CardHeader title="3. Aperçu avant validation" description="Rien n'est encore écrit dans votre stock." />
            <CardContent className="space-y-5">
              <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <Stat label="Détectés" value={summary.detected} />
                <Stat label="Médicaments" value={summary.medicaments} tone="success" />
                <Stat label="Produits reconnus" value={summary.existing} tone="success" />
                <Stat label="À vérifier" value={summary.toVerify} tone="warning" />
                <Stat label="Non reconnus" value={summary.unknown} tone="warning" />
                <Stat label="Invalides" value={summary.invalid} tone="danger" />
              </dl>

              <label className="flex items-start gap-3 rounded-xl border border-border-subtle px-4 py-3 text-[13.5px]">
                <input type="checkbox" checked={createUnknown} onChange={(event) => setCreateUnknown(event.target.checked)} className="mt-1 size-4" />
                <span>
                  <span className="block font-medium text-text-primary">Créer les produits non reconnus comme produits de l&apos;officine</span>
                  <span className="block text-[12.5px] text-text-secondary">
                    Un produit de parapharmacie n&apos;est pas forcément dans le catalogue national. Créé ici, il entre dans votre stock avec son nom, sa quantité et son prix ; vous pourrez compléter sa fiche plus tard.
                  </span>
                </span>
              </label>

              {attention.length === 0 ? (
                <p className="flex items-center gap-2 text-[13.5px] text-success-700 dark:text-success-400">
                  <Check className="size-4" />
                  Toutes les lignes sont reconnues, sans anomalie.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border-subtle">
                  <table className="w-full min-w-[820px] text-[13px]">
                    <thead className="bg-surface-sunken/60 text-left text-[11.5px] font-semibold tracking-wide text-text-tertiary uppercase">
                      <tr>
                        <th className="px-3 py-2">Ligne</th>
                        <th className="px-3 py-2">Produit lu</th>
                        <th className="px-3 py-2 text-right">Qté</th>
                        <th className="px-3 py-2 text-right">Prix</th>
                        <th className="px-3 py-2">Statut</th>
                        <th className="px-3 py-2">Anomalies</th>
                        <th className="px-3 py-2">Décision</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                      {attention.slice(0, 300).map((row) => (
                        <tr key={row.line}>
                          <td className="px-3 py-2 text-text-tertiary tabular">{row.line}</td>
                          <td className="px-3 py-2">
                            <span className="block font-medium text-text-primary">{row.name ?? "—"}</span>
                            {row.code && <span className="block text-[12px] text-text-tertiary">{row.code}</span>}
                            {row.targetLabel && <span className="block text-[12px] text-success-700">→ {row.targetLabel}</span>}
                          </td>
                          <td className="px-3 py-2 text-right tabular">{row.quantity ?? "—"}</td>
                          <td className="px-3 py-2 text-right tabular">{row.salePriceCents !== null ? formatCents(row.salePriceCents) : "—"}</td>
                          <td className="px-3 py-2">
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-[11.5px] font-medium",
                                row.status === "INVALIDE"
                                  ? "bg-danger-100 text-danger-800"
                                  : row.status === "A_VERIFIER" || row.status === "NON_RECONNU"
                                    ? "bg-warning-100 text-warning-800"
                                    : "bg-success-100 text-success-800",
                              )}
                            >
                              {STATUS_LABELS[row.status]}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-[12px] text-text-secondary">
                            {row.issues.map((issue) => ISSUE_LABELS[issue]).join(" · ") || "—"}
                          </td>
                          <td className="px-3 py-2">
                            {row.status === "A_VERIFIER" || row.status === "NON_RECONNU" ? (
                              <Select
                                value={decisionValue(decisions[String(row.line)], row, createUnknown)}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  setDecisions((current) => ({
                                    ...current,
                                    [String(row.line)]:
                                      value === "CREER" ? { kind: "CREER_PRODUIT" } : value === "IGNORER" ? { kind: "IGNORER" } : { kind: "RATTACHER", targetId: value },
                                  }));
                                }}
                              >
                                <option value="IGNORER">Ignorer cette ligne</option>
                                <option value="CREER">Créer comme produit officine</option>
                                {row.candidates.map((candidate) => (
                                  <option key={candidate.id} value={candidate.id}>
                                    Rattacher à « {candidate.label} »
                                  </option>
                                ))}
                              </Select>
                            ) : row.status === "INVALIDE" ? (
                              <span className="flex items-center gap-1 text-[12px] text-text-tertiary">
                                <AlertTriangle className="size-3.5" /> non importée
                              </span>
                            ) : (
                              <span className="text-[12px] text-text-tertiary">importée</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {attention.length > 300 && (
                    <p className="px-3 py-2 text-[12px] text-text-tertiary">{attention.length - 300} autres lignes à traiter après cet import.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-subtle bg-surface-card p-4">
            <p className="text-[13.5px] text-text-secondary">
              Tout s&apos;écrit en une fois. En cas d&apos;erreur, rien n&apos;est importé.
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => { setPreview(null); setFileName(null); }} disabled={pending}>
                Changer de fichier
              </Button>
              <Button onClick={commit} loading={pending} leadingIcon={pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-[18px]" />}>
                Valider l&apos;import
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function decisionValue(decision: RowDecision | undefined, row: ClassifiedRow, createUnknown: boolean): string {
  if (decision?.kind === "RATTACHER") return decision.targetId;
  if (decision?.kind === "CREER_PRODUIT") return "CREER";
  if (decision?.kind === "IGNORER") return "IGNORER";
  return row.status === "NON_RECONNU" && createUnknown ? "CREER" : "IGNORER";
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "success" | "warning" | "danger" }) {
  return (
    <div className="rounded-xl border border-border-subtle px-3.5 py-3">
      <dt className="text-[11.5px] font-medium tracking-wide text-text-tertiary uppercase">{label}</dt>
      <dd
        className={cn(
          "mt-0.5 text-[22px] font-semibold tabular",
          tone === "success" ? "text-success-700" : tone === "warning" ? "text-warning-700" : tone === "danger" ? "text-danger-700" : "text-text-primary",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
