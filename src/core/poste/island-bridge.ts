import type { HostDone, HostEntry, HostItem } from "../../../agent/src/notice-center";
import { BANNER } from "../../../agent/src/banner-design";
import { saleAdvicePath } from "../../../agent/src/sale-link";
import { analysisSteps, INITIAL_ISLAND, type IslandOutcome, type IslandStage, type IslandState } from "@/core/island/banner-flow";

/**
 * Le pont entre l'agent du poste Windows et l'île affichée dans WebView2 (page `/poste/ile`).
 *
 * L'agent parle à l'île EXACTEMENT comme à la bannière GDI+ : les mêmes commandes JSON (init, scan, show, done,
 * remove, look, quit), transmises telles quelles par le petit programme Windows (agent/src/notice-host-ile.ts). L'île
 * répond par les mêmes mots (VENDU, NONVENDU, ANNULER, EMAIL, TERMINER, REPONSE, VOIR, FERMEE) : l'agent n'a rien
 * d'autre à apprendre, et la bannière GDI+ reste un secours prêt à prendre le relais.
 *
 * Module pur : la traduction des commandes en état d'affichage (reducer), et des gestes en mots.
 * Aucune donnée n'est demandée au serveur par la page : tout vient de l'agent.
 */

export type HostCommand =
  | { op: "init"; look?: number; position?: string; postLabel?: string; pharmacyName?: string }
  | { op: "scan" }
  | { op: "show"; entry: HostEntry }
  | { op: "done"; info: HostDone }
  | { op: "remove"; id: string }
  | { op: "look"; look: number }
  /** Le bonjour du robot au démarrage du poste (agent/src/greeting.ts) : le texte complet, accents relus par JSON.parse. */
  | { op: "greet"; text: string }
  /** La place de la bannière sur l'écran, choisie au poste (menu de l'icône PharmaBoost) : l'île s'y range et s'y adapte. */
  | { op: "place"; side: IslandSide }
  /** Le bip était un conseil de la vente (il passe en « Vendu ») : la bannière revient à la vente, sans rejouer d'analyse. */
  | { op: "keep" }
  /** LGPI a validé cette vente (« FIN Valider ») : la bannière propose l'e-mail du bilan, puis la termine d'elle-même. */
  | { op: "validated"; id: string }
  | { op: "quit" };

/** Les quatre places possibles : en haut (par défaut), en bas, ou debout contre le bord gauche ou droit de l'écran. */
export const ISLAND_SIDES = ["haut", "bas", "gauche", "droite"] as const;
export type IslandSide = (typeof ISLAND_SIDES)[number];
export const isIslandSide = (value: unknown): value is IslandSide => typeof value === "string" && (ISLAND_SIDES as readonly string[]).includes(value);

/** Ce que l'île affiche, déduit des commandes de l'agent et des gestes du pharmacien. */
export type PosteView = {
  island: IslandState;
  /** La vente affichée (la dernière reçue), ou rien au repos. */
  entry: HostEntry | null;
  /** La mise en garde de cette vente a été lue (« Compris ») : on passe aux conseils. */
  alertRead: boolean;
  /** L'adresse e-mail est partie vers l'agent ; on attend que le serveur l'ait enregistrée. */
  emailPending: boolean;
  /** Le message de fin de vente de l'agent (bilan envoyé ou non, rang du conseil). */
  done: HostDone | null;
  /** Le robot de ce comptoir (0 à 19) ; null : celui de la marque. */
  look: number | null;
  postLabel: string;
  /** Un nouveau scan pendant l'analyse : le compteur de temps de l'analyse repart. */
  scanAt: number;
  /** Le bonjour du robot, affiché au repos ; null : rien. Un scan ou une vente le remplace aussitôt. */
  greeting: string | null;
  /** La place de la bannière (en haut par défaut) : gardée d'une vente à l'autre. */
  side: IslandSide;
  /**
   * La vente à l'écran au moment du dernier bip : si ce bip était un de ses conseils (« keep »), la bannière y revient telle
   * quelle — le conseil y passe en « Vendu » — au lieu de rejouer « Scan détecté, analyse en cours ».
   */
  kept?: { entry: HostEntry; island: IslandState; alertRead: boolean } | null;
  /** La vente que LGPI vient de valider, et quand : la bannière ouvre l'e-mail du bilan avec son compte à rebours. */
  validated?: { id: string; at: number } | null;
};

