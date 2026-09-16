"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ExternalLink, FileWarning, Scale, ShieldAlert } from "lucide-react";
import { setRegulationCheckAction } from "@/server/actions/regulation";
import { Checkbox } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { RegulationAlert, RegulationSeverity } from "@/core/regulation/rules";
import type { SaleLineDraft } from "./types";

/**
 * Ce que la réglementation impose avant de facturer, ligne par ligne.
 *
 * Trois niveaux : ce qui provoque un rejet ou interdit la délivrance (rouge),
 * ce qu'il faut vérifier sur l'ordonnance (orange), et la règle de droit
 * commun qui s'applique (repliée, pour ne pas noyer le reste sous « liste I »).
 * Le pharmacien coche ce qu'il a vérifié : le point garde son nom et l'heure.
 */

const SEVERITY_STYLE: Record<RegulationSeverity, { label: string; ring: string; badge: string; icon: typeof ShieldAlert }> = {
  BLOCKING: {
    label: "Rejet sans cela",
    ring: "border-danger-200 bg-danger-50/60 dark:border-danger-800 dark:bg-danger-950/30",
    badge: "bg-danger-600 text-white",
    icon: ShieldAlert,
  },
  CHECK: {
    label: "À vérifier",
    ring: "border-warning-300 bg-warning-50/60 dark:border-warning-800 dark:bg-warning-950/30",
    badge: "bg-warning-500 text-ink-950",
    icon: FileWarning,
  },
  INFO: {
    label: "Bon à savoir",
    ring: "border-border-subtle bg-surface-card",
    badge: "bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-300",
    icon: Scale,
  },
};

export function RegulationZone({ lines, canCheck }: { lines: SaleLineDraft[]; canCheck: boolean }) {
  const concerned = lines.filter((line) => line.regulation.alerts.length > 0);
  if (concerned.length === 0) return null;
  const attention = concerned.flatMap((line) => line.regulation.alerts.filter((alert) => alert.severity !== "INFO"));
  const blocking = attention.filter((alert) => alert.severity === "BLOCKING").length;

  return (
    <section aria-label="Réglementation" className="rounded-2xl border border-border-subtle bg-surface-card">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border-subtle px-4 py-3">
        <Scale className="size-4 text-brand-700 dark:text-brand-300" />
        <h2 className="text-[14px] font-semibold text-text-primary">Réglementation avant facturation</h2>
        <p className="text-[12.5px] text-text-secondary">
          {attention.length === 0
            ? "Rien à réclamer : seules les règles de droit commun s'appliquent."
            : `${attention.length} point${attention.length > 1 ? "s" : ""} à vérifier${blocking > 0 ? `, dont ${blocking} sans le${blocking > 1 ? "s" : ""}quel${blocking > 1 ? "s" : ""} la facturation est rejetée` : ""}.`}
        </p>
      </header>
      <ul className="divide-y divide-border-subtle">
        {concerned.map((line) => (
          <LineBlock key={line.id} line={line} canCheck={canCheck} />
        ))}
      </ul>
    </section>
  );
}

function LineBlock({ line, canCheck }: { line: SaleLineDraft; canCheck: boolean }) {
  const [showInfo, setShowInfo] = useState(false);
  const main = line.regulation.alerts.filter((alert) => alert.severity !== "INFO");
  const info = line.regulation.alerts.filter((alert) => alert.severity === "INFO");
  return (
    <li className="px-4 py-3">
      <p className="text-[13.5px] font-semibold text-text-primary">{line.official?.name ?? line.drugName}</p>
      {main.length > 0 && (
        <ul className="mt-2 space-y-2">
          {main.map((alert, index) => (
            <AlertRow key={`${alert.code}-${index}`} lineId={line.id} alert={alert} initiallyChecked={line.regulation.checked.includes(alert.code)} canCheck={canCheck} />
          ))}
        </ul>
      )}
      {info.length > 0 && (
        <div className="mt-2">
          <button type="button" onClick={() => setShowInfo((value) => !value)} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-text-secondary hover:text-text-primary" aria-expanded={showInfo}>
            <ChevronDown className={cn("size-3.5 transition-transform", showInfo && "rotate-180")} />
            {info.map((alert) => alert.title).join(" · ")}
          </button>
          {showInfo && (
            <ul className="mt-2 space-y-2">
              {info.map((alert, index) => (
                <AlertRow key={`${alert.code}-${index}`} lineId={line.id} alert={alert} initiallyChecked={false} canCheck={false} />
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

function AlertRow({ lineId, alert, initiallyChecked, canCheck }: { lineId: string; alert: RegulationAlert; initiallyChecked: boolean; canCheck: boolean }) {
  const style = SEVERITY_STYLE[alert.severity];
  const Icon = style.icon;
  const [checked, setChecked] = useState(initiallyChecked);
  const [pending, start] = useTransition();
  const { push } = useToast();

  const toggle = (next: boolean) => {
    setChecked(next);
    start(async () => {
      const result = await setRegulationCheckAction({ lineId, code: alert.code, checked: next });
      if (!result.ok) {
        setChecked(!next);
        push({ tone: "error", title: result.error });
      }
    });
  };

  return (
    <li className={cn("rounded-xl border px-3.5 py-3", style.ring, checked && "opacity-70")}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
        <Icon className="mt-0.5 size-4 shrink-0 text-text-secondary" />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold text-text-primary">
            {alert.title}
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide", style.badge)}>{style.label}</span>
          </p>
          <p className="mt-1 text-[13px] leading-5 text-text-secondary">{alert.action}</p>
          {alert.basis && (
            <p className="mt-1 text-[12.5px] leading-5 text-text-tertiary">
              Condition publiée : <q className="italic">{alert.basis}</q>
            </p>
          )}
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-text-tertiary">
            {alert.sources.map((source) =>
              source.url ? (
                <a key={source.label} href={source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-text-secondary hover:underline">
                  {source.label}
                  <ExternalLink className="size-3" />
                </a>
              ) : (
                <span key={source.label}>{source.label}</span>
              ),
            )}
          </p>
        </div>
        {canCheck && alert.severity !== "INFO" && (
          <label className="flex shrink-0 items-center gap-2 text-[12.5px] font-medium text-text-secondary">
            <Checkbox checked={checked} disabled={pending} onChange={(event) => toggle(event.target.checked)} />
            Vérifié
          </label>
        )}
      </div>
    </li>
  );
}
