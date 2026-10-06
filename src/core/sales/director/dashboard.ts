import { calendarDay, zonedDayStart } from "@/core/challenges/dates";
import { PROSPECT_STATUS_LABELS, type ProspectStatusCode } from "@/core/sales/pipeline";
import { TIME_ZONE } from "@/config/constants";
import { formatNumber } from "@/lib/format";

/**
 * Le cœur du tableau de bord du directeur : la période, la phrase de synthèse,
 * le classement et la lecture de l'activité récente. Pur et testé ; les
 * chiffres eux-mêmes viennent des dossiers réels (`director-dashboard.ts`).
 */

// ---------------------------------------------------------------------------
// Période
// ---------------------------------------------------------------------------

export const DIRECTOR_PERIODS = ["mois", "30-jours", "annee"] as const;
export type DirectorPeriodKey = (typeof DIRECTOR_PERIODS)[number];

export const DIRECTOR_PERIOD_LABELS: Record<DirectorPeriodKey, string> = {
  mois: "Ce mois",
  "30-jours": "30 jours",
  annee: "Cette année",
};

/** Début de phrase de la synthèse : « Ce mois-ci, votre équipe… ». */
const PERIOD_PHRASES: Record<DirectorPeriodKey, string> = {
  mois: "Ce mois-ci",
  "30-jours": "Sur les 30 derniers jours",
  annee: "Depuis le début de l'année",
};

export type DirectorPeriod = {
  key: DirectorPeriodKey;
  label: string;
  phrase: string;
  /** Inclus. */
  start: Date;
  /** Inclus : l'instant présent, rien ne compte après lui. */
  end: Date;
};

/** La valeur de `?periode=`, ou « ce mois » pour tout ce qui n'est pas une période connue. */
export function parseDirectorPeriod(value: string | string[] | undefined): DirectorPeriodKey {
  const raw = Array.isArray(value) ? value[0] : value;
  return DIRECTOR_PERIODS.find((key) => key === raw) ?? "mois";
}

/**
 * Les bornes d'une période. Le mois et l'année commencent à minuit, heure de
 * Paris (changement d'heure compris) : un dossier ouvert le 1er à 0 h 30 compte
 * pour le mois qui commence. « 30 jours » est glissant.
 */
export function resolveDirectorPeriod(key: DirectorPeriodKey, now: Date = new Date()): DirectorPeriod {
  const today = calendarDay(now, TIME_ZONE);
  const [year, month] = today.split("-");
  let start: Date;
  switch (key) {
    case "mois":
      start = zonedDayStart(`${year}-${month}-01`, TIME_ZONE);
      break;
    case "annee":
      start = zonedDayStart(`${year}-01-01`, TIME_ZONE);
      break;
    case "30-jours":
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
  }
  return { key, label: DIRECTOR_PERIOD_LABELS[key], phrase: PERIOD_PHRASES[key], start, end: now };
}

// ---------------------------------------------------------------------------
// Chiffres
// ---------------------------------------------------------------------------

/**
 * La part des dossiers ouverts sur la période qui sont arrivés à la signature.
 * `null` quand aucun dossier n'a été ouvert : on n'invente pas un 0 %.
 */
export function conversionRate(signedFromOpened: number, opened: number): number | null {
  if (opened <= 0) return null;
  return Math.min(1, Math.max(0, signedFromOpened / opened));
}

const plural = (count: number, singular: string) => `${formatNumber(count)} ${singular}${count > 1 ? "s" : ""}`;

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}`;
}

/**
 * La phrase du haut de page. Les zéros sont dits tels quels : « n'a pas encore
 * activé d'officine » vaut mieux qu'un « 0 officine » que l'on survole.
 */
export function summarizeTeam(input: { phrase: string; teamSize: number; opened: number; demos: number; activated: number }): string {
  const { phrase, teamSize, opened, demos, activated } = input;
  if (teamSize <= 0) return "Votre équipe n'a pas encore de commercial actif. Ajoutez le premier pour commencer.";
  const subject = teamSize === 1 ? "votre commercial" : `votre équipe de ${formatNumber(teamSize)} commerciaux`;
  const facts = [
    { n: opened, done: `ouvert ${plural(opened, "dossier")}`, notYet: "ouvert de dossier" },
    { n: demos, done: `réalisé ${plural(demos, "démonstration")}`, notYet: "réalisé de démonstration" },
    { n: activated, done: `activé ${plural(activated, "officine")}`, notYet: "activé d'officine" },
  ];
  const done = facts.filter((fact) => fact.n > 0).map((fact) => fact.done);
  const notYet = facts.filter((fact) => fact.n <= 0).map((fact) => fact.notYet);
  if (done.length === 0) return `${phrase}, ${subject} n'a pas encore ${notYet[0]}, ${notYet[1]} ni ${notYet[2]}.`;
  if (notYet.length === 0) return `${phrase}, ${subject} a ${joinList(done)}.`;
  return `${phrase}, ${subject} a ${joinList(done)}, mais n'a pas encore ${notYet.join(" ni ")}.`;
}

/**
 * L'avancement d'un challenge en une phrase : combien de commerciaux ont atteint
 * l'objectif. Les cas limites sont dits tels quels (personne, tout le monde,
 * aucun participant) plutôt qu'écrits « 0 sur 0 ».
 */