export const INITIAL_POSTE: PosteView = { island: INITIAL_ISLAND, entry: null, alertRead: false, emailPending: false, done: null, look: null, postLabel: "", scanAt: 0, greeting: null, side: "haut" };

/** Le plus long bonjour accepté de l'agent (le message en fait moins de 200). */
export const GREETING_MAX_CHARS = 300;

export type PosteEvent =
  | { type: "host"; command: HostCommand; now: number }
  /** Le temps qui passe : le scan devient analyse, puis une ligne de plus se coche. */
  | { type: "tick" }
  /** L'analyse n'a reçu aucune réponse de l'agent dans le délai : l'île revient au repos. */
  | { type: "timeout" }
  /** La pause « N conseils disponibles » est écoulée : la carte s'agrandit. */
  | { type: "expand" }
  /** « Rien à ajouter », « Vente terminée » ou « E-mail envoyé » ont assez duré. */
  | { type: "settle" }
  | { type: "answer"; index: number; outcome: IslandOutcome }
  | { type: "openEmail" }
  | { type: "closeEmail" }
  | { type: "typeEmail"; value: string }
  | { type: "sendEmail" }
  | { type: "readAlert" }
  /** Le bonjour a assez duré, ou la personne l'a fermé d'un clic : l'île revient au repos. */
  | { type: "dismissGreeting" }
  /** La page vient de se recharger sur une nouvelle version : la vente qui était à l'écran revient telle quelle. */
  | { type: "restore"; view: PosteView };

const lookOf = (value: unknown): number | null => (typeof value === "number" && Number.isInteger(value) && value >= 0 && value < 20 ? value : null);

/** La réponse de chaque conseil, telle que le serveur l'a enregistrée. */
function outcomesOf(entry: HostEntry): IslandOutcome[] {
  return entry.items.map((item) => (item.outcome === "SOLD" ? "SOLD" : item.outcome === "NOT_SOLD" ? "NOT_SOLD" : null));
}

/** L'étape où la vente doit s'afficher une fois l'analyse finie : la mise en garde d'abord, puis les conseils. */
export function stageForEntry(entry: HostEntry, alertRead: boolean): IslandStage {
  if (entry.alerts.length > 0 && !alertRead) return "alert";
  // Une boîte en challenge, même sans conseil : la vente s'affiche (le challenge doit se voir dès le scan).
  if (entry.items.length > 0 || entry.questions.length > 0 || (entry.boxes ?? []).some((box) => box.challenge)) return "advice";
  return "quiet";
}

/** Les étapes « en attente d'un résultat » : la vente qui arrive termine l'analyse au lieu de sauter d'écran. */
const ANALYSING: IslandStage[] = ["scan", "analyzing"];
/** Les étapes où une vente est ouverte à l'écran : une mise à jour se fait sur place. */
const OPEN: IslandStage[] = ["ready", "advice", "email", "emailSent", "alert"];

