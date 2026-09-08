"use client";

import Link from "next/link";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { summarizeFindings } from "./safety-zone";
import type { BlockedOpportunityView, SafetyFindingView } from "./types";

/**
 * Les contrôles, en deux lignes sous le traitement.
 *
 * Ce qui concerne UNE ligne se corrige sur la ligne ; ici ne restent que les
 * contrôles d'ensemble : les interactions (vérifiées, partiellement, ou pas
 * du tout parce qu'aucun référentiel n'est chargé), et les conseils que le
 * moteur a écartés. Dit clairement, sans jargon, et sans occuper l'écran.
 */
export function ChecksNote({
  findings,
  blockedOpportunities,
  stale,
  prescriptionId,
}: {
  findings: SafetyFindingView[];
  blockedOpportunities: BlockedOpportunityView[];
  stale: boolean;
  prescriptionId: string;
}) {
  const items = summarizeFindings(findings, blockedOpportunities).filter((item) => item.key !== "referentiel" && item.key !== "lecture");
  const warnings = items.filter((item) => item.tone === "warning");

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-card px-4 py-3">
      <ul className="space-y-1.5">
        {stale && (
          <li className="flex items-start gap-2 text-[13px] leading-5 text-warning-800 dark:text-warning-400">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            Un médicament a été rattaché depuis la dernière analyse : elle se relance automatiquement au prochain rattachement.
          </li>
        )}
        {items.map((item) => (
          <li key={item.key} className={"flex items-start gap-2 text-[13px] leading-5 " + (item.tone === "warning" ? "text-warning-800 dark:text-warning-400" : "text-text-secondary")}>
            {item.tone === "warning" ? <AlertTriangle className="mt-0.5 size-4 shrink-0" /> : <ShieldCheck className="mt-0.5 size-4 shrink-0 text-text-tertiary" />}
            <span>
              {item.label}
              {item.key === "interactions" && item.tone === "warning" && (
                <span className="text-text-secondary"> — aucun référentiel d&apos;interactions n&apos;est chargé : cette analyse est indisponible, elle n&apos;a pas été faite.</span>
              )}
            </span>
          </li>
        ))}
        {items.length === 0 && !stale && (
          <li className="flex items-start gap-2 text-[13px] leading-5 text-success-800 dark:text-success-300">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" />
            Aucun point de sécurité dans les contrôles disponibles.
          </li>
        )}
      </ul>
      <p className="mt-2 text-[12px] text-text-tertiary">
        {warnings.length > 0 ? "Les analyses indisponibles sont dites telles quelles. " : ""}
        <Link href={`/vente/${prescriptionId}/analyse`} className="underline underline-offset-2 hover:text-text-secondary">
          Comment l&apos;analyse s&apos;est déroulée
        </Link>
      </p>
    </div>
  );
}