export function describeReached(reached: number, participants: number): string {
  if (participants <= 0) return "Aucun commercial actif ne participe.";
  if (participants === 1) return reached >= 1 ? "Le commercial a atteint l'objectif." : "Le commercial n'a pas encore atteint l'objectif.";
  if (reached <= 0) return `Aucun des ${formatNumber(participants)} commerciaux n'a encore atteint l'objectif.`;
  if (reached >= participants) return `Les ${formatNumber(participants)} commerciaux ont tous atteint l'objectif.`;
  return `${formatNumber(reached)} ${reached > 1 ? "commerciaux" : "commercial"} sur ${formatNumber(participants)} ${reached > 1 ? "ont" : "a"} atteint l'objectif.`;
}

// ---------------------------------------------------------------------------
// Classement
// ---------------------------------------------------------------------------

export type TeamMemberStats = {
  salesRepId: string;
  name: string;
  opened: number;
  demos: number;
  contractsSigned: number;
  activated: number;
};

export type RankedMember = TeamMemberStats & { rank: number };

/**
 * Le classement du mois : activations, puis contrats signés, puis démos. Des
 * chiffres, jamais une note. À égalité sur les trois, même rang (1, 2, 2, 4) et
 * ordre alphabétique pour que l'écran ne bouge pas d'un chargement à l'autre.
 * Les commerciaux qui n'ont rien enregistré ne sont pas classés : ils sont
 * rendus à part (`quiet`), sans rang.
 */
export function rankTeam(members: TeamMemberStats[]): { ranked: RankedMember[]; quiet: TeamMemberStats[] } {
  const hasActivity = (m: TeamMemberStats) => m.opened + m.demos + m.contractsSigned + m.activated > 0;
  const byName = (a: TeamMemberStats, b: TeamMemberStats) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" });
  const sorted = members
    .filter(hasActivity)
    .sort((a, b) => b.activated - a.activated || b.contractsSigned - a.contractsSigned || b.demos - a.demos || byName(a, b));
  const ranked: RankedMember[] = [];
  sorted.forEach((member, index) => {
    const previous = ranked[index - 1];
    const tied = previous && previous.activated === member.activated && previous.contractsSigned === member.contractsSigned && previous.demos === member.demos;
    ranked.push({ ...member, rank: tied ? previous.rank : index + 1 });
  });
  return { ranked, quiet: members.filter((m) => !hasActivity(m)).sort(byName) };
}

// ---------------------------------------------------------------------------
// Activité récente
// ---------------------------------------------------------------------------

const EVENT_LABELS: Record<string, string> = {
  CREATED: "Dossier ouvert",
  NOTE: "Note ajoutée",
  EMAIL_SENT: "E-mail envoyé",
  CONTRACT_GENERATED: "Contrat préparé",
  CONTRACT_SENT: "Contrat envoyé",
  CONTRACT_OPENED: "Contrat ouvert par l'officine",
  CONTRACT_SIGNED: "Contrat signé",
  CONTRACT_REFUSED: "Contrat refusé",
  CONTRACT_EXPIRED: "Contrat expiré",
  PHARMACY_CREATED: "Espace de l'officine créé",
  COMMISSION_CREATED: "Commission créée",
  COMMISSION_UPDATED: "Commission mise à jour",
  COMMISSION_PAID: "Commission payée",
  TASK_CREATED: "Relance programmée",
  TASK_DONE: "Relance faite",
  ASSIGNED: "Dossier réaffecté",
  BLOCKED: "Dossier suspendu",
  UNBLOCKED: "Dossier réactivé",
  SUBSCRIPTION_REQUESTED: "Abonnement demandé par l'officine",
  CONTRACT_REMINDER: "Relance du contrat envoyée",
  SIGNED_PDF_ARCHIVED: "Contrat signé archivé",
  SUBSCRIPTION_PENDING: "Abonnement en attente",
  DUPLICATE_SUSPECTED: "Doublon possible repéré",
  SIGNATURE_ERROR: "Erreur de signature électronique",
};

const statusLabel = (value: unknown): string | null => (typeof value === "string" && Object.hasOwn(PROSPECT_STATUS_LABELS, value) ? PROSPECT_STATUS_LABELS[value as ProspectStatusCode] : null);

/**
 * Ce qui s'est passé, en quelques mots. Le texte libre de l'événement (la note
 * d'un commercial, le corps d'un e-mail) n'est JAMAIS repris : le fil du
 * directeur dit « note ajoutée », pas ce que la note contient. Seules les
 * étapes (déjà connues et libellées) sont citées.
 */
export function describeProspectEvent(type: string, metadata: unknown): string {
  if (type === "STATUS_CHANGED") {
    const meta = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {};
    const from = statusLabel(meta.from);
    const to = statusLabel(meta.to);
    if (from && to) return `Étape : ${from} → ${to}`;
    if (to) return `Étape : ${to}`;
    return "Étape du dossier modifiée";
  }
  return EVENT_LABELS[type] ?? "Dossier mis à jour";
}

/** Qui a agi, sans jamais afficher un identifiant. */
export function describeEventActor(actorType: string, actorLabel: string | null): string {
  if (actorType === "SIGNER") return "L'officine";
  if (actorType === "SYSTEM") return "PharmaBoost";
  const label = actorLabel?.trim();
  if (label) return label;
  if (actorType === "ADMIN") return "L'équipe PharmaBoost";
  if (actorType === "DIRECTOR") return "Direction commerciale";
  return "Un commercial";
}
