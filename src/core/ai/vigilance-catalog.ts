import type { VigilanceKind } from "./types";
import { VIGILANCE_RULES, type VigilanceRule } from "./engines/vigilance";

/**
 * Le catalogue de ce qu'il ne faut pas associer ni faire, tel que la console de PharmaBoost le montre à la pharmacienne qui relit.
 *
 * Les vigilances de sécurité sont écrites dans le code, sourcées et versionnées : elles ne se suppriment pas depuis la console.
 * Mais elles se LISENT, au même endroit que les conseils — pour savoir, médicament par médicament, ce que PharmaBoost met en
 * garde (contre-indiqué, à éviter, à espacer, bon usage) et d'où vient chaque mise en garde.
 */

export const VIGILANCE_LEVELS: Record<VigilanceKind, { label: string; hint: string; tone: "danger" | "warning" | "info" | "neutral"; order: number }> = {
  CONTRAINDICATION: { label: "Contre-indiqué", hint: "le RCP ou le thésaurus l'interdit", tone: "danger", order: 0 },
  AVOID: { label: "À éviter", hint: "déconseillé en ajout, sans interdiction nominative", tone: "warning", order: 1 },
  INTERACTION: { label: "À espacer", hint: "se prend à distance du médicament", tone: "warning", order: 2 },
  MONITORING: { label: "Surveillance", hint: "se discute au vu du suivi", tone: "info", order: 3 },
  SCREENING: { label: "Dépistage", hint: "justifie de penser à un dépistage", tone: "info", order: 4 },
  USAGE: { label: "Bon usage", hint: "le rappel à faire en remettant la boîte", tone: "neutral", order: 5 },
};

export type VigilanceView = {
  key: string;
  version: string;
  kind: VigilanceKind;
  levelLabel: string;
  tone: "danger" | "warning" | "info" | "neutral";
  order: number;
  title: string;
  subtitle: string;
  /** Ce qui déclenche la règle : les substances, sinon les codes ATC. */
  trigger: string;
  explanation: string;
  /** Ce que la carte du comptoir liste : les produits ou gestes concernés. */
  concerned: string[];
  patientAdvice: string | null;
  /** Les étiquettes de produits que cette règle écarte des propositions. */
  blocks: string[];
  cautions: string[];
  sources: string[];
  /** D'où elle vient : le document de la pharmacienne, la Base maître, le moteur… */
  origin: string;
};

function capitalise(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

function triggerOf(rule: VigilanceRule): string {
  if (rule.veterinary) return "Antiparasitaire pour animaux";
  const substances = rule.substances.slice(0, 6).map(capitalise);
  if (substances.length > 0) return `${substances.join(", ")}${rule.substances.length > 6 ? "…" : ""}`;
  return rule.atcPrefixes.length > 0 ? `Codes ATC ${rule.atcPrefixes.slice(0, 6).join(", ")}${rule.atcPrefixes.length > 6 ? "…" : ""}` : "Selon le traitement";
}

export function originOf(rule: VigilanceRule, documents: Record<string, string>): string {
  if (rule.documentRows) return documents[rule.documentRows.document] ?? rule.documentRows.document;
  if (rule.veterinary) return "Conseil vétérinaire";
  if (rule.sourceRules && rule.sourceRules.length > 0) return "Base maître V1";
  return "Moteur PharmaBoost";
}

/** Toutes les vigilances du moteur, lisibles : du plus grave au moins grave, puis par médicament déclencheur. */
export function describeVigilances(documents: Record<string, string>, rules: readonly VigilanceRule[] = VIGILANCE_RULES): VigilanceView[] {
  return rules
    .map((rule) => {
      const level = VIGILANCE_LEVELS[rule.kind];
      return {
        key: rule.key,
        version: rule.version,
        kind: rule.kind,
        levelLabel: level.label,
        tone: level.tone,
        order: level.order,
        title: rule.title,
        subtitle: rule.subtitle,
        trigger: triggerOf(rule),
        explanation: rule.explanationTemplate.replaceAll("{drug}", "le médicament"),
        concerned: rule.concerned,
        patientAdvice: rule.patientAdvice,
        blocks: rule.blockTags,
        cautions: rule.cautionTags,
        sources: rule.sources,
        origin: originOf(rule, documents),
      };
    })
    .sort((a, b) => a.order - b.order || a.trigger.localeCompare(b.trigger, "fr") || a.key.localeCompare(b.key));
}