export function posteReducer(view: PosteView, event: PosteEvent): PosteView {
  switch (event.type) {
    case "host":
      return onHost(view, event.command, event.now);
    case "timeout":
      return ANALYSING.includes(view.island.stage) && !view.entry ? { ...INITIAL_POSTE, look: view.look, postLabel: view.postLabel, side: view.side } : view;
    case "tick": {
      if (view.island.stage === "scan") return { ...view, island: { ...view.island, stage: "analyzing", stepsDone: 0 } };
      if (view.island.stage !== "analyzing") return view;
      const total = analysisSteps("", view.entry?.items.length ?? 0).length;
      // Sans résultat, la dernière ligne (« N conseils disponibles ») reste en cours : on ne coche que ce qui est vrai.
      const cap = view.entry ? total : total - 1;
      const stepsDone = Math.min(view.island.stepsDone + 1, cap);
      if (view.entry && stepsDone >= total) return { ...view, island: { ...view.island, stepsDone, stage: stageAfterAnalysis(view.entry, view.alertRead) } };
      return { ...view, island: { ...view.island, stepsDone } };
    }
    case "expand":
      if (view.island.stage !== "ready" || !view.entry) return view;
      return { ...view, island: { ...view.island, stage: stageForEntry(view.entry, view.alertRead) } };
    case "settle": {
      const stage = view.island.stage;
      if (stage === "emailSent" && view.entry) return { ...view, island: { ...view.island, stage: "advice" } };
      if (stage === "quiet" || stage === "done") return { ...INITIAL_POSTE, look: view.look, postLabel: view.postLabel, side: view.side };
      return view;
    }
    case "answer": {
      if (!view.entry) return view;
      const outcomes = [...view.island.outcomes];
      while (outcomes.length < view.entry.items.length) outcomes.push(null);
      if (event.index < 0 || event.index >= view.entry.items.length) return view;
      outcomes[event.index] = event.outcome;
      return { ...view, island: { ...view.island, outcomes } };
    }
    case "openEmail":
      return view.entry ? { ...view, island: { ...view.island, stage: "email" } } : view;
    case "closeEmail":
      return view.island.stage === "email" ? { ...view, emailPending: false, island: { ...view.island, stage: "advice" } } : view;
    case "typeEmail":
      return { ...view, island: { ...view.island, email: event.value.slice(0, 200) } };
    case "sendEmail":
      return view.island.stage === "email" && normalizeEmail(view.island.email) ? { ...view, emailPending: true } : view;
    case "readAlert":
      if (!view.entry) return { ...view, island: INITIAL_ISLAND };
      return { ...view, alertRead: true, island: { ...view.island, stage: stageForEntry(view.entry, true) } };
    case "dismissGreeting":
      return view.greeting === null ? view : { ...view, greeting: null };
    case "restore":
      // Une commande de l'agent arrivée entre-temps l'emporte : on ne reprend que sur une île encore au repos.
      return view.island.stage === "idle" && !view.entry ? event.view : view;
  }
}

/** Combien de temps une vente gardée avant un rechargement peut être reprise. */
export const RESUME_MAX_MS = 60_000;
/** Les étapes où la page peut se recharger sans gêner : jamais pendant un scan, une analyse ou la saisie d'un e-mail. */
const RELOADABLE: IslandStage[] = ["idle", "advice", "alert", "quiet", "done"];

/**
 * Une nouvelle version en ligne peut-elle recharger la page maintenant ? Oui au repos, et aussi pendant une vente restée
 * ouverte (POSTE de Docteur Nicolas, 19 oct. 2026 : une vente jamais terminée gardait l'ancienne bannière) — mais jamais
 * sous la souris, ni pendant un scan, une analyse ou un e-mail.
 */
export function canReloadNow(view: PosteView, pointerOver: boolean): boolean {
  return !pointerOver && !view.emailPending && !view.validated && RELOADABLE.includes(view.island.stage);
}

/** La vente à l'écran, gardée juste avant le rechargement. */
export function resumeSnapshot(view: PosteView, now: number): string {
  return JSON.stringify({ at: now, view });
}

/** La vente gardée avant le rechargement, si elle est récente et bien formée ; sinon rien. */
export function readResume(raw: string | null, now: number): PosteView | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { at?: unknown; view?: PosteView };
    if (typeof parsed.at !== "number" || parsed.at > now || now - parsed.at > RESUME_MAX_MS) return null;
    const view = parsed.view;
    if (!view || typeof view !== "object" || !view.island || typeof view.island.stage !== "string" || !isIslandSide(view.side)) return null;
    return view;
  } catch {
    return null;
  }
}

/** Après l'analyse : « N conseils disponibles » un instant quand il y a des conseils, sinon directement l'étape de la vente. */
function stageAfterAnalysis(entry: HostEntry, alertRead: boolean): IslandStage {
  const target = stageForEntry(entry, alertRead);
  return target === "advice" && entry.items.length > 0 ? "ready" : target;
}

