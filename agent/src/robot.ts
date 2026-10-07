/**
 * Le robot de dispensation (BD Rowa, etc.) comme second déclencheur du comptoir.
 *
 * Dans une officine à robot, le pharmacien ne bipe pas toujours les boîtes : le
 * LGO demande au robot de les sortir, et c'est cette demande — la liste des
 * produits — qui est le vrai déclencheur. PharmaBoost n'en a pas d'autre
 * trace que la douchette.
 *
 * Ce qui est CONNU : en France, le LGO et le robot se parlent par le protocole
 * CDAPI (côté Rowa, l'interface WWKS2 — du XML sur TCP/IP). Leurs
 * spécifications ne sont pas publiques. Ce qui est INCONNU : comment, chez une
 * officine donnée, cet échange peut être lu sans rien toucher (journal du
 * logiciel du robot ? fichier d'échange ? trafic réseau ?). `diagnostic-robot.ps1`
 * sert à le découvrir ; ce module ne fait RIEN d'autre que ce qu'on a vu.
 *
 * Il ne sait faire qu'une chose, sans rien inventer du protocole : lire la fin
 * d'un fichier que le logiciel du robot tient à jour, et en extraire les codes
 * produit désignés par une expression régulière que le technicien écrit
 * d'après ce qu'il a observé. Lecture seule : jamais d'écriture, jamais de
 * relais entre le LGO et le robot (la chaîne de dispensation n'est pas touchée).
 *
 * Rien n'est envoyé tant qu'aucun robot n'est configuré, et jamais l'historique :
 * on part de la fin du fichier au démarrage.
 */
import { closeSync, existsSync, openSync, readSync, statSync } from "node:fs";
import { normalizeScannedCode } from "./scan-detect";

export type RobotConfig = {
  kind: "journal";
  /** Le fichier que le logiciel du robot (ou l'interface LGO ↔ robot) tient à jour. */
  path: string;
  /** Expression régulière dont le PREMIER GROUPE capture un code produit (CIP13, EAN, CIP7). Pas de valeur par défaut : un nombre de treize chiffres peut être autre chose qu'un produit. */
  pattern: string;
};

/** Une expression régulière prête à l'emploi, ou la raison pour laquelle elle ne l'est pas. */
export function compileRobotPattern(pattern: string): { ok: true; regex: RegExp } | { ok: false; error: string } {
  if (!pattern.trim()) return { ok: false, error: "Indiquez l'expression qui désigne le code produit." };
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, "g");
  } catch (error) {
    return { ok: false, error: `Expression illisible : ${error instanceof Error ? error.message : String(error)}` };
  }
  // Un groupe de capture est obligatoire : sans lui on enverrait toute la ligne, donc n'importe quoi.
  if (new RegExp(`${pattern}|`).exec("")?.length === 1) return { ok: false, error: "L'expression doit avoir un groupe de capture : (\\d{13}) par exemple." };
  return { ok: true, regex };
}

/**
 * Les codes produit d'une ligne : ce que l'expression capture, gardé seulement
 * si c'est la forme d'un code-barres de boîte (la même règle que la douchette :
 * 13 chiffres, 7 ou 8 chiffres, ou un Datamatrix GS1 — un numéro de sécurité
 * sociale de 15 chiffres ne passe pas). Un nombre de 7 ou 8 chiffres, lui, a la
 * forme d'un CIP7 : l'expression doit donc être précise, ancrée sur un mot du
 * journal (« article=(\\d+) »), jamais un simple « (\\d+) ».
 * Chaque code une fois par ligne, dans l'ordre.
 */
export function extractRobotCodes(line: string, regex: RegExp): string[] {
  const codes: string[] = [];
  regex.lastIndex = 0;
  for (let match = regex.exec(line); match; match = regex.exec(line)) {
    if (match[0] === "") regex.lastIndex += 1;
    const code = match[1] ? normalizeScannedCode(match[1]) : null;
    if (code && !codes.includes(code)) codes.push(code);
  }
  return codes;
}

/**
 * Le bout de fichier arrive par morceaux, rarement à la frontière d'une ligne :
 * une ligne n'est lue que complète, le reste attend le morceau suivant.
 */
export class LineBuffer {
  private rest = "";

  push(chunk: string): string[] {
    const parts = (this.rest + chunk).split(/\r?\n/);
    this.rest = parts.pop() ?? "";
    // Une « ligne » qui ne se termine jamais (journal d'un seul tenant) ne grossit pas sans fin.
    if (this.rest.length > 64 * 1024) this.rest = this.rest.slice(-4096);
    return parts;
  }
}

