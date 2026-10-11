/**
 * Le robot de PharmaBoost, la mascotte (à ne pas confondre avec le robot de dispensation de `integration.ts`) : ce
 * qu'il ressent, et pourquoi. Module pur : le dessin vit dans `components/robot`, ici seulement les règles — testables
 * sans navigateur.
 *
 * Le principe : le robot ne fait que REFLÉTER un état que l'application connaît déjà (un bip reçu, une analyse en
 * cours, une mise en garde affichée, un conseil vendu). Il n'invente rien, ne conseille rien, et au comptoir il reste
 * discret : un patient est en face.
 */

/** Les humeurs durables : l'expression que le robot garde tant que l'état dure. */
export const ROBOT_MOODS = ["idle", "curious", "thinking", "concerned", "happy", "celebrate", "sleepy"] as const;
export type RobotMood = (typeof ROBOT_MOODS)[number];

/**
 * Les gestes d'un instant, joués une fois puis oubliés : un saut de joie, une fête, un petit coucou, le rire quand on
 * le touche, le tournis quand on insiste.
 */
export type RobotBurst = "jump" | "party" | "wave" | "giggle" | "dizzy";

/** Le geste qui accompagne l'arrivée d'une humeur (null : l'expression change, le corps ne bouge pas). */
export function burstForMood(mood: RobotMood): RobotBurst | null {
  if (mood === "happy") return "jump";
  if (mood === "celebrate") return "party";
  return null;
}

/** Durée de chaque geste, en millisecondes : court exprès, le robot ne vole jamais l'attention longtemps. */
export const BURST_MS: Record<RobotBurst, number> = { jump: 750, party: 1700, wave: 1500, giggle: 420, dizzy: 1900 };

// ---------------------------------------------------------------------------------------------------------------
// « Toc toc » : quand on le touche
// ---------------------------------------------------------------------------------------------------------------

/** À ce nombre de touchers rapprochés, la tête lui tourne (la règle du moteur, core/robot/motion.ts). */
export const POKES_TO_DIZZY = 3;
/** La fenêtre dans laquelle les touchers comptent comme « rapprochés ». */
export const POKE_WINDOW_MS = 1700;

export type PokeState = {
  /** Les instants des derniers touchers encore dans la fenêtre. */
  taps: number[];
  /** Le geste en cours, et jusqu'à quand. */
  burst: "giggle" | "dizzy" | null;
  until: number;
};

export const POKE_IDLE: PokeState = { taps: [], burst: null, until: 0 };

export type PokeAction = { type: "poke"; now: number } | { type: "tick"; now: number };

/**
 * Un toucher le fait glousser ; trois en moins de 1,7 s lui donnent le tournis, puis il se remet. Pendant le tournis,
 * les touchers sont ignorés (il ne s'enfonce pas dans le tournis à force d'insister), et après lui le compte repart de
 * zéro.
 */
export function pokeReducer(state: PokeState, action: PokeAction): PokeState {
  if (action.type === "tick") {
    if (state.burst && action.now >= state.until) return { taps: state.burst === "dizzy" ? [] : state.taps, burst: null, until: 0 };
    return state;
  }
  if (state.burst === "dizzy" && action.now < state.until) return state;
  const taps = [...state.taps.filter((at) => action.now - at < POKE_WINDOW_MS), action.now];
  if (taps.length >= POKES_TO_DIZZY) return { taps: [], burst: "dizzy", until: action.now + BURST_MS.dizzy };
  return { taps, burst: "giggle", until: action.now + BURST_MS.giggle };
}

// ---------------------------------------------------------------------------------------------------------------
// Le regard : des yeux peints sur une sphère
// ---------------------------------------------------------------------------------------------------------------

export type Gaze = { x: number; y: number; scaleX: number; scaleY: number };

export const GAZE_CENTER: Gaze = { x: 0, y: 0, scaleX: 1, scaleY: 1 };

/**
 * Où regardent les yeux quand le pointeur est à (dx, dy) pixels du centre du robot. Les yeux glissent dans l'écran
 * comme sur une sphère : ils s'approchent du bord sans jamais en sortir (borne `max`, en unités du dessin), et
 * s'aplatissent un peu quand ils regardent sur le côté — c'est ce raccourci qui donne le relief. Plus le pointeur est
 * loin, plus le regard va au bord ; tout près, à peine.
 */
export function gazeToward(dx: number, dy: number, max = 4.5): Gaze {
  const distance = Math.hypot(dx, dy);
  if (!Number.isFinite(distance) || distance < 1) return GAZE_CENTER;
  const reach = distance / (distance + 140);
  const nx = dx / distance;
  const ny = dy / distance;
  const x = clamp(nx * max * reach, -max, max);
  const y = clamp(ny * max * 0.75 * reach, -max * 0.75, max * 0.75);
  return { x, y, scaleX: 1 - 0.18 * Math.abs(x / max), scaleY: 1 - 0.1 * Math.abs(y / (max * 0.75)) };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// ---------------------------------------------------------------------------------------------------------------
// Au comptoir : l'humeur suit la vente, jamais l'inverse
// ---------------------------------------------------------------------------------------------------------------

export type SaleMoodInput = {
  /** La vente est en cours d'analyse (étape annoncée, ou analyse lancée par le poste). */
  analysing: boolean;
  /** La vente est encore à confirmer : les boîtes arrivent de la douchette. */
  editing: boolean;
  /** Une vente arrivée par la douchette. */
  fromScan: boolean;
  /** Une mise en garde (vigilance, interaction, posologie…) non acquittée est affichée. */
  warnings: number;
  /** Conseils acceptés ou marqués vendus dans cette vente. */
  accepted: number;
  /** La vente est terminée et enregistrée. */
  finished: boolean;
};

/**
 * L'humeur du robot sur l'écran de vente. L'ordre compte : une mise en garde passe avant la joie d'un conseil vendu —
 * le robot ne sourit jamais à côté d'une alerte.
 */
export function saleMood(input: SaleMoodInput): RobotMood {
  if (input.analysing) return "thinking";
  if (input.editing) return input.fromScan ? "curious" : "idle";
  if (input.warnings > 0) return "concerned";
  if (input.finished || input.accepted > 0) return "happy";
  return "idle";
}

/** Une alerte qui compte pour le robot : tout sauf l'information, et rien de ce que le pharmacien a déjà acquitté. */
export function countWarnings(findings: readonly { severity: string; acknowledged: boolean }[]): number {
  return findings.filter((finding) => finding.severity !== "INFO" && !finding.acknowledged).length;
}

/** Les étapes d'une vente de la douchette, telles que le tableau de bord les reçoit. */
const SCAN_STATUSES = new Set(["NEEDS_VERIFICATION"]);
const ANALYSIS_STATUSES = new Set(["VERIFIED", "ANALYZING"]);

/**
 * L'humeur du robot sur « Nouvelle vente » : curieux quand un bip arrive, pensif pendant l'analyse, content quand un
 * conseil vient d'être accepté (le compteur du jour a monté), sinon au repos.
 */
export function dashboardMood(input: { saleStatuses: readonly string[]; acceptedRose: boolean }): RobotMood {
  if (input.saleStatuses.some((status) => ANALYSIS_STATUSES.has(status))) return "thinking";
  if (input.saleStatuses.some((status) => SCAN_STATUSES.has(status))) return "curious";
  if (input.acceptedRose) return "happy";
  return "idle";
}
