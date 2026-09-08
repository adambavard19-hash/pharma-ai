/**
 * Posologie structurée.
 *
 * Le texte d'une ordonnance (« 1 comprimé matin et soir ») se lit très bien
 * mais ne se planifie pas : pour dire au patient « MATIN : 1 comprimé », il
 * faut une répartition. Ce module la produit, et pose une règle qui tient tout
 * le reste : une répartition n'est JAMAIS inventée.
 *
 * Deux niveaux de certitude, et ils ne se confondent pas :
 *   • `read`     — la phrase nomme les moments (« matin et soir »). On lit.
 *   • `inferred` — la phrase donne une fréquence (« 3 fois par jour ») sans
 *                  nommer les moments. La répartition proposée est une
 *                  convention d'officine, présentée comme une proposition à
 *                  confirmer, jamais comme la lecture de l'ordonnance.
 * Quand ni l'un ni l'autre n'est possible, on rend `null` et l'écran demande.
 */

export type MealTiming = "BEFORE" | "DURING" | "AFTER";

export type PosologySchedule = {
  /** Nombre d'unités par moment de la journée. 0 = pas de prise. */
  morning: number;
  noon: number;
  evening: number;
  bedtime: number;
  /** Par rapport au repas, lorsque la prescription le précise. */
  mealTiming: MealTiming | null;
  /** Horaires précis confirmés (« 08:00 »), quand ils comptent vraiment. */
  times: string[];
  /**
   * Rythme non quotidien, en jours entre deux journées de prise : 2 = « un
   * jour sur deux », 7 = « une fois par semaine ». Absent ou 1 = tous les
   * jours. Lu sur l'ordonnance ou saisi, jamais déduit.
   */
  everyDays?: number;
};

export const EMPTY_SCHEDULE: PosologySchedule = {
  morning: 0,
  noon: 0,
  evening: 0,
  bedtime: 0,
  mealTiming: null,
  times: [],
};

/** « tous les 2 jours », « un jour sur deux », « une fois par semaine » → intervalle en jours. */
export function describeRhythm(everyDays: number | undefined): string | null {
  if (!everyDays || everyDays <= 1) return null;
  if (everyDays === 7) return "une fois par semaine";
  if (everyDays === 14) return "une semaine sur deux";
  if (everyDays === 2) return "un jour sur deux";
  return `tous les ${everyDays} jours`;
}

export const MOMENT_LABELS = {
  morning: "Matin",
  noon: "Midi",
  evening: "Soir",
  bedtime: "Coucher",
} as const;

export type Moment = keyof typeof MOMENT_LABELS;

export const MOMENTS: Moment[] = ["morning", "noon", "evening", "bedtime"];

export const MEAL_LABELS: Record<MealTiming, string> = {
  BEFORE: "avant le repas",
  DURING: "pendant le repas",
  AFTER: "après le repas",
};

export type ParsedPosology = {
  schedule: PosologySchedule;
  /** `true` lorsque les moments ont été déduits d'une fréquence, pas lus. */
  inferred: boolean;
};

/** Vrai si au moins une prise est renseignée. */
export function hasDoses(schedule: PosologySchedule | null): boolean {
  if (!schedule) return false;
  return MOMENTS.some((moment) => schedule[moment] > 0);
}

export function totalDailyDoses(schedule: PosologySchedule): number {
  return MOMENTS.reduce((sum, moment) => sum + schedule[moment], 0);
}

/**
 * Lit une posologie écrite en français d'ordonnance.
 *
 * Rend `null` dès que la phrase ne permet pas de conclure : c'est le
 * comportement attendu. Un champ vide à l'écran se remplit en trois secondes ;
 * une répartition fausse suit le patient pendant toute sa cure.
 */