export type RobotHandlers = {
  onScan: (code: string, at: number) => void;
  onStatus: (message: string) => void;
};

const POLL_MS = 1000;
/** Plafond de lecture par passage : un journal qui explose d'un coup ne bloque pas l'agent. */
const MAX_READ_BYTES = 1024 * 1024;

/**
 * Surveille la fin du fichier. Un fichier qui rétrécit (rotation, remise à
 * zéro) est relu depuis le début ; un fichier absent est attendu sans bruit.
 * Rend la fonction d'arrêt.
 */
export function startRobotJournal(config: RobotConfig, handlers: RobotHandlers): () => void {
  const compiled = compileRobotPattern(config.pattern);
  if (!compiled.ok) {
    handlers.onStatus(`Robot : ${compiled.error}`);
    return () => undefined;
  }
  const regex = compiled.regex;
  const lines = new LineBuffer();
  let offset: number | null = null;
  let announcedMissing = false;

  const poll = () => {
    try {
      if (!existsSync(config.path)) {
        if (!announcedMissing) handlers.onStatus(`Robot : le fichier ${config.path} n'existe pas (encore).`);
        announcedMissing = true;
        offset = null;
        return;
      }
      announcedMissing = false;
      const size = statSync(config.path).size;
      if (offset === null) {
        // Premier passage : on part de la fin. L'historique du robot n'est jamais rejoué.
        offset = size;
        handlers.onStatus(`Robot : lecture de ${config.path} à partir de maintenant.`);
        return;
      }
      if (size < offset) offset = 0;
      if (size === offset) return;
      const length = Math.min(size - offset, MAX_READ_BYTES);
      const buffer = Buffer.alloc(length);
      const fd = openSync(config.path, "r");
      try {
        readSync(fd, buffer, 0, length, offset);
      } finally {
        closeSync(fd);
      }
      offset += length;
      const at = Date.now();
      // Les journaux Windows sont souvent en ANSI : latin1 garde chaque octet, et les codes sont des chiffres.
      for (const line of lines.push(buffer.toString("latin1"))) {
        for (const code of extractRobotCodes(line, regex)) handlers.onScan(code, at);
      }
    } catch (error) {
      handlers.onStatus(`Robot : ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const timer = setInterval(poll, POLL_MS);
  poll();
  return () => clearInterval(timer);
}

/**
 * Le même produit vu par la douchette ET par le robot ne doit compter qu'une
 * fois : le serveur n'a pas d'idempotence (« 2 × DOLIPRANE », stock baissé deux
 * fois). Un code que L'AUTRE source vient d'annoncer est écarté ; deux boîtes
 * identiques de la MÊME source, elles, sont bien deux boîtes.
 *
 * Hypothèse à confirmer en officine : la douchette et le robot annoncent la
 * même boîte à moins de 45 secondes l'une de l'autre.
 */
export class CrossSourceDedupe {
  private readonly last = new Map<string, { source: string; at: number }>();

  constructor(private readonly windowMs = 45_000) {}

  /** Vrai si ce code vient d'être annoncé par une autre source. Sinon l'enregistre et rend faux. */
  isDuplicate(code: string, source: string, at: number): boolean {
    const previous = this.last.get(code);
    if (previous && previous.source !== source && at - previous.at <= this.windowMs) return true;
    this.last.set(code, { source, at });
    if (this.last.size > 500) {
      for (const [key, value] of this.last) if (at - value.at > this.windowMs) this.last.delete(key);
    }
    return false;
  }
}

/** Ce que `--test-robot` affiche : les codes que le fichier ENTIER donnerait, sans rien envoyer. */
export function dryRunRobotFile(path: string, pattern: string, maxBytes = 5 * 1024 * 1024): { ok: true; lines: number; codes: string[] } | { ok: false; error: string } {
  const compiled = compileRobotPattern(pattern);
  if (!compiled.ok) return compiled;
  if (!existsSync(path)) return { ok: false, error: `Le fichier ${path} n'existe pas.` };
  const size = statSync(path).size;
  const length = Math.min(size, maxBytes);
  const buffer = Buffer.alloc(length);
  const fd = openSync(path, "r");
  try {
    // La fin du fichier : c'est elle qui s'écrit pendant l'essai.
    readSync(fd, buffer, 0, length, size - length);
  } finally {
    closeSync(fd);
  }
  const lines = buffer.toString("latin1").split(/\r?\n/);
  const codes: string[] = [];
  for (const line of lines) codes.push(...extractRobotCodes(line, compiled.regex));
  return { ok: true, lines: lines.length, codes };
}
