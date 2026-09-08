"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, Check, ChevronDown, Pencil } from "lucide-react";
import { confirmLineReadingAction, setLineDosageAction } from "@/server/actions/prescriptions";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { describeRhythm, formatSchedule, unitFor } from "@/core/posology";
import { VISION_REVIEW_THRESHOLD } from "@/core/extraction";
import { cn } from "@/lib/utils";
import { SpecialtyLink } from "./specialty-link";
import type { SaleLineDraft } from "./types";

/**
 * Le traitement, après l'analyse — la colonne de gauche.
 *
 * Une ligne par médicament, et ce qui manque se corrige SUR la ligne : choisir
 * la spécialité quand le catalogue hésite, préciser un dosage absent parmi ceux
 * qui existent, confirmer une lecture incertaine. Plus de panneau
 * « éléments à vérifier » à part : le problème est là où on le règle.
 */
export type LineIssue =
  | { kind: "ATTACH"; label: string }
  | { kind: "STRENGTH"; label: string }
  | { kind: "READING"; label: string; fields: string[] };

const FIELD_LABELS: Record<string, string> = {
  drugName: "nom",
  dosage: "dosage",
  posology: "posologie",
  form: "forme",
  durationDays: "durée",
  quantity: "quantité",
};

/** Ce qui, sur une ligne confirmée, appelle encore un geste du pharmacien. */
export function lineIssuesAfterAnalysis(line: SaleLineDraft): LineIssue[] {
  const issues: LineIssue[] = [];
  if (!line.official) {
    if (!line.dosage && line.strengthOptions.length > 1) {
      issues.push({ kind: "STRENGTH", label: "dosage à préciser" });
    } else if (line.candidates.length > 0) {
      issues.push({ kind: "ATTACH", label: "médicament à préciser" });
    } else {
      issues.push({ kind: "ATTACH", label: "hors catalogue national" });
    }
  }
  const low = ["drugName", "dosage", "posology"].filter(
    (field) => (line.confidence[field] ?? 1) < VISION_REVIEW_THRESHOLD && (line as unknown as Record<string, string>)[field],
  );
  if (low.length > 0) {
    issues.push({ kind: "READING", label: `lecture à confirmer (${low.map((f) => FIELD_LABELS[f] ?? f).join(", ")})`, fields: low });
  }
  return issues;
}

export function TreatmentPanel({
  lines,
  canEdit,
  onEdit,
  catalogAttribution,
}: {
  lines: SaleLineDraft[];
  canEdit: boolean;
  onEdit: () => void;
  catalogAttribution: string | null;
}) {
  const confirmed = lines.filter((line) => line.confirmed);
  const withIssues = confirmed.filter((line) => lineIssuesAfterAnalysis(line).length > 0).length;

  return (
    <section className="space-y-2.5" aria-labelledby="zone-traitement">
      <div className="flex items-center justify-between gap-3">
        <h2 id="zone-traitement" className="flex items-center gap-2 text-[15px] font-semibold text-text-primary">
          {confirmed.length} médicament{confirmed.length > 1 ? "s" : ""}
          {withIssues === 0 ? (
            <Check className="size-[18px] text-success-600 dark:text-success-500" strokeWidth={2.5} />
          ) : (
            <span className="text-[12.5px] font-normal text-warning-700 dark:text-warning-500">
              {withIssues} à préciser
            </span>
          )}
        </h2>
        {canEdit && (
          <button type="button" onClick={onEdit} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] font-medium text-brand-700 transition-colors hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-950">
            <Pencil className="size-3.5" />
            Corriger l&apos;ordonnance
          </button>
        )}
      </div>

      <Card>
        <ul className="divide-y divide-border-subtle">
          {confirmed.map((line) => (
            <TreatmentRow key={line.id} line={line} canEdit={canEdit} attribution={catalogAttribution} />
          ))}
          {confirmed.length === 0 && <li className="px-4 py-4 text-[13px] text-text-tertiary">Aucune ligne confirmée.</li>}
        </ul>
      </Card>
    </section>
  );
}

