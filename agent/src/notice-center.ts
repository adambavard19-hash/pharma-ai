/**
 * Le centre d'avis du poste de caisse : il transforme l'avis du serveur en commande pour la fenêtre (notice-host.ts),
 * garde cette fenêtre en vie, récupère les photos, et se replie sur l'ancienne fenêtre si la nouvelle ne démarre pas.
 *
 * Le principe : la fenêtre reste ouverte pendant toute la vente, mise à jour sur place à chaque bip, jusqu'à « Vente terminée ».
 * Ce que le pharmacien y fait (Vendu, Non vendu, e-mail du patient, Vente terminée) remonte ici sous forme d'actions ;
 * c'est l'agent qui les envoie au serveur. Seules les photos et ces actions passent par le réseau : sans elles la fenêtre
 * s'affiche pareil.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NOTICE_HOST_SCRIPT } from "./notice-host";
import type { ToastContent } from "./toast";

/** Ce que le serveur répond à /api/agent/conseil (les champs structurés manquent chez un serveur plus ancien). */
export type NoticeBody = {
  ok: boolean;
  state: "PENDING" | "READY" | "CLOSED";
  title: string;
  subject: string;
  alerts: string[];
  advice: string[];
  signature: string;
  detectedLabel?: string;
  items?: {
    id?: string | null;
    drug?: string | null;
    challenge?: string | null;
    shortDateOn?: string | null;
    outcome?: string;
    name: string;
    priceCents: number | null;
    reason: string | null;
    availability: string;
    quantity: number | null;
    imageUrl: string | null;
  }[];
  followUp?: { emailSaved: boolean; closed: boolean };
};

export type HostOutcome = "NONE" | "SOLD" | "NOT_SOLD";

export type HostItem = { id: string; drug: string; challenge: string; shortDate: string; outcome: HostOutcome; name: string; price: string; reason: string; availability: string; image: string };

/** Ce que la fenêtre reçoit pour une vente. */
export type HostEntry = {
  id: string;
  reference: string;
  label: string;
  subject: string;
  url: string;
  signature: string;
  /** Rien à conseiller : un mot de huit secondes, jamais compté « en attente ». */
  quiet: boolean;
  /** L'adresse du patient est enregistrée (avec son accord) : le champ e-mail se range. */
  emailSaved: boolean;
  /** Pourquoi l'adresse n'a pas été enregistrée, quand le serveur l'a refusée. */
  emailError: string;
  alerts: string[];
  notes: string[];
  items: HostItem[];
};

/** Le message de fin de vente. */
export type HostDone = { id: string; title: string; lines: string[]; badge: string; warning: boolean };

/** Ce que le pharmacien a fait dans la fenêtre : l'agent le transmet au serveur. */
export type HostAction =
  | { kind: "sold" | "not_sold" | "undo"; saleId: string; adviceId: string }
  | { kind: "email"; saleId: string; email: string }
  | { kind: "email_remove"; saleId: string }
  | { kind: "finish"; saleId: string }
  | { kind: "view"; saleId: string };

export const DEFAULT_NOTICE_SECONDS = 30;
export const POSITIONS = ["milieu-droite", "bas-droite", "haut-droite"] as const;
export type NoticePosition = (typeof POSITIONS)[number];

