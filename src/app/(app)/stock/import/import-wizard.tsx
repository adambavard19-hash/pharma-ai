"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, Check, FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
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

const FIELDS: ImportField[] = ["code", "name", "quantity", "salePrice", "purchasePrice", "vatRate", "brand", "category"];

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
export function ImportWizard({ returnTo = "/stock" }: { returnTo?: string }) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [decisions, setDecisions] = useState<Record<string, RowDecision>>({});
  const [createUnknown, setCreateUnknown] = useState(true);
  const [showAnomalies, setShowAnomalies] = useState(false);
  const [showColumns, setShowColumns] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const pickFile = (picked: File | null) => {
    setFile(picked);
    setFileName(picked?.name ?? null);
  };

  const analyse = (formData: FormData) => {
    setError(null);
    // Le fichier déposé par glisser-déposer n'est pas dans le champ : on le pose nous-mêmes.
    if (file && !(formData.get("file") instanceof File && (formData.get("file") as File).size > 0)) formData.set("file", file);
    startTransition(async () => {
      const result = await analyseStockImportAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPreview(result.data);
      setDecisions({});
      setShowAnomalies(false);
      setShowColumns(result.data.missing.length > 0);
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
    const c = outcome.classification;
    const understood = c ? c.fromCache + c.byHeuristic + c.byAi : 0;
    return (
      <Card>
        <CardContent className="space-y-5 py-6">
          <div>
            <p className="text-[11.5px] font-semibold tracking-[0.08em] text-success-700 uppercase dark:text-success-400">Stock importé</p>
            <p className="mt-1 flex items-center gap-2 text-[22px] font-semibold tracking-[-0.01em] text-text-primary">
              <Check className="size-6 text-success-600" />
              {outcome.drugsUpserted + outcome.productsUpdated + outcome.productsCreated} référence{outcome.drugsUpserted + outcome.productsUpdated + outcome.productsCreated > 1 ? "s" : ""} écrite{outcome.drugsUpserted + outcome.productsUpdated + outcome.productsCreated > 1 ? "s" : ""} dans votre stock
            </p>
          </div>
          <dl className="grid gap-3 sm:grid-cols-4">
            <Stat label="Médicaments (CIP)" value={outcome.drugsUpserted} tone="success" />
            <Stat label="Produits mis à jour" value={outcome.productsUpdated} tone="success" />
            <Stat label="Produits créés" value={outcome.productsCreated} tone="success" />
            <Stat label="Ignorés / invalides" value={`${outcome.ignored} / ${outcome.invalid}`} tone={outcome.invalid > 0 ? "warning" : undefined} />
          </dl>
          {c && c.considered > 0 && (
            <div className="rounded-xl border border-border-subtle px-4 py-3 text-[13.5px]">
              <p className="font-medium text-text-primary">
                {understood} produit{understood > 1 ? "s" : ""} compris par le moteur sur {c.considered} créé{c.considered > 1 ? "s" : ""}
                {c.byAi > 0 && ` (${c.byAi} avec l'aide du modèle)`}.
              </p>
              <p className="mt-0.5 text-text-secondary">
                {c.withoutUsage > 0 && `${c.withoutUsage} rangé(s) sans usage de conseil identifié. `}
                {c.unclassified > 0 && `${c.unclassified} restent à comprendre. `}
                {c.remaining > 0 && `${c.remaining} n'ont pas encore été soumis au modèle : relancez depuis la page Stock. `}
                {!c.aiAvailable && "Aucun modèle configuré : seul le dictionnaire a travaillé."}
              </p>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href={returnTo}>{returnTo.startsWith("/bienvenue") ? "Continuer l'accueil" : "Voir mon stock"}</Link>
            </Button>
            <Button variant="outline" onClick={() => { setOutcome(null); setPreview(null); pickFile(null); }}>Importer un autre fichier</Button>
          </div>
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
              onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                pickFile(event.dataTransfer.files?.[0] ?? null);
              }}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
                dragging ? "border-brand-500 bg-brand-50/60" : "border-border-default bg-surface-sunken/40 hover:border-brand-400 hover:bg-brand-50/40",
              )}
            >
              <FileSpreadsheet className="size-7 text-text-tertiary" />
              <span className="text-[13.5px] font-medium text-text-primary">{fileName ?? "Glissez votre fichier ici, ou cliquez pour le choisir"}</span>
              <span className="text-[12px] text-text-tertiary">CSV ou Excel. Colonnes reconnues : CIP/CIP13/EAN, désignation, quantité, prix de vente, prix d&apos;achat, TVA, marque, rayon.</span>
              <input
                id="stock-file"
                name="file"
                type="file"
                accept=".csv,.txt,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
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
  // Ce qui demande un regard : une piste à trancher, une ligne invalide, une
  // anomalie signalée. Un produit simplement inconnu du catalogue national
  // n'est pas une anomalie quand on a choisi de le créer : c'est de la
  // parapharmacie, et c'est normal.
  const attention = preview.rows.filter(
    (row) => row.status === "A_VERIFIER" || row.status === "INVALIDE" || row.issues.length > 0 || (row.status === "NON_RECONNU" && !createUnknown),
  );
  const recognized = summary.medicaments + summary.existing + (createUnknown ? summary.unknown : 0);
  const mappedCount = Object.values(preview.mapping).filter(Boolean).length;

  return (
    <div className="space-y-5">
      {error && <Alert tone="danger">{error}</Alert>}

      {preview.missing.length === 0 && (
        <Card>
          <CardContent className="space-y-5 py-6">
            <div>
              <p className="text-[11.5px] font-semibold tracking-[0.08em] text-brand-700 uppercase dark:text-brand-400">Stock analysé</p>
              <p className="mt-1 text-[22px] font-semibold tracking-[-0.01em] text-text-primary">{summary.detected} référence{summary.detected > 1 ? "s" : ""} détectée{summary.detected > 1 ? "s" : ""}</p>
              <p className="mt-0.5 text-[13px] text-text-secondary">{preview.fileName} · {mappedCount} colonnes reconnues. Rien n&apos;est encore écrit dans votre stock.</p>
            </div>
            <ul className="grid gap-2 sm:grid-cols-3 text-[14px]">
              <li className="flex items-center gap-2 rounded-xl border border-success-200 bg-success-50/40 px-3.5 py-3 dark:border-success-800 dark:bg-success-950/20"><Check className="size-4 text-success-600" /><span className="font-semibold tabular">{summary.medicaments + summary.existing}</span> reconnues{createUnknown && summary.unknown > 0 && <span className="text-[12px] text-text-tertiary">+ {summary.unknown} à créer</span>}</li>
              <li className="flex items-center gap-2 rounded-xl border border-warning-200 bg-warning-50/40 px-3.5 py-3 dark:border-warning-800 dark:bg-warning-950/20"><AlertTriangle className="size-4 text-warning-700" /><span className="font-semibold tabular">{summary.toVerify}</span> à vérifier</li>
              <li className="flex items-center gap-2 rounded-xl border border-border-subtle px-3.5 py-3"><X className="size-4 text-danger-600" /><span className="font-semibold tabular">{summary.invalid}</span> non exploitables{!createUnknown && summary.unknown > 0 && <span className="text-[12px] text-text-tertiary">+ {summary.unknown} non reconnues</span>}</li>
            </ul>
            <div className="flex flex-wrap items-center gap-2">
              {attention.length > 0 && (
                <Button variant="outline" onClick={() => setShowAnomalies((v) => !v)}>
                  {showAnomalies ? "Masquer les anomalies" : `Corriger les anomalies (${attention.length})`}
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => setShowColumns((v) => !v)}>{showColumns ? "Masquer les colonnes" : "Vérifier les colonnes"}</Button>
              <Button className="ml-auto" size="lg" onClick={commit} loading={pending} leadingIcon={pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-[18px]" />}>
                Valider mon stock ({recognized} référence{recognized > 1 ? "s" : ""})
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {(showColumns || preview.missing.length > 0) && <Card>
        <CardHeader title="Les colonnes" description={`${preview.fileName} — dites à PharmaBoost quelle colonne contient quoi. La proposition vient des en-têtes ; corrigez si besoin.`} />
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
      </Card>}

      {preview.missing.length === 0 && showAnomalies && (
        <>
          <Card>
            <CardHeader title="Anomalies à traiter" description="Seules les lignes qui demandent un regard. Les lignes reconnues n'apparaissent pas : elles n'ont pas besoin de vous." />
            <CardContent className="space-y-5">

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

        </>
      )}

      {preview.missing.length === 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-subtle bg-surface-card p-4">
          <p className="text-[13.5px] text-text-secondary">
            Tout s&apos;écrit en une fois. En cas d&apos;erreur, rien n&apos;est importé.
          </p>
          <Button variant="ghost" onClick={() => { setPreview(null); pickFile(null); }} disabled={pending}>
            Changer de fichier
          </Button>
        </div>
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
