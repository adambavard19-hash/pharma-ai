"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, ChevronDown, Eye, MessageSquareQuote, ShieldAlert, ShieldCheck, Stethoscope, TriangleAlert } from "lucide-react";
import { acknowledgeSafetyFindingsAction } from "@/server/actions/prescriptions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { COUNTER_BLOCKING_SUBJECTS, blocksCounter } from "@/core/ai/safety-gate";
import type { BlockedOpportunityView, SafetyFindingView } from "./types";

/**
 * La sécurité, en une ligne.
 *
 * Un pharmacien debout, un patient devant lui : il lit « 2 éléments à
 * vérifier », pas douze paragraphes. Chaque élément tient en quelques mots ;
 * le pourquoi complet reste à un clic. Une alerte BLOQUANTE, elle, ne se
 * replie jamais — on ne vend rien par-dessus une alerte que personne n'a lue,
 * et l'acquittement reste un acte professionnel, signé et horodaté.
 *
 * Les signaux sont regroupés par nature, pas listés par ligne : « trois
 * médicaments sans fiche validée » est une information ; la même phrase
 * répétée trois fois est du bruit.
 */

type CompactItem = {
  key: string;
  /** Ce qu'on lit d'un coup d'œil. */
  label: string;
  /** Ce qu'on lit si on clique « Voir pourquoi ». */
  details: string[];
  tone: "warning" | "info";
};

const REFERENTIAL_CODES = new Set([
  "DRUG_NOT_IN_REFERENTIAL",
  "DRUG_NO_INTERACTION_DATA",
  "DRUG_NOT_IDENTIFIED",
  "DRUG_CLASSIFIED_BY_AI",
  "DEMO_REFERENTIAL",
]);

const COVERAGE_CODES = new Set(["INTERACTION_COVERAGE", "INTERACTION_NO_REFERENTIAL"]);

function isReadingCode(code: string): boolean {
  return code.endsWith("_UNREADABLE") || code.endsWith("_LOW_CONFIDENCE");
}

/** Le nom entre guillemets français, si le message en porte un. */
function quotedName(message: string): string | null {
  const match = /«\s*([^»]+?)\s*»/.exec(message);
  return match ? match[1] : null;
}

export function summarizeFindings(
  findings: SafetyFindingView[],
  blockedOpportunities: BlockedOpportunityView[],
): CompactItem[] {
  const items: CompactItem[] = [];
  const nonBlocking = findings.filter((finding) => finding.severity !== "BLOCKING" && !finding.details);

  const coverage = nonBlocking.filter((finding) => COVERAGE_CODES.has(finding.code));
  if (coverage.some((finding) => finding.code === "INTERACTION_NO_REFERENTIAL")) {
    items.push({
      key: "interactions",
      label: "Interactions non vérifiées",
      details: coverage.map((finding) => finding.message),
      tone: "warning",
    });
  } else if (coverage.length > 0) {
    items.push({
      key: "interactions",
      label: "Interactions : couverture partielle",
      details: coverage.map((finding) => finding.message),
      tone: "info",
    });
  }

  const referential = nonBlocking.filter((finding) => REFERENTIAL_CODES.has(finding.code));
  if (referential.length > 0) {
    const names = [
      ...new Set(referential.map((finding) => quotedName(finding.message)).filter(Boolean)),
    ] as string[];
    const count = names.length || referential.length;
    items.push({
      key: "referentiel",
      label: `${count} médicament${count > 1 ? "s" : ""} sans fiche validée`,
      details: referential.map((finding) => finding.message),
      tone: "info",
    });
  }

  const reading = nonBlocking.filter((finding) => isReadingCode(finding.code));
  if (reading.length > 0) {
    items.push({
      key: "lecture",
      label: `${reading.length} champ${reading.length > 1 ? "s" : ""} non lu${reading.length > 1 ? "s" : ""}, confirmé${reading.length > 1 ? "s" : ""} tel${reading.length > 1 ? "s" : ""} quel${reading.length > 1 ? "s" : ""}`,
      details: reading.map((finding) => finding.message),
      tone: "info",
    });
  }

  for (const finding of nonBlocking) {
    if (COVERAGE_CODES.has(finding.code) || REFERENTIAL_CODES.has(finding.code) || isReadingCode(finding.code)) {
      continue;
    }
    if (finding.severity === "INFO") continue;
    // Le premier membre de phrase suffit à comprendre ; le reste est à un clic.
    const short = finding.message.split(/[.:—]/)[0].trim();
    items.push({
      key: finding.id,
      label: short.length > 90 ? `${short.slice(0, 89)}…` : short,
      details: [finding.message],
      tone: "warning",
    });
  }

  if (blockedOpportunities.length > 0) {
    items.push({
      key: "ecartes",
      label: `${blockedOpportunities.length} conseil${blockedOpportunities.length > 1 ? "s" : ""} écarté${blockedOpportunities.length > 1 ? "s" : ""} par le moteur`,
      details: blockedOpportunities.map(
        (opportunity) => `${opportunity.title} — ${opportunity.blockReason ?? "écarté"}`,
      ),
      tone: "info",
    });
  }

  return items;
}