export function euros(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || cents <= 0) return "";
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`;
}

const AVAILABILITIES = new Set(["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK", "UNKNOWN"]);

/** « PharmaBoost · ORD-0100 » → « ORD-0100 ». */
function referenceOf(title: string): string {
  return title.replace(/^PharmaBoost\s*·\s*/, "").trim();
}

/** Une ligne, sans retour à la ligne : la commande est une ligne de JSON. */
const oneLine = (text: string) => text.replace(/[\r\n\u2028\u2029]+/g, " ").trim();

/** « 2026-11-30 » → « 30/11/2026 » ; tout ce qui n'est pas une date exacte est écarté (jamais une date inventée). */
export function frenchDate(iso: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

export function buildHostEntry(input: { prescriptionId: string; serverUrl: string; body: NoticeBody; images?: Map<string, string>; emailError?: string; problem?: string }): HostEntry {
  const { body } = input;
  const images = input.images ?? new Map<string, string>();
  const structured = body.items ?? [];
  const items: HostItem[] = structured.map((item) => ({
    id: item.id ?? "",
    drug: oneLine(item.drug ?? ""),
    challenge: oneLine(item.challenge ?? ""),
    shortDate: frenchDate(item.shortDateOn),
    outcome: item.outcome === "SOLD" || item.outcome === "NOT_SOLD" ? item.outcome : "NONE",
    name: oneLine(item.name),
    price: euros(item.priceCents),
    reason: oneLine(item.reason ?? ""),
    availability: AVAILABILITIES.has(item.availability) ? item.availability : "UNKNOWN",
    image: (item.imageUrl && images.get(item.imageUrl)) || "",
  }));
  // Un serveur plus ancien n'envoie que des lignes de texte : on les montre telles quelles, sans photo ni badge de stock.
  const legacyOnly = body.items === undefined && body.advice.length > 0;
  const alerts = [...body.alerts.map(oneLine), ...(input.problem ? [oneLine(input.problem)] : [])];
  const notes = items.length === 0 && !legacyOnly ? body.advice.map(oneLine) : [];
  const finalItems: HostItem[] = legacyOnly ? body.advice.map((text) => ({ id: "", drug: "", challenge: "", shortDate: "", outcome: "NONE" as const, name: oneLine(text), price: "", reason: "", availability: "UNKNOWN", image: "" })) : items;
  return {
    id: input.prescriptionId,
    reference: referenceOf(body.title),
    label: body.detectedLabel ?? "Détecté",
    subject: oneLine(body.subject),
    url: `${input.serverUrl.replace(/\/$/, "")}/vente/${input.prescriptionId}`,
    signature: body.signature,
    quiet: finalItems.length === 0 && alerts.length === 0,
    emailSaved: body.followUp?.emailSaved === true,
    emailError: oneLine(input.emailError ?? ""),
    alerts,
    notes,
    items: finalItems,
  };
}

/** « 1er », « 2e », « 18e » : le rang du conseil vendu aujourd'hui. */
export function ordinalFr(rank: number): string {
  return rank === 1 ? "1er" : `${rank}e`;
}

const plural = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`;

/**
 * Ce que dit la fenêtre à la fin de la vente — seulement ce qui s'est vraiment passé. Le rang « 18e conseil vendu aujourd'hui »
 * n'existe que si un conseil a été déclaré vendu dans CETTE vente ; le bilan n'est dit « envoyé » que si le serveur l'a confirmé.
 */
export function buildDoneInfo(input: {
  saleId: string;
  result: { proposed: number; sold: number; notSold: number; unanswered: number; soldToday: number | null; report: "SENT" | "SIMULATED" | "FAILED" | "NONE" };
  emailWasSaved: boolean;
}): HostDone {
  const { result } = input;
  const lines: string[] = [];
  if (result.proposed === 0) lines.push("Aucun conseil à enregistrer.");
  else {
    lines.push([plural(result.sold, "vendu", "vendus"), `${result.notSold} non vendu${result.notSold > 1 ? "s" : ""}`, `${result.unanswered} sans réponse`].join(" · "));
  }
  let warning = false;
  if (result.report === "SENT") lines.push("✓ Bilan envoyé au patient.");
  else if (result.report === "SIMULATED") lines.push("Bilan préparé (l'envoi d'e-mails est en mode test).");
  else if (result.report === "FAILED") {
    lines.push("⚠ Le bilan n'a pas pu être envoyé au patient.");
    warning = true;
  } else if (input.emailWasSaved) lines.push("Aucun bilan envoyé : aucun produit n'a été vendu.");
  return {
    id: input.saleId,
    title: "Vente terminée — résultats enregistrés",
    lines,
    badge: result.sold > 0 && result.soldToday && result.soldToday > 0 ? `${ordinalFr(result.soldToday)} conseil vendu aujourd'hui` : "",
    warning,
  };
}

/** L'ancienne fenêtre : le secours, avec les mêmes informations en texte. */
export function legacyContentOf(entry: HostEntry, seconds: number): ToastContent {
  const advice = entry.items.length > 0 ? entry.items.map((item) => [item.name, item.price, item.reason].filter(Boolean).join(" · ")) : entry.notes;
  return { title: `PharmaBoost · ${entry.reference}`, subject: entry.subject, alerts: entry.alerts, advice, url: entry.url, seconds };
}

export function encodeCommand(command: Record<string, unknown>): string {
  return `${JSON.stringify(command).replace(/[\u2028\u2029]/g, " ")}\n`;
}

// ----------------------------------------------------------------------------------------------------------------
// Les photos : jamais indispensables, jamais depuis n'importe où.
// ----------------------------------------------------------------------------------------------------------------