function TreatmentRow({ line, canEdit, attribution }: { line: SaleLineDraft; canEdit: boolean; attribution: string | null }) {
  const [open, setOpen] = useState(false);
  const issues = lineIssuesAfterAnalysis(line);
  const unit = unitFor(line.official?.pharmaceuticalForm ?? line.form);
  const posology = line.schedule ? formatSchedule(line.schedule, unit) : line.posology || "posologie non lue";
  const strength = line.official ? strengthOf(line.official.name) : line.dosage || null;
  const rhythm = describeRhythm(line.schedule?.everyDays);

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] leading-5 text-text-primary">
            <span className="font-semibold">{line.drugName}</span>
            {strength && <span className="text-text-secondary"> {strength}</span>}
          </p>
          <p className="text-[13px] leading-5 text-text-secondary">
            {posology}
            {rhythm && !line.schedule ? ` · ${rhythm}` : ""}
            {line.durationDays ? ` · ${line.durationDays} j` : ""}
            {line.quantity ? ` · ${line.quantity} boîte${line.quantity > 1 ? "s" : ""}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <AvailabilityChip availability={line.availability} />
          {line.cisCode && (
            <Link href={`/medicaments/${line.cisCode}`} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[12px] text-text-tertiary hover:bg-surface-sunken hover:text-text-secondary" title="Fiche du médicament (catalogue national)">
              <BookOpen className="size-3.5" />
              Fiche
            </Link>
          )}
          {line.official && (
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="rounded-md p-1 text-text-tertiary hover:bg-surface-sunken" aria-label="Détails du rattachement">
              <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
            </button>
          )}
        </div>
      </div>

      {issues.map((issue) => (
        <InlineFix key={issue.kind} line={line} issue={issue} canEdit={canEdit} attribution={attribution} />
      ))}

      {open && line.official && (
        <div className="mt-2">
          <SpecialtyLink lineId={line.id} official={line.official} availability={line.availability} identifiedBy={line.identifiedBy} candidates={line.candidates} refusal={line.identificationRefusal} attribution={attribution} canEdit={canEdit} />
          {line.purpose && <p className="mt-1.5 text-[12.5px] leading-5 text-text-secondary">{line.purpose}</p>}
        </div>
      )}
    </li>
  );
}

function InlineFix({ line, issue, canEdit, attribution }: { line: SaleLineDraft; issue: LineIssue; canEdit: boolean; attribution: string | null }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { push } = useToast();

  const run = (action: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    startTransition(async () => {
      const result = await action();
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Enregistré") : (result.error ?? "Erreur") });
      if (result.ok) router.refresh();
    });

  if (issue.kind === "STRENGTH") {
    return (
      <div className="mt-2 rounded-lg border border-warning-300 bg-warning-50/50 px-3 py-2 dark:border-warning-800 dark:bg-warning-950/30">
        <p className="text-[12.5px] leading-4 text-warning-800 dark:text-warning-400">
          Dosage non lu sur l&apos;ordonnance. Précisez-le : le catalogue en connaît {line.strengthOptions.length}.
        </p>
        {canEdit && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {line.strengthOptions.map((option) => (
              <button key={option} type="button" disabled={pending} onClick={() => run(() => setLineDosageAction({ lineId: line.id, dosage: option }))} className="rounded-md border border-border-default bg-surface-card px-2.5 py-1 text-[12.5px] font-medium text-text-primary transition-colors hover:border-brand-400 disabled:opacity-60">
                {option}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (issue.kind === "READING") {
    return (
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border-subtle bg-surface-sunken/50 px-3 py-2">
        <p className="text-[12.5px] leading-4 text-text-secondary">
          Lecture incertaine : {issue.fields.map((f) => FIELD_LABELS[f] ?? f).join(", ")}
          {line.rawText ? ` — lu « ${line.rawText} »` : ""}
        </p>
        {canEdit && (
          <button type="button" disabled={pending} onClick={() => run(() => confirmLineReadingAction({ lineId: line.id }))} className="inline-flex items-center gap-1 rounded-md border border-border-default bg-surface-card px-2.5 py-1 text-[12.5px] font-medium text-text-primary hover:border-brand-400 disabled:opacity-60">
            <Check className="size-3.5" />
            C&apos;est bien ça
          </button>
        )}
      </div>
    );
  }

  return (
    <SpecialtyLink lineId={line.id} official={null} availability={line.availability} identifiedBy={line.identifiedBy} candidates={line.candidates} refusal={line.identificationRefusal} attribution={attribution} canEdit={canEdit} />
  );
}

function AvailabilityChip({ availability }: { availability: SaleLineDraft["availability"] }) {
  if (!availability) return null;
  const { state, quantity } = availability;
  if (state === "IN_STOCK") return <Badge tone="success">En stock · {quantity}</Badge>;
  if (state === "REFERENCED_EMPTY") return <Badge tone="warning">Stock à zéro</Badge>;
  if (state === "NOT_REFERENCED") return <Badge tone="warning">Hors stock</Badge>;
  return null;
}

/** « RULID 150 mg, comprimé enrobé » → « 150 mg ». */
function strengthOf(name: string): string | null {
  const match = /(\d+(?:[.,]\d+)?)\s*(mg\/ml|mg\/dose|microgrammes?\/dose|microgrammes?|mg|g|µg|ui|%)(?![a-z])/i.exec(name);
  return match ? `${match[1]} ${match[2].toLowerCase()}` : null;
}
