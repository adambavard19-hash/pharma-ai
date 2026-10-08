import { describeAge, LGO_DEFINITIONS, type LgoDefinition } from "./connectors";
import { stockAgeDays, stockReminderLevel } from "@/core/stock-deposit/rules";

/**
 * L'état de la connexion, en trois questions SÉPARÉES — jamais mélangées.
 *
 *   1. PharmaBoost Connect est-il installé et en ligne ?  (la connexion)
 *   2. Le stock est-il arrivé, et de quand date-t-il ?     (le stock reçu)
 *   3. Les ventes sont-elles suivies ?                     (les ventes)
 *
 * Un stock peut être à jour sans aucun programme installé (un fichier envoyé
 * à la main) ; un programme peut être en ligne sans qu'aucun stock ne soit
 * arrivé ; les ventes se suivent au bip d'un poste, pas par le logiciel de
 * l'officine. Les anciens écrans disaient « agent connecté » et « agent
 * injoignable » dans la même carte, parce qu'ils fondaient les trois questions
 * en une seule. Ce module est la seule source des statuts de la connexion :
 * tous les écrans lisent ce qu'il rend.
 *
 * Module pur : aucune base, aucune session, l'heure est un paramètre.
 */

export type Tone = "success" | "warning" | "danger" | "neutral";

/** Un appareil « en ligne » a donné signe de vie depuis moins de dix minutes (un signe de vie par minute). */
export const ONLINE_WITHIN_SECONDS = 10 * 60;

export type OverviewConnection = {
  status: string;
  pairedAt: Date | null;
  lastSeenAt: Date | null;
  lastSyncAt: Date | null;
  lastSyncLines: number | null;
  lastError: string | null;
  hostname: string | null;
  agentVersion: string | null;
  pairingExpiresAt: Date | null;
};

export type OverviewPost = {
  id: string;
  label: string | null;
  hostname: string;
  pairedAt: Date | null;
  lastSeenAt: Date | null;
  lastScanAt: Date | null;
  scanCount: number;
  version: string | null;
  pairingExpiresAt: Date | null;
};

export type OverviewInput = {
  now: Date;
  /** Le logiciel choisi ou connu, ou `null` tant que rien n'est choisi. */
  lgo: string | null;
  connection: OverviewConnection | null;
  posts: OverviewPost[];
  stockSyncedAt: Date | null;
  /** Les lignes du dernier stock reçu, quand on les connaît. */
  stockLines: number | null;
  /** Le dernier fichier envoyé qui n'a pas été appliqué, s'il y en a un à signaler. */
  stockProblem: "HELD" | "FAILED" | "REJECTED" | null;
};

export type AgentItem = {
  kind: "server" | "post";
  id: string;
  label: string;
  online: boolean;
  seenAgeSeconds: number | null;
  version: string | null;
};

export type ConnectionOverview = {
  agent: {
    state: "NOT_INSTALLED" | "WAITING" | "ONLINE" | "OFFLINE";
    tone: Tone;
    title: string;
    detail: string;
    items: AgentItem[];
    /** Ce que l'agent du serveur signale (dossier introuvable, export refusé…), tel quel. */
    notice: string | null;
  };
  stock: {
    state: "NONE" | "FRESH" | "OLD";
    tone: Tone;
    title: string;
    detail: string;
    receivedAt: Date | null;
    lines: number | null;
    ageDays: number | null;
    /** Un fichier envoyé depuis n'a pas été appliqué : le stock affiché est celui d'avant. */
    problem: string | null;
  };
  sales: {
    state: "NO_POST" | "POST_OFFLINE" | "FOLLOWED";
    tone: Tone;
    title: string;
    detail: string;
    lastScanAt: Date | null;
    scanCount: number;
  };
  /** La phrase à lire en dix secondes, et l'étape où agir. */
  headline: { tone: Tone; title: string; detail: string | null; step: 1 | 2 | 3; action: string | null };
};

const PROBLEM_TEXT = {
  HELD: "Votre dernier fichier est en vérification par l'équipe PharmaBoost : le stock n'a pas changé.",
  FAILED: "Votre dernier fichier n'a pas pu être lu : le stock n'a pas changé.",
  REJECTED: "Votre dernier fichier n'a pas été appliqué : le stock n'a pas changé.",
} as const;

const plural = (count: number, one: string, many: string) => (count > 1 ? many : one);

function describeDay(date: Date, now: Date): string {
  const fmt = (d: Date) => new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
  const hour = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(date);
  const days = stockAgeDays(date, now) ?? 0;
  const same = fmt(date) === fmt(now);
  return same ? `aujourd'hui à ${hour}` : days <= 1 && fmt(date) === fmt(new Date(now.getTime() - 86_400_000)) ? `hier à ${hour}` : `le ${fmt(date)} à ${hour}`;
}

