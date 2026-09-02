/**
 * La règle de couleur du comptoir — écrite une seule fois.
 *
 * Quatre couleurs, quatre significations, et rien d'autre :
 *
 *   ROUGE   une intervention est indispensable ; jamais repliable ;
 *   ORANGE  à vérifier, vigilance ;
 *   VERT    conseil ou accompagnement pertinent ;
 *   NEUTRE  information, aucune action nécessaire.
 *
 * Une couleur choisie au cas par cas dans chaque composant finit par vouloir
 * dire quatre choses différentes selon l'endroit de l'écran. Un pharmacien
 * apprend alors à ignorer la couleur — ce qui coûte exactement au moment où
 * elle aurait dû l'arrêter. D'où ce module : les composants demandent le ton,
 * ils ne le décident pas.
 *
 * Deux décisions valent d'être dites, parce qu'elles ne vont pas de soi.
 *
 * 1. **L'absence de signal de sécurité n'est pas verte, elle est neutre.**
 *    Le vert dirait « rien à signaler », ce qui n'est vrai que dans les limites
 *    de ce qui a été comparé — et Pharma.ai peut tourner sans aucun référentiel
 *    d'interactions chargé. Un écran vert au-dessus d'une phrase qui dit « les
 *    interactions ne sont pas analysées » est un écran qui ment en couleur.
 *
 * 2. **Le rouge est réservé à la sécurité clinique.** Une zone de conseils
 *    fermée, un stock à commander, une ligne non rattachée : tout cela est
 *    orange. Si le rouge servait aussi à dire « je n'ai pas fini », il ne
 *    voudrait plus rien dire quand il s'agit d'un patient.
 */

export type CounterTone = "danger" | "warning" | "success" | "neutral";

/** Ce que chaque couleur a le droit de vouloir dire. */
export const COUNTER_TONE_RULE: Record<CounterTone, string> = {
  danger: "Sécurité clinique : une intervention est indispensable.",
  warning: "À vérifier — vigilance, information incomplète, action possible.",
  success: "Conseil ou accompagnement pertinent, prêt à être proposé.",
  neutral: "Information. Aucune action nécessaire.",
};

/** La sévérité d'un signal de sécurité, telle que produite par le moteur. */
export function safetyTone(severity: string): CounterTone {
  if (severity === "BLOCKING") return "danger";
  if (severity === "WARNING" || severity === "CAUTION") return "warning";
  // INFO — et tout ce que le moteur pourrait ajouter demain. Une sévérité
  // inconnue ne prend pas la couleur d'une alerte : on ne crie pas pour un
  // signal qu'on ne sait pas lire.
  return "neutral";
}

/** L'état de sécurité d'ensemble, tel qu'il s'affiche dans le bandeau. */
export function safetySummaryTone(input: {
  blockingCount: number;
  attentionCount: number;
}): CounterTone {
  if (input.blockingCount > 0) return "danger";
  if (input.attentionCount > 0) return "warning";
  return "neutral";
}

/** Ce que l'officine détient du médicament prescrit. */
export function stockTone(state: string | null | undefined): CounterTone {
  // « En stock » est vert : c'est la seule information de cette famille sur
  // laquelle le pharmacien agit tout de suite — il peut délivrer.
  if (state === "IN_STOCK") return "success";
  if (state === "REFERENCED_EMPTY" || state === "NOT_REFERENCED") return "warning";
  // UNKNOWN, ou aucune information : ne pas savoir n'est pas une rupture, et
  // l'écran ne doit jamais laisser croire le contraire.
  return "neutral";
}

/** La zone des conseils, vue du bandeau. */
export function adviceTone(input: {
  /** La sécurité n'est pas acquittée : les conseils sont fermés. */
  locked: boolean;
  recommendationCount: number;
}): CounterTone {
  // Orange et non rouge : une zone fermée est une étape à franchir, pas un
  // danger pour le patient. Le danger, lui, est déjà rouge une ligne plus haut.
  if (input.locked) return "warning";
  if (input.recommendationCount > 0) return "success";
  // Aucune proposition est un résultat normal, pas une anomalie.
  return "neutral";
}