export function parsePosology(text: string | null | undefined): ParsedPosology | null {
  if (!text) return null;
  const raw = normalize(text);
  if (!raw) return null;

  const quantity = readQuantity(raw);
  const mealTiming = readMealTiming(raw);
  const everyDays = readRhythm(raw);
  const rhythm = everyDays ? { everyDays } : {};

  // 1. Les moments sont nommés — on lit, on ne déduit pas.
  const named = readNamedMoments(raw, quantity);
  if (named) {
    return { schedule: { ...named, mealTiming, times: [], ...rhythm }, inferred: false };
  }

  // 2. Une fréquence seule : la répartition est une convention, annoncée
  //    comme telle par `inferred`.
  const perDay = readFrequency(raw);
  if (perDay !== null) {
    const spread = spreadOverDay(perDay, quantity);
    if (spread) return { schedule: { ...spread, mealTiming, times: [], ...rhythm }, inferred: true };
  }

  // 3. Un rythme hebdomadaire sans autre précision : une prise, le matin par
  //    convention, annoncée comme déduite.
  if (everyDays && everyDays >= 7) {
    return {
      schedule: { morning: quantity, noon: 0, evening: 0, bedtime: 0, mealTiming, times: [], everyDays },
      inferred: true,
    };
  }

  return null;
}

/**
 * « tous les 2 jours », « 1 jour sur 2 », « une fois par semaine »,
 * « toutes les 2 semaines ». Rend `undefined` pour une prise quotidienne.
 */
function readRhythm(raw: string): number | undefined {
  const everyDays = raw.match(/tous\s*les\s*(\d+)\s*(?:j|jours?)\b/);
  if (everyDays) {
    const n = Number(everyDays[1]);
    return n >= 2 && n <= 31 ? n : undefined;
  }
  const oneOn = raw.match(/\b(?:1|un|une)\s*(?:j|jour)\s*sur\s*(\d+|deux|trois)\b/);
  if (oneOn) {
    const n = oneOn[1] === "deux" ? 2 : oneOn[1] === "trois" ? 3 : Number(oneOn[1]);
    return n >= 2 && n <= 31 ? n : undefined;
  }
  const everyWeeks = raw.match(/toutes\s*les\s*(\d+)\s*semaines?/);
  if (everyWeeks) {
    const n = Number(everyWeeks[1]);
    return n >= 1 && n <= 4 ? n * 7 : undefined;
  }
  if (/\b(?:1|une|un)\s*(?:fois|prise)?\s*(?:par|\/)\s*semaine\b|\bhebdomadaire\b|\bpar\s*semaine\b/.test(raw)) {
    return 7;
  }
  return undefined;
}

/** Rend la posologie en une phrase courte, à partir de la répartition. */
export function formatSchedule(
  schedule: PosologySchedule,
  unit = "unité",
): string {
  const parts = MOMENTS.filter((moment) => schedule[moment] > 0).map(
    (moment) => `${schedule[moment]} ${MOMENT_LABELS[moment].toLowerCase()}`,
  );
  if (parts.length === 0) return "";

  const meal = schedule.mealTiming ? `, ${MEAL_LABELS[schedule.mealTiming]}` : "";
  const total = totalDailyDoses(schedule);
  const plural = total > 1 ? "s" : "";
  const rhythm = describeRhythm(schedule.everyDays);
  return `${parts.join(" · ")} — ${total} ${unit}${plural} ${rhythm ?? "par jour"}${meal}`;
}

/** Nombre d'unités à délivrer pour couvrir la durée prescrite. */
export function unitsForDuration(
  schedule: PosologySchedule,
  durationDays: number | null | undefined,
): number | null {
  const perDay = totalDailyDoses(schedule);
  if (perDay <= 0 || !durationDays || durationDays <= 0) return null;
  return perDay * durationDays;
}