function ageSeconds(date: Date | null, now: Date): number | null {
  return date ? Math.max(0, Math.round((now.getTime() - date.getTime()) / 1000)) : null;
}

export function buildConnectionOverview(input: OverviewInput): ConnectionOverview {
  const { now, connection, posts } = input;

  // ---- 1. La connexion : les appareils installés, et ceux qui attendent leur installation.
  const items: AgentItem[] = [];
  let waiting = 0;
  const serverInstalled = Boolean(connection && connection.pairedAt && connection.status !== "DISCONNECTED" && connection.status !== "PENDING");
  if (connection && serverInstalled) {
    const seen = ageSeconds(connection.lastSeenAt, now);
    items.push({ kind: "server", id: "server", label: connection.hostname ? `Serveur ${connection.hostname}` : "Serveur de l'officine", online: seen !== null && seen <= ONLINE_WITHIN_SECONDS, seenAgeSeconds: seen, version: connection.agentVersion });
  } else if (connection?.pairingExpiresAt && connection.pairingExpiresAt > now) {
    waiting += 1;
  }
  for (const post of posts) {
    if (post.pairedAt) {
      const seen = ageSeconds(post.lastSeenAt, now);
      items.push({ kind: "post", id: post.id, label: post.label || post.hostname || "Poste de comptoir", online: seen !== null && seen <= ONLINE_WITHIN_SECONDS, seenAgeSeconds: seen, version: post.version });
    } else if (post.pairingExpiresAt && post.pairingExpiresAt > now) {
      waiting += 1;
    }
  }
  const online = items.filter((item) => item.online);
  const notice = serverInstalled && connection?.lastError ? connection.lastError : null;
  let agent: ConnectionOverview["agent"];
  if (items.length === 0) {
    agent =
      waiting > 0
        ? { state: "WAITING", tone: "neutral", title: "En attente de l'installation", detail: `${waiting} installation${waiting > 1 ? "s" : ""} à terminer sur l'ordinateur concerné.`, items, notice }
        : { state: "NOT_INSTALLED", tone: "neutral", title: "Pas encore installé", detail: "PharmaBoost Connect envoie votre stock et suit les ventes du comptoir. Il est facultatif : un fichier suffit pour démarrer.", items, notice };
  } else if (online.length > 0) {
    const offline = items.length - online.length;
    agent = {
      state: "ONLINE",
      tone: notice ? "warning" : "success",
      title: notice ? "Connecté, avec un message" : "Connecté",
      detail: `${online.length} appareil${online.length > 1 ? "s" : ""} en ligne${offline > 0 ? ` · ${offline} hors ligne` : ""}${notice ? ` · ${notice}` : ""}`,
      items,
      notice,
    };
  } else {
    const newest = Math.min(...items.map((item) => item.seenAgeSeconds ?? Number.POSITIVE_INFINITY));
    agent = {
      state: "OFFLINE",
      tone: "warning",
      title: "Ne répond plus",
      detail: Number.isFinite(newest) ? `Dernier signe de vie ${describeAge(newest)}. L'ordinateur est peut-être éteint ou hors réseau.` : "Aucun signe de vie reçu pour l'instant.",
      items,
      notice,
    };
  }

  // ---- 2. Le stock reçu : indépendant de la connexion.
  const received = input.stockSyncedAt;
  const days = stockAgeDays(received, now);
  const problem = input.stockProblem ? PROBLEM_TEXT[input.stockProblem] : null;
  let stock: ConnectionOverview["stock"];
  if (!received) {
    stock = { state: "NONE", tone: problem ? "warning" : "neutral", title: "Aucun stock reçu", detail: problem ?? "Envoyez votre stock : PharmaBoost ne conseille que ce que vous avez en rayon.", receivedAt: null, lines: null, ageDays: null, problem };
  } else {
    const fresh = stockReminderLevel(received, now) === "none";
    const when = describeDay(received, now);
    const lines = input.stockLines;
    const detail = `Reçu ${when}${lines !== null ? ` · ${lines.toLocaleString("fr-FR")} ligne${lines > 1 ? "s" : ""}` : ""}`;
    stock = fresh
      ? { state: "FRESH", tone: problem ? "warning" : "success", title: "Stock à jour", detail: problem ? `${detail}. ${problem}` : detail, receivedAt: received, lines, ageDays: days, problem }
      : { state: "OLD", tone: "warning", title: `Stock ancien : ${days ?? 0} jour${(days ?? 0) > 1 ? "s" : ""}`, detail: `${detail}. Mettez-le à jour.${problem ? ` ${problem}` : ""}`, receivedAt: received, lines, ageDays: days, problem };
  }

  // ---- 3. Les ventes : suivies au bip d'un poste de comptoir, pas par le logiciel de l'officine.
  const pairedPosts = items.filter((item) => item.kind === "post");
  const postsOnline = pairedPosts.filter((item) => item.online);
  const lastScanAt = posts.map((post) => post.lastScanAt).filter((date): date is Date => date !== null).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const scanCount = posts.reduce((sum, post) => sum + post.scanCount, 0);
  let sales: ConnectionOverview["sales"];
  if (pairedPosts.length === 0) {
    sales = { state: "NO_POST", tone: "neutral", title: "Ventes non suivies", detail: "Un poste de comptoir relié suit chaque boîte bipée à la douchette. Lire les ventes du logiciel lui-même n'est pas disponible.", lastScanAt: null, scanCount };
  } else if (postsOnline.length === 0) {
    sales = { state: "POST_OFFLINE", tone: "warning", title: "Poste hors ligne", detail: "Les boîtes bipées ne sont plus suivies tant que le poste ne répond pas.", lastScanAt, scanCount };
  } else {
    sales = {
      state: "FOLLOWED",
      tone: "success",
      title: "Ventes suivies au bip",
      detail: `${postsOnline.length} ${plural(postsOnline.length, "poste", "postes")} en ligne${lastScanAt ? ` · dernier bip ${describeAge(ageSeconds(lastScanAt, now))}` : " · aucun bip reçu encore"}`,
      lastScanAt,
      scanCount,
    };
  }

  // ---- La phrase de dix secondes.
  let headline: ConnectionOverview["headline"];
  if (!input.lgo && !received && items.length === 0) {
    headline = { tone: "neutral", title: "Commençons : quel logiciel utilisez-vous ?", detail: null, step: 1, action: "Choisir mon logiciel" };
  } else if (!received) {
    headline = { tone: "warning", title: "Il manque votre stock", detail: problem ?? "Envoyez-le pour que le comptoir puisse conseiller.", step: 2, action: "Envoyer mon stock" };
  } else if (stock.state === "OLD") {
    headline = { tone: "warning", title: `Votre stock date de ${days ?? 0} jour${(days ?? 0) > 1 ? "s" : ""}`, detail: "Les conseils sont moins justes. Une minute suffit pour le mettre à jour.", step: 2, action: "Mettre à jour mon stock" };
  } else if (agent.state === "OFFLINE") {
    headline = { tone: "warning", title: "PharmaBoost Connect ne répond plus", detail: `${agent.detail} Votre stock reste à jour : ${stock.detail.toLowerCase()}.`, step: 3, action: "Voir l'état" };
  } else {
    headline = { tone: problem ? "warning" : "success", title: problem ? "Stock à jour, mais un fichier est à revoir" : "Tout fonctionne", detail: stock.detail, step: 3, action: null };
  }

  return { agent, stock, sales, headline };
}