export function SafetyZone({
  analysisRunId,
  findings,
  blockedOpportunities,
  canAcknowledge,
  stale,
}: {
  analysisRunId: string | null;
  findings: SafetyFindingView[];
  blockedOpportunities: BlockedOpportunityView[];
  canAcknowledge: boolean;
  /** Le rattachement au catalogue national a changé depuis cette analyse. */
  stale: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const { push } = useToast();

  const unacknowledged = findings.filter(blocksCounter);
  const acknowledgedBlocking = findings.filter(
    (finding) =>
      finding.severity === "BLOCKING" &&
      (COUNTER_BLOCKING_SUBJECTS as readonly string[]).includes(finding.subjectType) &&
      !blocksCounter(finding),
  );

  const items = summarizeFindings(findings, blockedOpportunities);
  if (stale) {
    items.unshift({
      key: "stale",
      label: "Analyse antérieure au dernier rattachement",
      details: [
        "Un médicament a été rattaché au catalogue national depuis cette analyse. Relancez l'analyse pour mettre les signaux à jour.",
      ],
      tone: "warning",
    });
  }
  const toCheck = items.filter((item) => item.tone === "warning");

  const acknowledge = () => {
    if (!analysisRunId) return;
    startTransition(async () => {
      const result = await acknowledgeSafetyFindingsAction(analysisRunId);
      push({
        tone: result.ok ? "success" : "error",
        title: result.ok ? (result.message ?? "Acquitté") : result.error,
      });
    });
  };

  return (
    <section className="space-y-2" aria-labelledby="zone-securite">
      <VigilanceCards findings={findings} />
      {unacknowledged.length > 0 && (
        <Card className="border-danger-400 bg-danger-50/50 dark:border-danger-700/50 dark:bg-danger-700/10">
          <CardContent className="space-y-3 pt-5">
            <p
              id="zone-securite"
              className="flex items-center gap-2 text-[15px] font-semibold text-danger-700 dark:text-danger-400"
            >
              <ShieldAlert className="size-5 shrink-0" />
              {unacknowledged.length} point{unacknowledged.length > 1 ? "s" : ""} à vérifier avant
              tout conseil
            </p>
            <ul className="space-y-2">
              {unacknowledged.map((finding) => (
                <li key={finding.id} className="text-[14px] leading-5 text-text-primary">
                  • {finding.message}
                </li>
              ))}
            </ul>
            {canAcknowledge ? (
              <Button
                variant="danger"
                size="lg"
                loading={pending}
                onClick={acknowledge}
                leadingIcon={<ShieldCheck className="size-[18px]" />}
              >
                J&apos;ai vérifié ces points
              </Button>
            ) : (
              <p className="text-[12.5px] text-text-secondary">
                Seul un pharmacien peut acquitter ces points.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="rounded-xl border border-border-subtle bg-surface-card">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          id={unacknowledged.length > 0 ? undefined : "zone-securite"}
          className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
        >
          {toCheck.length > 0 ? (
            <AlertTriangle className="size-[18px] shrink-0 text-warning-700 dark:text-warning-500" />
          ) : (
            <ShieldCheck className="size-[18px] shrink-0 text-success-700 dark:text-success-400" />
          )}
          <span
            className={cn(
              "min-w-0 flex-1 text-[14px] font-medium",
              toCheck.length > 0
                ? "text-warning-800 dark:text-warning-400"
                : "text-success-800 dark:text-success-300",
            )}
          >
            {toCheck.length > 0
              ? `${toCheck.length} élément${toCheck.length > 1 ? "s" : ""} à vérifier`
              : "Aucun point de sécurité dans les contrôles disponibles"}
          </span>
          {!open && toCheck.length > 0 && (
            <span className="hidden min-w-0 truncate text-[12.5px] text-text-tertiary sm:block">
              {toCheck.map((item) => item.label).join(" · ")}
            </span>
          )}
          <span className="flex shrink-0 items-center gap-1 rounded-md border border-border-default px-2.5 py-1 text-[12.5px] font-medium text-text-secondary">
            {open ? "Masquer" : "Voir"}
            <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
          </span>
        </button>

        {open && (
          <ul className="divide-y divide-border-subtle border-t border-border-subtle">
            {items.map((item) => (
              <CompactRow key={item.key} item={item} />
            ))}
            {acknowledgedBlocking.length > 0 && (
              <CompactRow
                item={{
                  key: "acquittes",
                  label: `${acknowledgedBlocking.length} point${acknowledgedBlocking.length > 1 ? "s" : ""} bloquant${acknowledgedBlocking.length > 1 ? "s" : ""} acquitté${acknowledgedBlocking.length > 1 ? "s" : ""}`,
                  details: acknowledgedBlocking.map((finding) => finding.message),
                  tone: "info",
                }}
              />
            )}
            {items.length === 0 && acknowledgedBlocking.length === 0 && (
              <li className="px-4 py-3 text-[13px] text-text-tertiary">
                Rien à signaler dans les contrôles disponibles.
              </li>
            )}
          </ul>
        )}
      </div>
    </section>
  );
}

function CompactRow({ item }: { item: CompactItem }) {
  const [why, setWhy] = useState(false);
  return (
    <li className="px-4 py-2.5">
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "mt-[7px] size-1.5 shrink-0 rounded-full",
            item.tone === "warning" ? "bg-warning-500" : "bg-text-tertiary/50",
          )}
        />
        <p className="min-w-0 flex-1 text-[13.5px] leading-5 text-text-primary">{item.label}</p>
        <button
          type="button"
          onClick={() => setWhy((value) => !value)}
          aria-expanded={why}
          className="shrink-0 text-[12.5px] text-text-tertiary underline-offset-2 hover:text-text-secondary hover:underline"
        >
          {why ? "Masquer" : "Voir pourquoi"}
        </button>
      </div>
      {why && (
        <ul className="mt-1.5 space-y-1 pl-4">
          {item.details.map((detail, index) => (
            <li key={index} className="text-[12.5px] leading-5 text-text-secondary">
              {detail}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * Une vigilance : ce que le traitement impose de savoir avant de conseiller.
 *
 * Quatre natures, quatre couleurs. Interaction et contre-indication se lisent
 * en rouge : elles écartent ou espacent. Surveillance et dépistage se lisent
 * en orange : elles invitent à regarder le bilan ou à en parler au médecin.
 * « Ok, j'ai compris » replie la carte ; elle ne disparaît pas.
 */
const VIGILANCE_STYLE = {
  INTERACTION: { band: "bg-danger-50 dark:bg-danger-950/30", ring: "border-danger-200 dark:border-danger-800", accent: "text-danger-700 dark:text-danger-300", dot: "bg-danger-600", icon: TriangleAlert, badge: "Alerte importante" },
  CONTRAINDICATION: { band: "bg-danger-50 dark:bg-danger-950/30", ring: "border-danger-200 dark:border-danger-800", accent: "text-danger-700 dark:text-danger-300", dot: "bg-danger-600", icon: ShieldAlert, badge: "Alerte sécurité" },
  MONITORING: { band: "bg-warning-50 dark:bg-warning-950/30", ring: "border-warning-200 dark:border-warning-800", accent: "text-warning-800 dark:text-warning-400", dot: "bg-warning-500", icon: Stethoscope, badge: "Surveillance" },
  SCREENING: { band: "bg-warning-50 dark:bg-warning-950/30", ring: "border-warning-200 dark:border-warning-800", accent: "text-warning-800 dark:text-warning-400", dot: "bg-warning-500", icon: Eye, badge: "Vigilance" },
} as const;

/** Les vigilances du traitement, en cartes : rendues avec ou sans alerte bloquante. */
export function VigilanceCards({ findings }: { findings: SafetyFindingView[] }) {
  const vigilances = findings.filter((finding) => finding.details);
  if (vigilances.length === 0) return null;
  return (
    <div className="space-y-2.5">
      {vigilances.map((finding) => (
        <VigilanceCard key={finding.id} finding={finding} />
      ))}
    </div>
  );
}

function VigilanceCard({ finding }: { finding: SafetyFindingView }) {
  const [open, setOpen] = useState(true);
  const details = finding.details;
  if (!details) return null;
  const style = VIGILANCE_STYLE[details.kind] ?? VIGILANCE_STYLE.MONITORING;
  const Icon = style.icon;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn("flex w-full items-center gap-2.5 rounded-xl border px-4 py-2.5 text-left", style.ring, "bg-surface-card")}
      >
        <Icon className={cn("size-4 shrink-0", style.accent)} />
        <span className="min-w-0 flex-1 truncate text-[13.5px] text-text-primary">
          <span className={cn("font-semibold", style.accent)}>{details.title}</span> — {details.subtitle}
          {details.patientAdvice ? ` · ${details.patientAdvice}` : ""}
        </span>
        <span className="shrink-0 text-[12.5px] text-text-tertiary">Rouvrir</span>
      </button>
    );
  }

  return (
    <article className={cn("space-y-3 rounded-2xl border bg-surface-card p-4", style.ring)}>
      <div className={cn("flex items-center gap-3 rounded-xl px-4 py-2.5", style.band)}>
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full text-white", style.dot)}>
          <Icon className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn("text-[11.5px] font-semibold tracking-[0.1em] uppercase", style.accent)}>{details.title}</p>
          <p className="text-[15px] font-semibold text-text-primary">{details.subtitle}</p>
        </div>
        <span className={cn("shrink-0 rounded-full border px-2.5 py-0.5 text-[12px]", style.ring, style.accent)}>{style.badge}</span>
      </div>

      <div className="flex items-start gap-3 rounded-xl bg-surface-sunken/70 px-4 py-3">
        <span className="mt-0.5 text-[12px] font-semibold text-text-tertiary uppercase">{details.drugNames.join(", ")}</span>
      </div>
      <p className="px-1 text-[14px] leading-[1.55] text-text-primary">{details.explanation}</p>

      {details.concerned.length > 0 && (
        <div className={cn("rounded-xl border px-4 py-3", style.ring, style.band)}>
          <p className={cn("text-[12px] font-semibold tracking-[0.06em] uppercase", style.accent)}>
            {details.kind === "INTERACTION" ? "Compléments concernés" : details.kind === "CONTRAINDICATION" ? "À éviter ou à utiliser avec prudence" : "À garder en tête"}
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {details.concerned.map((item) => (
              <li key={item} className="rounded-lg border border-border-subtle bg-surface-card px-3 py-1.5 text-[13px] text-text-primary">{item}</li>
            ))}
          </ul>
        </div>
      )}

      {details.patientAdvice && (
        <div className="flex items-start gap-2.5 rounded-xl border border-brand-100 bg-brand-50/70 px-4 py-3 dark:border-brand-900 dark:bg-brand-950/40">
          <MessageSquareQuote className="mt-0.5 size-4 shrink-0 text-brand-700 dark:text-brand-300" />
          <p className="text-[14px] leading-[1.5] text-text-primary">
            <span className="font-semibold">Conseil à transmettre au patient : </span>« {details.patientAdvice} »
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-[11.5px] text-text-tertiary">Sources : {details.sources.join(" · ")}</p>
        <Button size="sm" variant="outline" onClick={() => setOpen(false)}>Ok, j&apos;ai compris</Button>
      </div>
    </article>
  );
}