function onHost(view: PosteView, command: HostCommand, now: number): PosteView {
  switch (command.op) {
    case "init":
      return { ...view, look: lookOf(command.look), postLabel: typeof command.postLabel === "string" ? command.postLabel.slice(0, 60) : view.postLabel };
    case "look":
      return { ...view, look: lookOf(command.look) };
    case "greet":
      // Jamais par-dessus une vente : seulement l'île au repos, sans vente à l'écran (sinon le bonjour est abandonné).
      if (view.island.stage !== "idle" || view.entry) return view;
      return { ...view, greeting: command.text };
    case "scan": {
      // Un bip : « Scan détecté », tout de suite. La vente à l'écran est gardée de côté : si le bip était un de ses conseils,
      // l'agent dit « keep » et elle revient ; sinon, la réponse du serveur prend sa place.
      const kept = view.entry && OPEN.includes(view.island.stage) ? { entry: view.entry, island: view.island, alertRead: view.alertRead } : (view.kept ?? null);
      return { ...INITIAL_POSTE, look: view.look, postLabel: view.postLabel, side: view.side, scanAt: now, island: { ...INITIAL_ISLAND, stage: "scan" }, kept };
    }
    case "validated":
      // Seulement la vente à l'écran : une validation qui arrive pour une autre vente (déjà remplacée) ne fait rien.
      if (view.entry?.id !== command.id && view.kept?.entry.id !== command.id) return view;
      return { ...view, validated: { id: command.id, at: now } };
    case "keep":
      if (!view.kept) return view;
      return { ...view, entry: view.kept.entry, island: { ...view.kept.island, stage: view.kept.island.stage === "ready" ? "advice" : view.kept.island.stage }, alertRead: view.kept.alertRead, kept: null };
    case "show": {
      const entry = { ...command.entry, items: itemsOf(command.entry) };
      const sameSale = view.entry?.id === entry.id;
      const alertRead = sameSale ? view.alertRead : false;
      const base: PosteView = { ...view, entry, alertRead, done: null, greeting: null, kept: null };
      const outcomes = outcomesOf(entry);
      // Le serveur a enregistré l'adresse : « E-mail envoyé », puis retour aux conseils.
      if (view.emailPending && entry.emailSaved) return { ...base, emailPending: false, island: { ...view.island, outcomes, stage: "emailSent" } };
      if (view.emailPending && entry.emailError) return { ...base, emailPending: false, island: { ...view.island, outcomes, stage: "email" } };
      if (ANALYSING.includes(view.island.stage)) {
        // Le résultat arrive pendant l'analyse : les lignes finissent de se cocher (voir « tick »), sans sauter d'écran.
        return { ...base, island: { ...view.island, stage: "analyzing", outcomes } };
      }
      if (sameSale && OPEN.includes(view.island.stage)) {
        // Même vente, déjà à l'écran : mise à jour sur place (réponses, stock, e-mail), l'étape ne bouge pas.
        const stage = view.island.stage === "alert" && entry.alerts.length === 0 ? stageForEntry(entry, true) : view.island.stage;
        return { ...base, island: { ...view.island, outcomes, stage } };
      }
      // Une vente qui arrive sans bip (reprise après redémarrage, mise à jour d'une autre vente) : directement à son étape.
      return { ...base, island: { ...INITIAL_ISLAND, outcomes, stepsDone: analysisSteps("", entry.items.length).length, stage: stageForEntry(entry, alertRead) } };
    }
    case "done":
      return { ...view, done: command.info, emailPending: false, greeting: null, island: { ...view.island, stage: "done" } };
    case "remove":
      if (view.entry && view.entry.id !== command.id) return view;
      return { ...INITIAL_POSTE, look: view.look, postLabel: view.postLabel, side: view.side };
    case "place":
      return { ...view, side: command.side };
    case "quit":
      return view;
  }
}

/** Combien de temps l'étape courante reste seule avant le pas suivant ; null : elle attend un geste ou l'agent. */
export function stageDelay(stage: IslandStage, hasResult = false): number | null {
  switch (stage) {
    case "scan":
      return 400;
    case "analyzing":
      // Le résultat est là : les dernières lignes se cochent vite, le conseil n'attend pas l'animation.
      return hasResult ? 200 : 550;
    case "ready":
      return BANNER.timing.readyPauseMs;
    case "emailSent":
      return 1600;
    case "quiet":
      return BANNER.timing.quietMs;
    case "done":
      return BANNER.timing.doneMs;
    default:
      return null;
  }
}