// ---- Les méthodes réellement disponibles pour un logiciel --------------------------------------

export type ConnectionMethods = {
  lgo: LgoDefinition | null;
  /** Envoyer un fichier : disponible pour tout logiciel qui sait exporter son stock. */
  file: { available: true };
  /**
   * PharmaBoost Connect : envoie le fichier dès qu'il est enregistré dans un dossier. Pour LGPI, la
   * procédure a été essayée sur un vrai export ; pour les autres, l'export est à programmer et n'a pas
   * été essayé : la carte le dit, elle ne promet pas de synchronisation.
   */
  connect: { available: true; tested: boolean; badge: string; note: string };
  /** La lecture directe du logiciel de l'officine : jamais disponible sans l'accord de son éditeur. */
  direct: { available: false; badge: string; reason: string };
};

export function connectionMethods(lgoId: string | null): ConnectionMethods {
  const lgo = LGO_DEFINITIONS.find((candidate) => candidate.id === lgoId) ?? null;
  const tested = lgo?.adapter === "PILOT";
  return {
    lgo,
    file: { available: true },
    connect: {
      available: true,
      tested,
      badge: tested ? "Essayé avec un vrai export" : "Export à programmer",
      note: tested
        ? `${lgo!.label} n'envoie pas son stock tout seul : vous enregistrez l'édition d'inventaire dans le dossier PharmaBoost, et PharmaBoost la lit dans la minute.`
        : "Votre logiciel doit enregistrer un export du stock dans le dossier PharmaBoost, à programmer avec son éditeur. Non essayé avec ce logiciel.",
    },
    direct: { available: false, badge: "Pas disponible", reason: "Lire les ventes du logiciel en direct demande l'accord de son éditeur." },
  };
}
