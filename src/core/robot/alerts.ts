import { closestChallenge, type TipChallenge, type TipShortDate, SHORT_DATE_NAMES } from "./mascot-tips";
import type { RobotMood } from "./mascot";

/**
 * Ce que le robot du logiciel SIGNALE : les faits qui demandent l'attention de la personne, au bon moment, avec le geste
 * qui les règle quand il existe déjà dans PharmaBoost. Module pur : les données arrivent déjà lues par la portée de la
 * session (officine ACTIVE, personne connectée) — voir server/services/robot-alerts.ts.
 *
 * Règles, sans exception :
 *  - un fait réel ou rien : sans donnée, pas d'alerte (une officine neuve n'a que ce qui la concerne vraiment) ;
 *  - chaque alerte n'est montrée qu'à qui peut agir dessus (équipe, stock, abonnement : selon les permissions) ;
 *  - aucune donnée de patient, aucun conseil médical, aucun geste sur l'argent ou un patient : les gestes proposés sont
 *    ceux qui existent déjà comme actions serveur, qui revérifient tout ;
 *  - aucun montant de challenge (paliers en unités).
 */

export type AlertSeverity = "problem" | "todo" | "good" | "info";

export type AlertKind = "post-offline" | "billing" | "stock-deposit" | "join-request" | "bonus-to-validate" | "support" | "short-date" | "stock" | "objective-reached" | "team-objective-reached" | "challenge" | "setup" | "training";

/** Un geste en un clic : chacun correspond à une action serveur existante (gardes de permission comprises). */
export type AlertAction = { kind: "approve-join"; id: string; role: string; label: string } | { kind: "refuse-join"; id: string; label: string } | { kind: "validate-bonus"; id: string; label: string };

export type RobotAlert = {
  /** Stable tant que le fait ne change pas : « Plus tard » et « déjà vu » s'y rattachent. */
  key: string;
  kind: AlertKind;
  severity: AlertSeverity;
  text: string;
  link: { href: string; label: string } | null;
  actions: AlertAction[];
  /** Un problème grave (abonnement impayé) ne se met pas de côté. */
  snoozable: boolean;
};

export type AlertPost = { id: string; label: string; lastSeenAt: Date | null; assignedToMe: boolean };

export type AlertInput = {
  now: Date;
  /** Heure et jour de la semaine à l'heure de l'officine (0 = dimanche). */
  local: { hour: number; weekday: number };
  can: {
    /** Titulaire : demandes d'équipe, primes, objectifs de l'équipe, tous les postes. */
    manageTeam: boolean;
    /** Envoyer le stock. */
    updateStock: boolean;
    /** Paramètres de l'officine : abonnement et mise en service. */
    manageSettings: boolean;
  };
  isDemo: boolean;
  challenges: readonly TipChallenge[];
  challengeHref: string | null;
  shortDates: readonly TipShortDate[];
  stockStale: boolean;
  stockAgeDays: number | null;
  lastDeposit: { id: string; status: string; receivedAt: Date } | null;
  /** Postes appairés et non révoqués. */
  posts: readonly AlertPost[];
  joinRequests: readonly { id: string; name: string; suggestedRole: string; roleLabel: string }[];
  proposedBonuses: readonly { id: string; userName: string; label: string }[];
  /** Mes objectifs atteints encore en cours ou finis depuis peu. */
  myReachedObjectives: readonly { id: string; title: string }[];
  /** Objectifs de l'équipe atteints (titulaire), sans moi. */
  teamReachedObjectives: readonly { id: string; userName: string; title: string }[];
  supportUnread: number;
  subscription: { status: string } | null;
  setup: { status: "TO_SCHEDULE" | "SCHEDULED" | "DONE"; scheduledAt: Date | null } | null;
  training: { title: string; href: string; mode: "continue" | "start"; percent: number } | null;
};

/** Un poste est « hors ligne » au-delà de 30 min sans signe de vie (le module de connexion dit 10 : on laisse une marge). */
export const POST_SILENT_MINUTES = 30;
/** Au-delà de 3 jours sans signe de vie, le poste est sans doute rangé : ce n'est plus une alerte du moment. */
export const POST_FORGOTTEN_DAYS = 3;
/** Le robot ne parle des postes qu'aux heures d'ouverture habituelles : du lundi au samedi, 8 h – 20 h. */
export function isOpeningHours(local: { hour: number; weekday: number }): boolean {
  return local.weekday >= 1 && local.weekday <= 6 && local.hour >= 8 && local.hour < 20;
}