/** Une analyse sans réponse du serveur ne garde pas l'île en « analyse en cours » plus longtemps que la bannière. */
export const SCAN_TIMEOUT_MS = BANNER.timing.scanTimeoutMs;

// ---------------------------------------------------------------------------------------------------------------
// Les gestes, en mots : exactement ceux de la bannière GDI+ (agent/src/notice-center.ts, onWord).
// ---------------------------------------------------------------------------------------------------------------

const ID = /^[\w-]{1,80}$/;

/** « VENDU <vente> <conseil> », « NONVENDU … », ou « ANNULER … » pour reprendre la réponse. Null si l'identifiant est douteux. */
export function answerWord(saleId: string, item: Pick<HostItem, "id">, outcome: IslandOutcome): string | null {
  if (!ID.test(saleId) || !ID.test(item.id)) return null;
  const word = outcome === "SOLD" ? "VENDU" : outcome === "NOT_SOLD" ? "NONVENDU" : "ANNULER";
  return `${word} ${saleId} ${item.id}`;
}

export function normalizeEmail(value: string): string | null {
  const email = value.trim();
  return email.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : null;
}

/** « EMAIL <vente> <adresse en base64> » (l'adresse passe en base64 : la ligne se coupe aux espaces). */
export function emailWord(saleId: string, value: string): string | null {
  const email = normalizeEmail(value);
  if (!email || !ID.test(saleId)) return null;
  const bytes = new TextEncoder().encode(email);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `EMAIL ${saleId} ${btoa(binary)}`;
}

/** « RETIRER <vente> <boîte> » : le patient a reposé cette boîte, elle quitte la vente. */
export function removeBoxWord(saleId: string, lineId: string): string | null {
  return ID.test(saleId) && ID.test(lineId) ? `RETIRER ${saleId} ${lineId}` : null;
}

/** « SEPARER <vente> <boîte> » : cette boîte est celle du client suivant (agent 0.10.15 et suivants). */
export function splitBoxWord(saleId: string, lineId: string): string | null {
  return ID.test(saleId) && ID.test(lineId) ? `SEPARER ${saleId} ${lineId}` : null;
}

/** « SERVI <vente> <personne> » : « Qui a servi ce patient ? » — la vente passe aux résultats de ce collègue (agent 0.10.24). */
export function servedWord(saleId: string, userId: string): string | null {
  return ID.test(saleId) && ID.test(userId) ? `SERVI ${saleId} ${userId}` : null;
}

/**
 * Faut-il demander qui a servi ? Seulement à la fin d'une vente où au moins un conseil a été vendu (fondateur, 19 oct. 2026 :
 * « pas la peine de cliquer s'il n'y a pas eu de conseil vendu »), et seulement s'il y a un collègue à choisir.
 */
export function shouldAskServed(view: Pick<PosteView, "island" | "entry">): boolean {
  const entry = view.entry;
  if (view.island.stage !== "done" || !entry) return false;
  const soldOnScreen = entry.items.some((item, index) => item.outcome === "SOLD" || view.island.outcomes[index] === "SOLD");
  return soldOnScreen && (entry.team?.length ?? 0) >= 2;
}

export function finishWord(saleId: string): string | null {
  return ID.test(saleId) ? `TERMINER ${saleId}` : null;
}

/** « REPONSE <vente> <question>:<choix> » : la réponse cochée à une question de l'arbre du comptoir. */
export function questionWord(saleId: string, node: string, choice: string): string | null {
  return ID.test(saleId) && /^[\w-]+$/.test(node) && /^[\w-]+$/.test(choice) ? `REPONSE ${saleId} ${node}:${choice}` : null;
}

export function viewWord(saleId: string): string | null {
  return ID.test(saleId) ? `VOIR ${saleId}` : null;
}

/**
 * La page PharmaBoost d'un conseil de la vente, ouverte sur lui (agent/src/sale-link.ts) : « /vente/<vente>?conseil=<id>
 * #conseil-<id> ». Un lien RELATIF, donc toujours vers le serveur qui sert l'île — au poste, l'hôte Windows le vérifie
 * puis le confie au navigateur par défaut du PC. Pas de lien sans identifiant de conseil (serveur ancien) ni pour un
 * identifiant douteux.
 */
