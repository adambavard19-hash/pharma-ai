import { buildConnectionOverview, type OverviewPost } from "@/core/stock/connection-overview";
import { noComptoirMessage, type MyComptoirs } from "@/core/counter/comptoirs";

/**
 * Le tableau de bord du comptoir : ce que le pharmacien voit sur « Nouvelle vente ».
 *
 * Le pharmacien travaille dans son logiciel de pharmacie, bipe ses boîtes, et PharmaBoost intervient au bon
 * moment. L'écran n'est donc pas un formulaire de saisie : c'est le second écran du comptoir, qui dit si le
 * poste est branché, ce qui arrive, et ce que la journée a donné.
 *
 * Il ne dit « connecté » que ce que le module de connexion prouve (`connection-overview.ts`) : un poste
 * APPAIRÉ qui a donné signe de vie il y a moins de dix minutes. Module pur : aucune base, l'heure est un paramètre.
 */

export type CounterState = "READY" | "OFFLINE" | "NOT_CONNECTED" | "UNASSIGNED";
export type PillTone = "success" | "warning" | "neutral";

export type CounterStatus = {
  state: CounterState;
  pill: { label: string; tone: PillTone };
  title: string;
  subtitle: string;
  /** Les comptoirs de CETTE personne, avec leur collaborateur et leur état : « Comptoir 2 · Léa Martin ✓ ». */
  posts: { id: string; label: string; owner: string | null; online: boolean }[];
  /** Installations commencées, pas encore terminées. */
  waitingInstall: number;
  /** Un poste répond, mais aucun bip n'est encore arrivé : le suivi n'est pas prouvé. */
  awaitingFirstScan: boolean;
};

/** « Comptoir 2 » se dit « Poste comptoir 2 » : un poste, pas un lieu. Un autre nom (« Caisse arrière ») reste tel que le titulaire l'a donné. */
export function postDisplayName(label: string): string {
  const trimmed = label.trim();
  const match = /^comptoir(\s+\S.*)?$/i.exec(trimmed);
  return match ? `Poste comptoir${match[1] ?? ""}` : trimmed;
}

export function buildCounterStatus(input: {
  now: Date;
  posts: OverviewPost[];
  /** Ce que cette personne voit : ses comptoirs. Absent : tous les postes (comportement historique). */
  mine?: Pick<MyComptoirs, "postIds" | "mode">;
  /** Le collaborateur de chaque comptoir, par identifiant de poste. */
  owners?: Record<string, string | null>;
  /** Cette personne peut-elle attribuer les comptoirs ? (le message d'un comptoir manquant ne dit pas la même chose.) */
  canAssign?: boolean;
}): CounterStatus {
  // Les comptoirs et le suivi des ventes ne dépendent que des postes : la liaison du serveur de l'officine n'y entre pas.
  const overview = buildConnectionOverview({ now: input.now, lgo: null, connection: null, posts: input.posts, stockSyncedAt: null, stockLines: null, stockProblem: null });
  const visible = input.mine ? new Set(input.mine.postIds) : null;
  const paired = overview.counters.filter((counter) => (counter.state === "CONNECTED" || counter.state === "OFFLINE") && (!visible || visible.has(counter.id)));
  const posts = paired.map((counter) => ({ id: counter.id, label: counter.label, owner: input.owners?.[counter.id] ?? null, online: counter.state === "CONNECTED" }));
  const waitingInstall = overview.counters.filter((counter) => counter.state === "TO_INSTALL").length;

  // Plusieurs comptoirs dans la pharmacie et aucun pour cette personne : elle ne voit rien des autres, et on lui dit pourquoi.
  if (input.mine?.mode === "NONE" && overview.counters.some((counter) => counter.state === "CONNECTED" || counter.state === "OFFLINE")) {
    return { state: "UNASSIGNED", pill: { label: "Comptoir à choisir", tone: "neutral" }, title: "Aucun comptoir ne vous est attribué.", subtitle: noComptoirMessage("NONE", input.canAssign === true) ?? "", posts: [], waitingInstall, awaitingFirstScan: false };
  }

  if (posts.some((post) => post.online)) {
    return {
      state: "READY",
      pill: { label: "Connecté", tone: "success" },
      title: "Votre comptoir est prêt.",
      subtitle: "PharmaBoost vous accompagne pendant les délivrances.",
      posts,
      waitingInstall,
      awaitingFirstScan: overview.sales.state === "WAITING_SCAN",
    };
  }
  if (posts.length > 0) {
    const last = paired.find((counter) => counter.state === "OFFLINE");
    return {
      state: "OFFLINE",
      pill: { label: "Hors ligne", tone: "warning" },
      title: "Votre comptoir ne répond plus.",
      subtitle: `Les boîtes bipées ne sont plus suivies tant que le poste ne répond pas.${last ? ` ${last.detail}` : ""}`,
      posts,
      waitingInstall,
      awaitingFirstScan: false,
    };
  }
  return {
    state: "NOT_CONNECTED",
    pill: { label: "Non connecté", tone: "neutral" },
    title: "Votre comptoir n'est pas encore connecté.",
    subtitle:
      waitingInstall > 0
        ? "Une installation reste à terminer sur l'ordinateur du comptoir."
        : "Reliez le poste de caisse : les conseils apparaîtront d'eux-mêmes à chaque boîte bipée.",
    posts: [],
    waitingInstall,
    awaitingFirstScan: false,
  };
}