const DAY = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long" });
const TIME = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** « mardi 13 octobre à 10 h 30 », à l'heure de Paris. */
export function parisWhen(date: Date): string {
  const [hour, minute] = TIME.format(date).split(":");
  return `${DAY.format(date)} à ${Number(hour)} h${minute === "00" ? "" : ` ${minute}`}`;
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = { problem: 0, todo: 1, good: 2, info: 3 };
const PAYMENT_PROBLEMS = new Set(["PAST_DUE", "UNPAID", "INCOMPLETE"]);
const plural = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`;

export function robotAlerts(input: AlertInput): RobotAlert[] {
  const alerts: RobotAlert[] = [];
  const nowMs = input.now.getTime();

  // ---- Problèmes
  if (input.can.manageSettings && input.subscription && PAYMENT_PROBLEMS.has(input.subscription.status)) {
    alerts.push({
      key: `billing:${input.subscription.status}`,
      kind: "billing",
      severity: "problem",
      text: "Le dernier paiement de votre abonnement n'est pas passé. Vérifiez votre moyen de paiement pour garder PharmaBoost actif.",
      link: { href: "/parametres?onglet=abonnement", label: "Voir mon abonnement" },
      actions: [],
      snoozable: false,
    });
  }

  if (isOpeningHours(input.local)) {
    const silent = input.posts.filter((post) => {
      if (!input.can.manageTeam && !post.assignedToMe) return false;
      if (!post.lastSeenAt) return false;
      const age = nowMs - post.lastSeenAt.getTime();
      return age > POST_SILENT_MINUTES * 60_000 && age < POST_FORGOTTEN_DAYS * 86_400_000;
    });
    if (silent.length > 0) {
      const names = silent.map((post) => post.label).slice(0, 2).join(", ") + (silent.length > 2 ? "…" : "");
      alerts.push({
        key: `post-offline:${silent.map((post) => post.id).sort().join("|")}`,
        kind: "post-offline",
        severity: "problem",
        text: silent.length === 1 ? `${names} ne répond plus : les boîtes bipées n'y sont plus suivies. Vérifiez que l'ordinateur est allumé.` : `${silent.length} postes ne répondent plus (${names}) : les boîtes bipées n'y sont plus suivies.`,
        link: { href: "/installation", label: "Voir les postes" },
        actions: [],
        snoozable: true,
      });
    }
  }

  if (input.can.updateStock && !input.isDemo && input.lastDeposit && (input.lastDeposit.status === "FAILED" || input.lastDeposit.status === "REJECTED")) {
    alerts.push({
      key: `stock-deposit:${input.lastDeposit.id}`,
      kind: "stock-deposit",
      severity: "problem",
      text: "Votre dernier envoi de stock n'a pas pu être appliqué : votre stock n'a pas bougé. Renvoyez le fichier.",
      link: { href: "/stock/mise-a-jour", label: "Renvoyer mon stock" },
      actions: [],
      snoozable: true,
    });
  }

  // ---- À faire
  if (input.can.manageTeam) {
    for (const request of input.joinRequests) {
      alerts.push({
        key: `join-request:${request.id}`,
        kind: "join-request",
        severity: "todo",
        text: `${request.name} demande à rejoindre votre officine (${request.roleLabel.toLowerCase()}).`,
        link: { href: "/equipe", label: "Voir l'équipe" },
        actions: input.isDemo ? [] : [
          { kind: "approve-join", id: request.id, role: request.suggestedRole, label: "Accepter" },
          { kind: "refuse-join", id: request.id, label: "Refuser" },
        ],
        snoozable: true,
      });
    }
    for (const bonus of input.proposedBonuses) {
      alerts.push({
        key: `bonus-to-validate:${bonus.id}`,
        kind: "bonus-to-validate",
        severity: "todo",
        text: `La prime « ${bonus.label} » de ${bonus.userName} attend votre validation.`,
        link: { href: "/m/challenges/equipe", label: "Voir les primes" },
        actions: [{ kind: "validate-bonus", id: bonus.id, label: "Valider la prime" }],
        snoozable: true,
      });
    }
  }

  if (input.supportUnread > 0) {
    alerts.push({
      key: `support:${input.supportUnread}`,
      kind: "support",
      severity: "todo",
      text: `L'équipe PharmaBoost vous a répondu (${plural(input.supportUnread, "message non lu", "messages non lus")}).`,
      link: { href: "/support", label: "Lire la réponse" },
      actions: [],
      snoozable: true,
    });
  }

  if (input.shortDates.length > 0) {
    const known = input.shortDates.every((lot) => lot.quantity !== null && lot.quantity > 0);
    const count = known ? input.shortDates.reduce((sum, lot) => sum + (lot.quantity ?? 0), 0) : input.shortDates.length;
    const names = [...new Set(input.shortDates.map((lot) => lot.label.trim()).filter(Boolean))];
    const listed = names.slice(0, SHORT_DATE_NAMES).join(", ") + (names.length > SHORT_DATE_NAMES ? "…" : "");
    const soonest = Math.min(...input.shortDates.map((lot) => lot.daysLeft));
    alerts.push({
      key: `short-date:${names.slice(0, SHORT_DATE_NAMES).join("|")}:${count}`,
      kind: "short-date",
      severity: "todo",
      text: `${known ? plural(count, "boîte", "boîtes") : plural(count, "lot", "lots")} en date courte à proposer en premier : ${listed}${soonest <= 30 ? ` (la plus proche dans ${plural(soonest, "jour", "jours")})` : ""}.`,
      link: { href: "/stock/dates-courtes", label: "Voir les dates courtes" },
      actions: [],
      snoozable: true,
    });
  }

  if (input.can.updateStock && !input.isDemo && input.stockStale) {
    alerts.push({
      key: `stock:${input.stockAgeDays ?? "jamais"}`,
      kind: "stock",
      severity: "todo",
      text: input.stockAgeDays === null ? "Votre stock n'a jamais été envoyé : je conseille mieux avec ce que vous avez vraiment." : `Votre stock n'a pas été mis à jour depuis ${plural(input.stockAgeDays, "jour", "jours")}.`,
      link: { href: "/stock/mise-a-jour", label: "Mettre à jour mon stock" },
      actions: [],
      snoozable: true,
    });
  }

  // ---- Bonnes nouvelles
  for (const objective of input.myReachedObjectives) {
    alerts.push({ key: `objective-reached:${objective.id}`, kind: "objective-reached", severity: "good", text: `Bravo, objectif atteint : « ${objective.title} » !`, link: { href: "/m/challenges", label: "Voir mes objectifs" }, actions: [], snoozable: true });
  }
  if (input.can.manageTeam) {
    for (const objective of input.teamReachedObjectives) {
      alerts.push({
        key: `team-objective-reached:${objective.id}`,
        kind: "team-objective-reached",
        severity: "good",
        text: `${objective.userName} a atteint son objectif « ${objective.title} ».`,
        link: { href: "/m/challenges/equipe", label: "Féliciter ou proposer une prime" },
        actions: [],
        snoozable: true,
      });
    }
  }
  const near = closestChallenge(input.challenges);
  if (near) {
    alerts.push({
      key: `challenge:${near.challenge.id}:${near.goal}`,
      kind: "challenge",
      severity: "good",
      text: `Plus que ${plural(near.missing, "vente", "ventes")} « ${near.challenge.title} » pour le ${near.label} de ${near.goal}.`,
      link: input.challengeHref ? { href: input.challengeHref, label: "Voir le challenge" } : null,
      actions: [],
      snoozable: true,
    });
  }

  // ---- Pour information
  if (input.can.manageSettings && input.setup && input.setup.status !== "DONE") {
    const when = input.setup.status === "SCHEDULED" && input.setup.scheduledAt ? parisWhen(input.setup.scheduledAt) : null;
    alerts.push({
      key: `setup:${input.setup.status}:${input.setup.scheduledAt?.toISOString() ?? ""}`,
      kind: "setup",
      severity: "info",
      text: when ? `Votre mise en service est planifiée le ${when}.` : "Votre mise en service est à planifier : notre équipe vous appelle pour choisir la date.",
      link: { href: "/parametres?onglet=abonnement", label: "Voir mon abonnement" },
      actions: [],
      snoozable: true,
    });
  }
  if (input.training) {
    const t = input.training;
    alerts.push({
      key: `training:${t.href}`,
      kind: "training",
      severity: "info",
      text: t.mode === "continue" ? `Vous en êtes à ${t.percent} % de « ${t.title} ». On reprend ?` : `Une formation vous attend : « ${t.title} ».`,
      link: { href: t.href, label: t.mode === "continue" ? "Reprendre" : "Découvrir" },
      actions: [],
      snoozable: true,
    });
  }

  return alerts.map((alert, index) => ({ alert, index })).sort((a, b) => SEVERITY_ORDER[a.alert.severity] - SEVERITY_ORDER[b.alert.severity] || a.index - b.index).map(({ alert }) => alert);
}

/** Les alertes à montrer : sans celles mises de côté (« Plus tard », encore valable) ; une non écartable passe toujours. */
export function activeAlerts(alerts: readonly RobotAlert[], snoozedUntil: Readonly<Record<string, number>>, now: number): RobotAlert[] {
  return alerts.filter((alert) => !alert.snoozable || !((snoozedUntil[alert.key] ?? 0) > now));
}

/** L'humeur du robot selon l'alerte la plus importante : sérieux devant un problème, content d'une bonne nouvelle. */
export function moodForAlerts(alerts: readonly RobotAlert[]): RobotMood {
  const top = alerts[0];
  if (!top) return "idle";
  if (top.severity === "problem") return "concerned";
  if (top.severity === "good") return "happy";
  return "curious";
}

/** « Plus tard » : 24 h. */
export const SNOOZE_MS = 24 * 3600 * 1000;