/** Les seuls sites d'où une photo se télécharge : les bases ouvertes qui alimentent le catalogue, et PharmaBoost. */
const IMAGE_HOSTS = new Set(["images.openbeautyfacts.org", "images.openfoodfacts.org", "images.openproductsfacts.org", "static.openfoodfacts.org"]);
const IMAGE_MAX_BYTES = 600_000;
const IMAGE_CACHE_MAX_FILES = 60;

/** L'adresse d'une photo si on peut la télécharger, sinon `null` : https seulement, sites connus seulement, jpeg ou png. */
export function imageSource(raw: string | null | undefined, serverUrl: string): string | null {
  if (!raw) return null;
  let url: URL;
  let own = "";
  try {
    own = new URL(serverUrl).hostname;
    url = new URL(raw, serverUrl.replace(/\/?$/, "/"));
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (!IMAGE_HOSTS.has(url.hostname) && url.hostname !== own) return null;
  // Windows Forms lit le jpeg et le png ; une image vectorielle ou webp s'afficherait en trou.
  if (/\.(svg|webp|avif|gif|ico)$/i.test(url.pathname)) return null;
  return url.toString();
}

function sniff(bytes: Uint8Array): "jpg" | "png" | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  return null;
}

const cacheKey = (source: string) => createHash("sha1").update(source).digest("hex").slice(0, 20);

/** La photo déjà téléchargée, s'il y en a une. */
export function cachedImage(dir: string, source: string): string | null {
  for (const extension of ["jpg", "png"]) {
    const path = join(dir, `${cacheKey(source)}.${extension}`);
    if (existsSync(path)) return path;
  }
  return null;
}

function pruneCache(dir: string): void {
  try {
    const files = readdirSync(dir).map((name) => ({ name, at: statSync(join(dir, name)).mtimeMs })).sort((a, b) => b.at - a.at);
    for (const old of files.slice(IMAGE_CACHE_MAX_FILES)) unlinkSync(join(dir, old.name));
  } catch {
    // Le cache est une commodité : jamais une erreur.
  }
}

/**
 * Télécharge une photo (une seule tentative, quatre secondes) : le type est vérifié sur les premiers octets, pas sur
 * ce que le site annonce, et la taille est bornée. Renvoie le chemin du fichier, ou `null`.
 */
