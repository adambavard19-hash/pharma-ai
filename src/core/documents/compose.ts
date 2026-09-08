import { MOMENTS, MOMENT_LABELS, buildDailyPlan, type Moment } from "@/core/posology";
import type { DocumentContent, DocumentTreatmentItem } from "./types";

/**
 * Ce que le plan patient a le droit de dire, calculé à partir de l'instantané.
 *
 * Tout ici est déterministe et dérivé de données validées au comptoir : une
 * répartition confirmée, une durée confirmée, une consigne écrite. Rien n'est
 * déduit d'une posologie ambiguë et rien n'est généré — un plan patient ne
 * doit jamais contenir une phrase que personne n'a relue.
 */

/** Statuts d'un conseil qui autorisent sa présence sur le plan patient. */
export const ADVICE_STATUSES_ON_PLAN = [
  "ACCEPTED",
  "MODIFIED",
  "REPLACED",
  "PRESENTED",
  "PURCHASED",
] as const;

export const MOMENT_ICONS: Record<Moment, string> = {
  morning: "☀️",
  noon: "🍽",
  evening: "🌙",
  bedtime: "🌜",
};

export type DayPlanSummary = {
  moment: Moment;
  label: string;
  icon: string;
  /** Nombre de médicaments à prendre à ce moment — jamais leurs noms. */
  count: number;
};

/**
 * Le résumé « Matin | Midi | Soir » utilisable hors de la page sécurisée
 * (aperçu dans l'e-mail) : il ne nomme aucun médicament, il compte.
 */
export function summarizeDayPlan(treatment: DocumentTreatmentItem[]): DayPlanSummary[] {
  const sections = buildDailyPlan(treatment);
  return MOMENTS.filter((moment) => moment !== "bedtime" || sections.some((s) => s.moment === moment))
    .map((moment) => ({
      moment,
      label: MOMENT_LABELS[moment],
      icon: MOMENT_ICONS[moment],
      count: sections.find((section) => section.moment === moment)?.entries.length ?? 0,
    }));
}

/** Lignes dont la répartition n'a pas été validée : « À confirmer avec votre pharmacien ». */
export function unscheduledTreatment(treatment: DocumentTreatmentItem[]): DocumentTreatmentItem[] {
  return treatment.filter((item) => !item.schedule);
}

/**
 * « À retenir » — uniquement des faits confirmés au comptoir.
 *
 * Sources autorisées, dans cet ordre : la durée confirmée d'un traitement, la
 * consigne écrite par le pharmacien sur une ligne. Le référentiel connecté
 * n'y entre pas : ses précautions restent sur la ligne du médicament, où leur
 * source est indiquée.
 */
export function composeKeyPoints(treatment: DocumentTreatmentItem[]): string[] {
  const points: string[] = [];
  for (const item of treatment) {
    if (item.durationDays && item.durationDays > 0) {
      points.push(
        `${item.drugName} : pendant ${item.durationDays} jour${item.durationDays > 1 ? "s" : ""}, jusqu'au bout même si vous vous sentez mieux.`,
      );
    }
  }
  for (const item of treatment) {
    const instruction = item.instructions?.trim();
    if (instruction) points.push(`${item.drugName} : ${ensurePeriod(instruction)}`);
  }
  return dedupe(points).slice(0, 6);
}

/** Date du passage, telle qu'elle est dite au patient. */
export function passageDate(content: DocumentContent): Date {
  return new Date(content.passageAt ?? content.generatedAt);
}

function ensurePeriod(value: string): string {
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}

/** « 1 comprimé », « 2 bouffées », « 1 prise » — la quantité à prendre, jamais le dosage. */
export function doseLabel(doses: number, unit: string | undefined): string {
  const u = unit ?? "prise";
  const plural = doses > 1 ? (u.endsWith("s") ? "" : "s") : "";
  return `${doses} ${u}${plural}`;
}

/** Le nom tel qu'il s'écrit sur le plan : la spécialité, puis le dosage avec unité s'il est sûr. */
export function displayName(item: DocumentTreatmentItem): { name: string; strength: string | null } {
  const strength = item.strength ?? null;
  const name = item.drugName.trim();
  // Un dosage déjà présent dans le nom lu (« EFFERALGAN 1 g ») n'est pas répété.
  if (strength && name.toLowerCase().includes(strength.toLowerCase())) return { name, strength: null };
  return { name, strength };
}

export type PlanRow = {
  item: DocumentTreatmentItem;
  /** Prises par moment, dans l'ordre de MOMENTS ; 0 = rien à ce moment. */
  doses: Record<Moment, number>;
  /** Ce qui accompagne la prise : repas, rythme. */
  note: string | null;
};

/** Les lignes du planning : uniquement les traitements dont la répartition est validée. */
export function planRows(treatment: DocumentTreatmentItem[]): { rows: PlanRow[]; moments: Moment[] } {
  const rows: PlanRow[] = treatment
    .filter((item) => item.schedule && MOMENTS.some((m) => item.schedule![m] > 0))
    .map((item) => {
      const schedule = item.schedule!;
      const notes = [
        schedule.mealTiming ? MEAL_LABEL_FOR[schedule.mealTiming] : null,
        item.rhythm ?? null,
      ].filter(Boolean) as string[];
      return {
        item,
        doses: { morning: schedule.morning, noon: schedule.noon, evening: schedule.evening, bedtime: schedule.bedtime },
        note: notes.length > 0 ? notes.join(" · ") : null,
      };
    });
  const moments = MOMENTS.filter((m) => m !== "bedtime" || rows.some((row) => row.doses.bedtime > 0));
  return { rows, moments };
}

const MEAL_LABEL_FOR = { BEFORE: "avant le repas", DURING: "pendant le repas", AFTER: "après le repas" } as const;