/** Lecture défensive de la colonne JSON : une forme inattendue rend `null`. */
export function readSchedule(value: unknown): PosologySchedule | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const count = (key: string): number => {
    const n = Number(raw[key]);
    return Number.isFinite(n) && n >= 0 ? Math.min(20, Math.trunc(n)) : 0;
  };
  const meal = raw.mealTiming;
  const schedule: PosologySchedule = {
    morning: count("morning"),
    noon: count("noon"),
    evening: count("evening"),
    bedtime: count("bedtime"),
    mealTiming:
      meal === "BEFORE" || meal === "DURING" || meal === "AFTER" ? meal : null,
    times: Array.isArray(raw.times)
      ? raw.times.filter((t): t is string => typeof t === "string").slice(0, 6)
      : [],
  };
  const every = Number(raw.everyDays);
  if (Number.isFinite(every) && every >= 2 && every <= 31) schedule.everyDays = Math.trunc(every);
  return hasDoses(schedule) || schedule.mealTiming || schedule.times.length > 0
    ? schedule
    : null;
}

// --------------------------------------------------------------------------

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const WORD_NUMBERS: Record<string, number> = {
  un: 1,
  une: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  six: 6,
  demi: 0.5,
};

/** Nombre d'unités par prise. Un demi-comprimé est arrondi à 1 : on ne coupe
 *  pas une boîte en deux dans un plan patient sans que le pharmacien le dise. */
function readQuantity(raw: string): number {
  const digits = raw.match(/(\d+)\s*(?:comprime|gelule|sachet|cuillere|dose|goutte|pulverisation|application|unite)/);
  if (digits) return clampDose(Number(digits[1]));

  for (const [word, value] of Object.entries(WORD_NUMBERS)) {
    if (new RegExp(`\\b${word}\\b\\s*(comprime|gelule|sachet|dose)`).test(raw)) {
      return clampDose(Math.ceil(value));
    }
  }
  return 1;
}

function clampDose(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.min(20, Math.trunc(value));
}