/** Les chiffres du jour, bruts : l'écran les met en forme (« — » tant qu'il n'y a rien à dire). */
export type CounterStats = {
  /** Délivrances arrivées de la douchette aujourd'hui. */
  detected: number;
  accepted: number;
  declined: number;
  /** Ventes encaissées aujourd'hui. */
  salesCount: number;
  attributedCents: number;
};

export type CounterFigures = { detected: string; accepted: string; additional: string };

/** « — » partout où il n'y a rien à compter : un zéro dirait « rien n'a été accepté », ce qui n'est pas la même chose. */
export function counterFigures(stats: CounterStats, formatMoney: (cents: number) => string): CounterFigures {
  const decided = stats.accepted + stats.declined;
  return {
    detected: stats.detected > 0 ? String(stats.detected) : "—",
    accepted: decided > 0 ? `${stats.accepted} / ${decided}` : "—",
    additional: stats.salesCount > 0 ? formatMoney(stats.attributedCents) : "—",
  };
}

export type StageTone = "neutral" | "brand" | "success" | "warning";

/** Où en est une vente, dit comme le comptoir la dirait. */
export function describeSaleStage(status: string, recommendations: number): { label: string; tone: StageTone } {
  switch (status) {
    case "DRAFT":
    case "EXTRACTING":
      return { label: "en préparation", tone: "neutral" };
    case "NEEDS_VERIFICATION":
      return { label: "à confirmer", tone: "warning" };
    case "VERIFIED":
    case "ANALYZING":
      return { label: "analyse en cours", tone: "neutral" };
    case "ANALYZED":
      return recommendations > 0
        ? { label: `${recommendations} conseil${recommendations > 1 ? "s" : ""} à décider`, tone: "brand" }
        : { label: "aucun conseil à proposer", tone: "neutral" };
    case "VALIDATED":
      return { label: "plan à remettre", tone: "brand" };
    case "DELIVERED":
      return { label: "terminée", tone: "success" };
    case "CANCELLED":
      return { label: "clôturée", tone: "neutral" };
    case "FAILED":
      return { label: "analyse échouée", tone: "warning" };
    default:
      return { label: "en cours", tone: "neutral" };
  }
}

/** Deux produits au plus, puis « +N » : une ligne de liste, pas un ticket de caisse. */
export function summarizeProducts(names: string[], total: number = names.length): string {
  const shown = names.filter((name) => name.trim().length > 0).slice(0, 2);
  if (shown.length === 0) return total > 0 ? `${total} produit${total > 1 ? "s" : ""}` : "Aucun produit";
  const more = total - shown.length;
  return `${shown.join(" · ")}${more > 0 ? ` +${more}` : ""}`;
}

const PARIS = "Europe/Paris";

function parisDay(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: PARIS, day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

/** « 14:32 » aujourd'hui, « hier 14:32 », sinon « 06/10 14:32 » : l'heure à Paris, quelle que soit celle du serveur. */
export function describeWhen(date: Date, now: Date): string {
  const hour = new Intl.DateTimeFormat("fr-FR", { timeZone: PARIS, hour: "2-digit", minute: "2-digit" }).format(date);
  if (parisDay(date) === parisDay(now)) return hour;
  if (parisDay(date) === parisDay(new Date(now.getTime() - 86_400_000))) return `hier ${hour}`;
  const day = new Intl.DateTimeFormat("fr-FR", { timeZone: PARIS, day: "2-digit", month: "2-digit" }).format(date);
  return `${day} ${hour}`;
}

/** Les médicaments d'une ordonnance affichés sous son titre ; le reste se lit dans la vente. */
export const ACTIVITY_LINES_SHOWN = 6;

/** « ORD-0780 » se dit « Ordonnance 0780 » : le numéro, comme on le dirait au comptoir. */
export function ordonnanceTitle(reference: string): string {
  const number = reference.replace(/^ORD-?/i, "").trim();
  return number ? `Ordonnance ${number}` : "Ordonnance";
}

export type ActivityItem = {
  id: string;
  /** « 14:32 », « hier 14:32 ». */
  when: string;
  /** Le patient, ou `null` tant qu'il n'est pas associé. */
  patient: string | null;
  /** Les médicaments de CETTE ordonnance, un par ligne : on voit ce qui est dans la même ordonnance. */
  lines: { name: string; quantity: number }[];
  /** Combien de lignes de plus que celles montrées. */
  moreLines: number;
  /** Le comptoir d'où elle vient, avec son collaborateur : « Comptoir 2 · Léa Martin » ; `null` pour une saisie à l'écran. */
  comptoir: string | null;
  stage: { label: string; tone: StageTone };
  reference: string;
};

export type CounterDashboardData = {
  status: CounterStatus;
  stats: CounterStats;
  activity: ActivityItem[];
};