export function adviceLink(saleId: string, item: Pick<HostItem, "id">): string | undefined {
  return (item.id && saleAdvicePath(saleId, item.id)) || undefined;
}

/** Une ligne de commande reçue de l'agent, vérifiée : une commande inconnue ou malformée est ignorée, jamais une panne. */
export function parseCommand(raw: unknown): HostCommand | null {
  const value = typeof raw === "string" ? safeJson(raw) : raw;
  if (!value || typeof value !== "object") return null;
  const op = (value as { op?: unknown }).op;
  const command = value as Record<string, unknown>;
  switch (op) {
    case "init":
    case "scan":
    case "quit":
      return command as HostCommand;
    case "place":
      return isIslandSide(command.side) ? { op: "place", side: command.side } : null;
    case "keep":
      return { op: "keep" };
    case "validated":
      return typeof command.id === "string" && ID.test(command.id) ? { op: "validated", id: command.id } : null;
    case "look":
      return { op: "look", look: typeof command.look === "number" ? command.look : -1 };
    case "greet": {
      const text = typeof command.text === "string" ? command.text.replace(/\s+/g, " ").trim() : "";
      return text && text.length <= GREETING_MAX_CHARS ? { op: "greet", text } : null;
    }
    case "remove":
      return typeof command.id === "string" ? { op: "remove", id: command.id } : null;
    case "show":
      return isEntry(command.entry) ? { op: "show", entry: command.entry } : null;
    case "done":
      return isDone(command.info) ? { op: "done", info: command.info } : null;
    default:
      return null;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isEntry(value: unknown): value is HostEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<HostEntry>;
  return typeof entry.id === "string" && Array.isArray(entry.items) && Array.isArray(entry.alerts) && Array.isArray(entry.questions) && Array.isArray(entry.notes);
}

function isDone(value: unknown): value is HostDone {
  if (!value || typeof value !== "object") return false;
  const info = value as Partial<HostDone>;
  return typeof info.id === "string" && Array.isArray(info.lines);
}

/** « Rien de neuf » pour une vente ancienne sans conseils structurés : ses lignes de texte deviennent des cartes simples. */
export function itemsOf(entry: HostEntry): HostItem[] {
  if (entry.items.length > 0) return entry.items;
  return entry.notes.map((note) => ({ id: "", drug: "", challenge: "", shortDate: "", outcome: "NONE", name: note, price: "", reason: "", availability: "UNKNOWN", quantity: "", image: "" }));
}

// ---------------------------------------------------------------------------------------------------------------
// La forme de la fenêtre Windows : l'île n'occupe qu'une partie de la fenêtre ; le reste laisse passer les clics.
// ---------------------------------------------------------------------------------------------------------------

export type RegionRect = { x: number; y: number; w: number; h: number; r: number };

/**
 * Les rectangles arrondis que la fenêtre Windows garde visibles et cliquables (en pixels CSS de la page) : un par
 * élément marqué `data-ile-zone`, élargi de `pad` pour laisser voir le liseré lumineux. Arrondis au pixel, triés,
 * sans doublon : une forme identique n'est pas renvoyée à Windows deux fois.
 */
export function regionRects(boxes: { x: number; y: number; width: number; height: number; radius: number }[], pad = 3): RegionRect[] {
  return boxes
    .filter((box) => box.width > 0 && box.height > 0)
    .map((box) => {
      const x = Math.max(0, Math.floor(box.x - pad));
      const y = Math.max(0, Math.floor(box.y - pad));
      // Les bords droit et bas sont arrondis vers l'extérieur : la forme couvre toujours tout le panneau.
      const w = Math.ceil(box.x + box.width + pad) - x;
      const h = Math.ceil(box.y + box.height + pad) - y;
      return { x, y, w, h, r: Math.round(Math.min(box.radius + pad, h / 2)) };
    });
}

export function sameRegion(a: RegionRect[], b: RegionRect[]): boolean {
  return a.length === b.length && a.every((rect, i) => rect.x === b[i].x && rect.y === b[i].y && rect.w === b[i].w && rect.h === b[i].h && rect.r === b[i].r);
}
