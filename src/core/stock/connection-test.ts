import { describeAge } from "./connectors";
import { ONLINE_WITHIN_SECONDS, type ConnectionOverview, type Tone } from "./connection-overview";
import { compareVersions } from "@/core/admin/agent-version";
import { describeRobot, resolveRobotIntegration, type RobotSetup } from "@/core/robot/integration";

/**
 * « Tester ma connexion » : une liste de contrôles, chacun tiré de ce que PharmaBoost a
 * RÉELLEMENT reçu — signes de vie, dates, erreurs que les programmes signalent. Rien n'est
 * supposé : si une chose ne peut pas être vérifiée d'ici, le contrôle le dit au lieu de la
 * déclarer bonne.
 *
 * Ce que le test ne fait pas, et dit : il ne se connecte pas aux ordinateurs de l'officine
 * (PharmaBoost n'y a pas accès) ; il lit ce que leurs programmes ont envoyé. Les lire juste
 * après un redémarrage donne donc l'état d'avant le redémarrage.
 *
 * Quatre statuts : `ok` (vérifié, ça marche), `warn` (à regarder), `fail` (un programme
 * signale une erreur, ou un envoi a échoué), `info` (rien à corriger : facultatif ou pas
 * encore disponible). Seuls `warn` et `fail` comptent comme « à corriger ».
 *
 * Module pur : aucune base, aucune session, l'heure est un paramètre.
 */

export type CheckStatus = "ok" | "warn" | "fail" | "info";
export type CheckGroup = "software" | "connect" | "stock" | "sales" | "robot";

export type TestCheck = {
  id: string;
  group: CheckGroup;
  status: CheckStatus;
  /** Ce qui a été contrôlé, en quelques mots. */
  title: string;
  /** Ce qui a été constaté. */
  detail: string;
  /** Quoi faire, en une phrase, quand ce n'est pas bon. */
  fix: string | null;
};

export const GROUP_LABELS: Record<CheckGroup, string> = {
  software: "Mon logiciel",
  connect: "PharmaBoost Connect",
  stock: "Mon stock",
  sales: "Mes ventes",
  robot: "Mon robot",
};

export type TestPost = {
  id: string;
  label: string | null;
  hostname: string;
  pairedAt: Date | null;
  lastSeenAt: Date | null;
  lastScanAt: Date | null;
  scanCount: number;
  version: string | null;
  exportPath: string | null;
  lastExportAt: Date | null;
  lastExportError: string | null;
};

export type TestConnection = {
  status: string;
  pairedAt: Date | null;
  lastSeenAt: Date | null;
  lastSyncAt: Date | null;
  lastError: string | null;
  agentVersion: string | null;
  hostname: string | null;
  exportPath: string | null;
};

export type ConnectionTestInput = {
  now: Date;
  lgo: string | null;
  /** Le nom du logiciel tel que le titulaire le lit (« LGPI »). */
  lgoLabel: string | null;
  overview: ConnectionOverview;
  connection: TestConnection | null;
  posts: TestPost[];
  latestAgentVersion: string;
  robot: RobotSetup | null;
};

export type ConnectionTestResult = {
  at: Date;
  tone: Tone;
  title: string;
  detail: string;
  counts: { ok: number; toFix: number; info: number };
  checks: TestCheck[];
  /** Ce que ce test ne peut pas voir, dit en clair. */
  limits: string;
};

const LIMITS = "Ce test lit ce que vos programmes ont envoyé à PharmaBoost ; il ne se connecte pas à vos ordinateurs. Après un redémarrage, patientez une minute avant de le relancer.";

const days = (n: number) => `${n} jour${n > 1 ? "s" : ""}`;

function ageSeconds(date: Date | null, now: Date): number | null {
  return date ? Math.max(0, Math.round((now.getTime() - date.getTime()) / 1000)) : null;
}

const OFFLINE_FIX = "Vérifiez que l'ordinateur est allumé et connecté à Internet. Redémarrez-le : PharmaBoost se relance tout seul et l'icône réapparaît près de l'horloge.";