export async function fetchImage(source: string, serverUrl: string, dir: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  const hit = cachedImage(dir, source);
  if (hit) return hit;
  try {
    const response = await fetchImpl(source, { signal: AbortSignal.timeout(4000), headers: { accept: "image/jpeg,image/png" } });
    if (!response.ok) return null;
    // Une redirection ne doit pas mener hors des sites autorisés.
    if (response.url && imageSource(response.url, serverUrl) === null) return null;
    const declared = Number(response.headers.get("content-length") ?? "0");
    if (declared > IMAGE_MAX_BYTES) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > IMAGE_MAX_BYTES) return null;
    const kind = sniff(bytes);
    if (!kind) return null;
    mkdirSync(dir, { recursive: true });
    const path = join(dir, `${cacheKey(source)}.${kind}`);
    writeFileSync(path, bytes);
    pruneCache(dir);
    return path;
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------------------------------------------------------
// Le processus de la fenêtre.
// ----------------------------------------------------------------------------------------------------------------

/** Ce dont le centre a besoin d'un processus : de quoi lui écrire, l'écouter, l'arrêter. Remplaçable dans les essais. */
export type HostProcess = {
  stdin: { write(chunk: string): unknown; on(event: "error", listener: () => void): unknown };
  stdout: { on(event: "data", listener: (chunk: Buffer | string) => void): unknown };
  stderr: { on(event: "data", listener: (chunk: Buffer | string) => void): unknown };
  on(event: "exit", listener: () => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  kill(): unknown;
};

export type NoticeCenterOptions = {
  configDir: string;
  log: (message: string) => void;
  /** L'ancienne fenêtre, pour le secours. */
  legacyShow: (content: ToastContent) => void;
  platform?: NodeJS.Platform;
  spawnHost?: (scriptPath: string) => HostProcess;
  /** Durée de l'ancienne fenêtre (secours) ; la nouvelle n'a pas de délai : elle reste jusqu'à « Vente terminée ». */
  seconds?: number;
  position?: NoticePosition;
  /** Combien de temps on attend que la fenêtre compile et dise « PRET ». */
  startTimeoutMs?: number;
  /** Ce que le pharmacien fait dans la fenêtre (Vendu, Non vendu, e-mail, Vente terminée) : l'agent le transmet au serveur. */
  onAction?: (action: HostAction) => void;
};

export class NoticeCenter {
  private host: HostProcess | null = null;
  private ready = false;
  private broken = false;
  private forcedLegacy = false;
  private startTimer: ReturnType<typeof setTimeout> | null = null;
  private lastEntry: HostEntry | null = null;
  private stderrText = "";
  /** Les ventes que la fenêtre garde ouvertes (jusqu'à « Vente terminée »), d'après ce qu'elle a répondu. */
  private readonly held = new Map<string, string>();

  constructor(private readonly options: NoticeCenterOptions) {}

  private get platform(): NodeJS.Platform { return this.options.platform ?? process.platform; }
  private get seconds(): number { return this.options.seconds ?? DEFAULT_NOTICE_SECONDS; }

  /** Les réglages du poste (durée, endroit), relus à chaque avis : le fichier de configuration peut changer. */
  configure(preferences: { seconds?: number; position?: NoticePosition; legacy?: boolean }): void {
    // L'interrupteur du poste : « ancienne fenêtre » reste possible en une ligne de configuration, sans attendre un correctif.
    if (preferences.legacy !== undefined) this.forcedLegacy = preferences.legacy;
    if (preferences.seconds !== undefined) this.options.seconds = Math.max(5, Math.min(120, Math.round(preferences.seconds)));
    if (preferences.position !== undefined && (POSITIONS as readonly string[]).includes(preferences.position)) this.options.position = preferences.position;
  }

  /**
   * Lance la fenêtre sans rien afficher. Sa préparation (PowerShell, compilation du code : quelques secondes) se fait
   * alors pendant que le serveur analyse la vente, et non après : le premier conseil de la journée n'attend plus.
   */
  warmUp(): void {
    if (this.platform !== "win32" || this.broken || this.forcedLegacy) return;
    this.ensureHost();
  }

  /** Les ventes que la fenêtre garde ouvertes. */
  ids(): string[] { return [...this.held.keys()]; }

  /** Montre (ou met à jour) le conseil d'une vente. */
  show(entry: HostEntry): void {
    this.lastEntry = entry;
    if (this.platform !== "win32") {
      this.options.log(`Avis (non affiché hors Windows) : ${entry.subject} — ${[...entry.alerts, ...entry.items.map((item) => item.name), ...entry.notes].join(" / ")}`);
      return;
    }
    if (this.broken || this.forcedLegacy) {
      this.options.legacyShow(legacyContentOf(entry, 15));
      return;
    }
    if (!this.ensureHost()) {
      this.options.legacyShow(legacyContentOf(entry, 15));
      return;
    }
    if (!entry.quiet) this.held.set(entry.id, entry.signature);
    this.send({ op: "show", entry, position: this.options.position ?? "milieu-droite", positionFile: join(this.options.configDir, "pharmaboost-avis-position.txt") });
  }

  /** « Vente terminée » est enregistrée : la fenêtre montre le message de fin, puis s'efface et attend la vente suivante. */
  done(info: HostDone): void {
    this.held.delete(info.id);
    if (this.platform !== "win32" || this.broken || this.forcedLegacy || !this.host) {
      this.options.log(`Vente terminée : ${info.title} — ${info.lines.join(" / ")}${info.badge ? ` — ${info.badge}` : ""}`);
      return;
    }
    this.send({ op: "done", info });
  }

  /** La fenêtre passe à une autre vente : l'ancienne n'est plus suivie ici (la fenêtre, elle, n'est pas touchée). */
  forget(id: string): void {
    this.held.delete(id);
  }

  /** La vente est close : son conseil n'a plus lieu d'être. */
  remove(id: string): void {
    if (!this.held.delete(id)) return;
    this.send({ op: "remove", id });
  }

  stop(): void {
    if (this.startTimer) clearTimeout(this.startTimer);
    if (this.host) {
      this.send({ op: "quit" });
      try { this.host.kill(); } catch { /* déjà parti */ }
    }
    this.host = null;
    this.ready = false;
  }

  private send(command: Record<string, unknown>): void {
    if (!this.host) return;
    try {
      this.host.stdin.write(encodeCommand(command));
    } catch (error) {
      this.options.log(`Avis : écriture impossible (${error instanceof Error ? error.message : String(error)}).`);
    }
  }

  /** Lance la fenêtre si elle ne tourne pas. Renvoie faux quand elle ne pourra pas tourner : on se replie. */
  private ensureHost(): boolean {
    if (this.host) return true;
    try {
      mkdirSync(this.options.configDir, { recursive: true });
      const scriptPath = join(this.options.configDir, "pharmaboost-avis-hote.ps1");
      // Le BOM : sans lui, Windows PowerShell lit le script en ANSI et les accents se cassent.
      writeFileSync(scriptPath, `﻿${NOTICE_HOST_SCRIPT}`, "utf8");
      const host = this.options.spawnHost ? this.options.spawnHost(scriptPath) : this.spawnReal(scriptPath);
      this.host = host;
      this.ready = false;
      this.stderrText = "";
      host.stdin.on("error", () => { /* la fenêtre est partie : l'événement « exit » s'en occupe */ });
      host.stdout.on("data", (chunk) => this.onOutput(String(chunk)));
      host.stderr.on("data", (chunk) => this.onError(String(chunk)));
      host.on("exit", () => this.onExit());
      host.on("error", (error: Error) => this.giveUp(`le processus n'a pas démarré (${error.message})`));
      this.startTimer = setTimeout(() => { if (!this.ready) this.giveUp("la fenêtre n'a pas démarré à temps"); }, this.options.startTimeoutMs ?? 60_000);
      this.startTimer.unref?.();
      return true;
    } catch (error) {
      this.giveUp(error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  private spawnReal(scriptPath: string): HostProcess {
    const child: ChildProcessWithoutNullStreams = spawn("powershell.exe", ["-STA", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", scriptPath], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    return child as unknown as HostProcess;
  }

  private onOutput(text: string): void {
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      if (line === "PRET") {
        this.ready = true;
        if (this.startTimer) clearTimeout(this.startTimer);
        this.options.log("Avis : fenêtre prête.");
      } else {
        this.onWord(line);
      }
    }
  }

  /** Un mot de la fenêtre : la réponse du pharmacien à un geste. Un mot inconnu est ignoré, jamais une panne. */
  private onWord(line: string): void {
    const [word, saleId = "", argument = ""] = line.split(" ");
    const act = (action: HostAction) => {
      try {
        this.options.onAction?.(action);
      } catch (error) {
        this.options.log(`Avis : action ${word} impossible (${error instanceof Error ? error.message : String(error)}).`);
      }
    };
    if (!saleId && word !== "ERREUR") return;
    if (word === "VENDU" && argument) act({ kind: "sold", saleId, adviceId: argument });
    else if (word === "NONVENDU" && argument) act({ kind: "not_sold", saleId, adviceId: argument });
    else if (word === "ANNULER" && argument) act({ kind: "undo", saleId, adviceId: argument });
    else if (word === "EMAIL" && argument) {
      const email = Buffer.from(argument, "base64").toString("utf8").trim();
      if (email && email.length <= 200 && !/[\r\n\s]/.test(email)) act({ kind: "email", saleId, email });
    } else if (word === "EMAIL_RETIRER") act({ kind: "email_remove", saleId });
    else if (word === "TERMINER") act({ kind: "finish", saleId });
    else if (word === "VOIR") act({ kind: "view", saleId });
    else if (word === "FERMEE") this.held.delete(saleId);
    else if (word === "ERREUR") this.options.log(`Avis : ${line}`);
  }

  private onError(text: string): void {
    this.stderrText = `${this.stderrText}${text}`.slice(0, 600);
    // Une erreur avant « PRET » est une erreur de compilation ou de démarrage : on se replie. Après, c'est un incident passager.
    if (!this.ready) this.giveUp(`erreur au démarrage : ${this.stderrText.replace(/\s+/g, " ").trim()}`);
    else this.options.log(`Avis (PowerShell) : ${text.trim().slice(0, 300)}`);
  }

  private onExit(): void {
    const wasReady = this.ready;
    this.host = null;
    this.ready = false;
    this.held.clear();
    if (!wasReady && !this.broken) this.giveUp("la fenêtre s'est arrêtée avant d'être prête");
    else if (wasReady) this.options.log("Avis : la fenêtre s'est arrêtée ; elle redémarrera au prochain conseil.");
  }

  /** La nouvelle fenêtre ne peut pas tourner sur ce poste : on garde l'ancienne, et on le dit. */
  private giveUp(reason: string): void {
    if (this.broken) return;
    this.broken = true;
    if (this.startTimer) clearTimeout(this.startTimer);
    this.options.log(`Avis : la nouvelle fenêtre ne démarre pas (${reason}) ; retour à l'ancienne fenêtre.`);
    const host = this.host;
    this.host = null;
    this.ready = false;
    if (host) { try { host.kill(); } catch { /* déjà parti */ } }
    if (this.lastEntry) this.options.legacyShow(legacyContentOf(this.lastEntry, 15));
  }
}