function readMealTiming(raw: string): MealTiming | null {
  if (/(avant|a jeun|30 min avant|jeun)\s*(le|les|des|du)?\s*(repas|manger)?/.test(raw)) {
    if (/a jeun|avant (le |les |des |chaque )?repas|avant de manger/.test(raw)) return "BEFORE";
  }
  if (/(au cours|pendant|durant|milieu)\s*(de|du|des|d'un|le|les)?\s*repas|au repas|avec le repas/.test(raw)) {
    return "DURING";
  }
  if (/apres\s*(le|les|des|chaque)?\s*repas|apres manger/.test(raw)) return "AFTER";
  return null;
}

/**
 * Moments explicitement nommés. « matin et soir », « le matin », « au coucher ».
 * Une phrase qui ne nomme aucun moment rend `null` — surtout pas une valeur
 * par défaut.
 */
function readNamedMoments(raw: string, quantity: number): Omit<PosologySchedule, "mealTiming" | "times"> | null {
  const morning = /\bmatin|matinee|petit dejeuner\b/.test(raw);
  const noon = /\bmidi|dejeuner\b/.test(raw);
  const evening = /\bsoir|soiree|diner|dinner\b/.test(raw);
  const bedtime = /\bcoucher|nuit|avant de dormir\b/.test(raw);

  if (!morning && !noon && !evening && !bedtime) return null;

  // « soir » et « coucher » dans la même phrase désignent en général une seule
  // prise, précisée : « 1 comprimé le soir au coucher ». On ne double pas.
  const eveningOnly = evening && bedtime ? false : evening;

  return {
    morning: morning ? quantity : 0,
    noon: noon ? quantity : 0,
    evening: eveningOnly ? quantity : 0,
    bedtime: bedtime ? quantity : 0,
  };
}

/**
 * « 3 fois par jour », « toutes les 8 heures », « 1 fois par jour ».
 *
 * Et la sténographie des ordonnances manuscrites : « 3/J », « 2 F/J »,
 * « 3 par jour », « 2 x/jour ». Un nombre collé au marqueur de fréquence,
 * sans unité entre les deux, compte des prises. « 2 comprimés par jour »
 * reste ambigu — deux prises ou deux comprimés en une — et n'est pas tranché.
 */
function readFrequency(raw: string): number | null {
  const perDay = raw.match(/(\d+)\s*(?:fois|prises?|f|x)?\s*(?:par|\/)\s*(?:jour|j)\b/);
  if (perDay) return clampFrequency(Number(perDay[1]));

  for (const [word, value] of Object.entries(WORD_NUMBERS)) {
    if (new RegExp(`\\b${word}\\b\\s*fois\\s*par\\s*jour`).test(raw)) {
      return clampFrequency(Math.round(value));
    }
  }

  const everyHours = raw.match(/toutes\s*les\s*(\d+)\s*(?:h|heures?)/);
  if (everyHours) {
    const hours = Number(everyHours[1]);
    if (hours > 0 && hours <= 24) return clampFrequency(Math.round(24 / hours));
  }

  if (/\b(1|une|un)\s*(?:comprime|gelule|sachet|dose)?\s*par\s*jour\b/.test(raw)) return 1;
  if (/\bpar\s*jour\b/.test(raw) && /\b(\d+)\b/.test(raw)) return null;

  return null;
}

function clampFrequency(value: number): number | null {
  if (!Number.isFinite(value) || value < 1 || value > 4) return null;
  return value;
}

/**
 * Répartition conventionnelle d'une fréquence sur la journée.
 *
 * 1/j → matin · 2/j → matin + soir · 3/j → matin + midi + soir ·
 * 4/j → matin + midi + soir + coucher. Au-delà, on ne propose rien.
 */
function spreadOverDay(
  perDay: number,
  quantity: number,
): Omit<PosologySchedule, "mealTiming" | "times"> | null {
  const base = { morning: 0, noon: 0, evening: 0, bedtime: 0 };
  switch (perDay) {
    case 1:
      return { ...base, morning: quantity };
    case 2:
      return { ...base, morning: quantity, evening: quantity };
    case 3:
      return { ...base, morning: quantity, noon: quantity, evening: quantity };
    case 4:
      return { ...base, morning: quantity, noon: quantity, evening: quantity, bedtime: quantity };
    default:
      return null;
  }
}

/** Une prise à un moment donné, telle qu'elle apparaît sur le plan patient. */
export type DailyPlanEntry = {
  drugName: string;
  dosage: string | null;
  doses: number;
  unit: string;
};

export type DailyPlanSection = {
  moment: Moment;
  label: string;
  entries: DailyPlanEntry[];
};

/**
 * Le plan de la journée : ce que le patient prend, et quand.
 *
 * Seuls les traitements dont la répartition a été CONFIRMÉE y figurent. Un
 * médicament dont la posologie est restée en texte libre n'apparaît pas ici —
 * il garde sa ligne détaillée plus bas, avec la phrase exacte de l'ordonnance.
 * Fabriquer un horaire pour compléter le tableau serait précisément l'erreur à
 * ne pas commettre.
 */
export function buildDailyPlan(
  items: {
    drugName: string;
    dosage: string | null;
    form: string | null;
    schedule: PosologySchedule | null;
  }[],
): DailyPlanSection[] {
  return MOMENTS.map((moment) => ({
    moment,
    label: MOMENT_LABELS[moment],
    entries: items
      .filter((item) => item.schedule && item.schedule[moment] > 0)
      .map((item) => ({
        drugName: item.drugName,
        dosage: item.dosage,
        doses: item.schedule![moment],
        unit: unitFor(item.form),
      })),
  })).filter((section) => section.entries.length > 0);
}

/** Le mot juste pour compter : « comprimé », « gélule »… à défaut « prise ». */
export function unitFor(form: string | null | undefined): string {
  const normalized = (form ?? "").toLowerCase();
  if (normalized.includes("gélule") || normalized.includes("gelule")) return "gélule";
  if (normalized.includes("sachet")) return "sachet";
  if (normalized.includes("goutte")) return "goutte";
  if (normalized.includes("suppositoire")) return "suppositoire";
  if (normalized.includes("comprim")) return "comprimé";
  if (normalized.includes("pulvéris") || normalized.includes("pulveris")) return "pulvérisation";
  if (normalized.includes("application") || normalized.includes("crème") || normalized.includes("creme")) {
    return "application";
  }
  return "prise";
}