export function buildConnectionTest(input: ConnectionTestInput): ConnectionTestResult {
  const { now, overview, posts } = input;
  const checks: TestCheck[] = [];
  const add = (check: TestCheck) => checks.push(check);

  // ---- Mon logiciel
  if (!input.lgo) {
    // Le pharmacien ne choisit plus son logiciel à l'écran (le guide est celui de LGPI) : « non précisé » n'est pas un manque.
    add({ id: "software", group: "software", status: "info", title: "Logiciel de l'officine", detail: "Non précisé. Il s'enregistre à l'installation du serveur de l'officine.", fix: null });
  } else {
    add({ id: "software", group: "software", status: "ok", title: "Logiciel de l'officine", detail: `${input.lgoLabel ?? input.lgo}.`, fix: null });
  }

  // ---- PharmaBoost Connect : chaque appareil installé
  const installed = overview.agent.items;
  if (installed.length === 0) {
    add(
      overview.agent.state === "WAITING"
        ? { id: "connect", group: "connect", status: "info", title: "Installation de PharmaBoost Connect", detail: overview.agent.detail, fix: "Ouvrez le lien d'installation sur l'ordinateur concerné et double-cliquez le fichier téléchargé." }
        : { id: "connect", group: "connect", status: "info", title: "PharmaBoost Connect", detail: "Pas installé. C'est facultatif : un fichier suffit pour le stock. Pour suivre les ventes au bip, il faut le relier à un poste de comptoir.", fix: null },
    );
  }
  for (const item of installed) {
    if (item.online) {
      add({ id: `device-${item.kind}-${item.id}`, group: "connect", status: "ok", title: `${item.label} répond`, detail: `Signe de vie ${describeAge(item.seenAgeSeconds)}.`, fix: null });
    } else {
      add({
        id: `device-${item.kind}-${item.id}`,
        group: "connect",
        status: "warn",
        title: `${item.label} ne répond plus`,
        detail: item.seenAgeSeconds === null ? "Aucun signe de vie reçu depuis l'installation." : `Dernier signe de vie ${describeAge(item.seenAgeSeconds)} (au-delà de ${ONLINE_WITHIN_SECONDS / 60} minutes, l'appareil est considéré hors ligne).`,
        fix: OFFLINE_FIX,
      });
    }
    const version = item.version;
    if (version && compareVersions(version, input.latestAgentVersion) < 0) {
      add({
        id: `version-${item.kind}-${item.id}`,
        group: "connect",
        status: "info",
        title: `${item.label} : version ${version}`,
        detail: `La dernière version est la ${input.latestAgentVersion}.`,
        fix: item.kind === "post" ? "Un poste installé avec l'installateur se met à jour tout seul. Un poste installé à l'ancienne : le réinstaller avec le lien d'installation." : "Relancez l'installation sur le serveur pour mettre le programme à jour.",
      });
    }
  }
  if (overview.agent.notice) {
    add({ id: "server-notice", group: "connect", status: "fail", title: "Le programme du serveur signale un problème", detail: overview.agent.notice, fix: "Vérifiez le dossier d'export indiqué dans « Configuration avancée » : il doit exister sur le serveur." });
  }

  // ---- Mon stock : le dernier envoi
  const stock = overview.stock;
  if (stock.state === "NONE") {
    add({ id: "stock-received", group: "stock", status: "warn", title: "Stock reçu", detail: "PharmaBoost n'a encore reçu aucun stock.", fix: "Envoyez votre stock à l'étape 2 : un fichier suffit." });
  } else if (stock.state === "FRESH") {
    add({ id: "stock-received", group: "stock", status: "ok", title: "Stock reçu", detail: stock.detail, fix: null });
  } else {
    add({ id: "stock-received", group: "stock", status: "warn", title: "Stock reçu", detail: `Le dernier stock date de ${days(stock.ageDays ?? 0)}.`, fix: "Envoyez un nouveau fichier de votre logiciel : les conseils sont moins justes avec un vieux stock." });
  }
  if (stock.state !== "NONE" && stock.references === 0) {
    add({ id: "stock-empty", group: "stock", status: "warn", title: "Références en stock", detail: "Le stock reçu ne contient aucune référence disponible.", fix: "Vérifiez que le fichier envoyé est bien l'édition complète du stock, avec les quantités." });
  } else if (stock.references !== null && stock.references > 0) {
    add({ id: "stock-references", group: "stock", status: "ok", title: "Références en stock", detail: `${stock.references.toLocaleString("fr-FR")} références disponibles pour les conseils.`, fix: null });
  }
  if (stock.ignored !== null && stock.ignored > 0) {
    add({ id: "stock-ignored", group: "stock", status: "warn", title: "Lignes illisibles", detail: `${stock.ignored.toLocaleString("fr-FR")} ligne${stock.ignored > 1 ? "s" : ""} du dernier fichier n'ont pas pu être lues.`, fix: "Ouvrez « Mes derniers envois de stock » pour voir lesquelles, ou renvoyez un export complet." });
  }
  if (stock.problem) {
    add({ id: "stock-problem", group: "stock", status: "fail", title: "Dernier fichier envoyé", detail: stock.problem, fix: "Envoyez votre stock complet (tous les produits en stock), pas seulement les nouveautés." });
  }

  // ---- Mon stock : l'envoi automatique, vérifié seulement s'il a vraiment eu lieu (calculé une fois, dans l'aperçu)
  const auto = overview.autoSync;
  if (auto.state === "NONE") {
    add({ id: "stock-auto", group: "stock", status: "info", title: "Envoi automatique du stock", detail: auto.detail, fix: null });
  } else if (auto.state === "WAITING") {
    add({ id: "stock-auto", group: "stock", status: "warn", title: "Envoi automatique du stock", detail: auto.detail, fix: `Enregistrez l'édition de stock${input.lgoLabel ? ` de ${input.lgoLabel}` : ""} dans le dossier PharmaBoost : le programme la lit dans la minute.` });
  } else if (auto.state === "ACTIVE") {
    add({ id: "stock-auto", group: "stock", status: "ok", title: "Envoi automatique du stock", detail: auto.detail, fix: null });
  } else {
    add({ id: "stock-auto", group: "stock", status: "warn", title: "Envoi automatique du stock", detail: auto.detail, fix: "Votre logiciel n'enregistre pas son stock tout seul : refaites l'export dans le dossier PharmaBoost, ou faites-le programmer par son éditeur." });
  }
  for (const post of posts) {
    if (post.pairedAt && post.exportPath && post.lastExportError) {
      add({ id: `export-error-${post.id}`, group: "stock", status: "fail", title: `${post.label || post.hostname || "Poste"} : lecture du dossier d'export`, detail: post.lastExportError, fix: "Vérifiez que le dossier existe et qu'il est accessible depuis ce poste (Configuration avancée → Postes de comptoir)." });
    }
  }

  // ---- Mes ventes
  const sales = overview.sales;
  if (sales.state === "NO_POST") {
    add({ id: "sales", group: "sales", status: "info", title: "Ventes suivies au bip", detail: "Aucun poste de comptoir relié. Lire les ventes du logiciel lui-même n'est pas disponible.", fix: "Installez PharmaBoost Connect sur l'ordinateur où la douchette est branchée (étape 2)." });
  } else if (sales.state === "POST_OFFLINE") {
    add({ id: "sales", group: "sales", status: "warn", title: "Ventes suivies au bip", detail: "Le poste de comptoir ne répond pas : les boîtes bipées ne sont pas suivies.", fix: OFFLINE_FIX });
  } else if (sales.state === "WAITING_SCAN") {
    add({ id: "sales", group: "sales", status: "warn", title: "Ventes suivies au bip", detail: "Le poste répond, mais aucun bip n'a encore été reçu : le suivi n'est pas prouvé.", fix: "Faites l'essai du bip ci-dessous : bipez une boîte au comptoir." });
  } else {
    add({ id: "sales", group: "sales", status: "ok", title: "Ventes suivies au bip", detail: `${sales.scanCount.toLocaleString("fr-FR")} bip${sales.scanCount > 1 ? "s" : ""} reçu${sales.scanCount > 1 ? "s" : ""}${sales.lastScanAt ? ` · dernier ${describeAge(ageSeconds(sales.lastScanAt, now))}` : ""}.`, fix: null });
  }

  // ---- Mon robot : jamais de connexion simulée
  const integration = resolveRobotIntegration(input.robot?.manufacturer, input.lgo);
  if (!input.robot) {
    add({ id: "robot", group: "robot", status: "info", title: "Robot de dispensation", detail: "Aucun robot renseigné. C'est facultatif : sans robot, les conseils se déclenchent au bip.", fix: null });
  } else {
    add({
      id: "robot",
      group: "robot",
      status: integration.stage === "AVAILABLE" ? "ok" : "info",
      title: describeRobot(input.robot) ?? "Robot de dispensation",
      detail: integration.stage === "PREPARING" ? "Intégration en préparation : PharmaBoost ne lit rien du robot, aucune connexion n'est testée." : integration.label,
      fix: null,
    });
  }

  // ---- Le verdict
  const fails = checks.filter((check) => check.status === "fail");
  const warns = checks.filter((check) => check.status === "warn");
  const toFix = fails.length + warns.length;
  const counts = { ok: checks.filter((check) => check.status === "ok").length, toFix, info: checks.filter((check) => check.status === "info").length };
  let tone: Tone;
  let title: string;
  let detail: string;
  if (fails.length > 0) {
    tone = "danger";
    title = `${fails.length} erreur${fails.length > 1 ? "s" : ""} à corriger`;
    detail = `${fails[0].title} : ${fails[0].detail}`;
  } else if (warns.length > 0) {
    tone = "warning";
    title = `${warns.length} point${warns.length > 1 ? "s" : ""} à regarder`;
    detail = `${counts.ok} contrôle${counts.ok > 1 ? "s" : ""} réussi${counts.ok > 1 ? "s" : ""}. Commencez par : ${warns[0].title}.`;
  } else if (counts.ok === 0) {
    tone = "neutral";
    title = "Rien à contrôler pour l'instant";
    detail = "Choisissez votre logiciel et envoyez votre stock : le test vérifiera chaque étape.";
  } else {
    tone = "success";
    title = "Tout ce qui peut être vérifié fonctionne";
    detail = `${counts.ok} contrôle${counts.ok > 1 ? "s" : ""} réussi${counts.ok > 1 ? "s" : ""}${counts.info > 0 ? `, ${counts.info} information${counts.info > 1 ? "s" : ""} sans action` : ""}.`;
  }
  return { at: now, tone, title, detail, counts, checks, limits: LIMITS };
}
