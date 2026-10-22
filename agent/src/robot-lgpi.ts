/**
 * Le robot de l'officine vu par le journal de LGPI : le déclencheur « demande de sortie ».
 *
 * Ce qu'on a OBSERVÉ (rapport de lecture du journal de POSTE3, 9 octobre 2026, trois jours de journaux, puis une
 * vente de test d'une boîte de DOLIPRANE 1000 à 02:06) :
 *   - LGPI tient `lgpi.AAAA-MM-JJ.log` en clair, un fichier par jour (le nom change chaque matin), en ANSI ;
 *   - chaque demande faite au robot est un petit cycle de lignes de la classe `ControlerAutomate` :
 *       « Demande à la … »  →  « Code produit 3400935294227 … »  →  … →  « Fin de la demande à la … »
 *     suivi du message de réponse du robot (`StockOutputResponse(…)`, qui porte le code produit à 13 chiffres) ;
 *   - d'autres cycles, plus courts, s'arrêtent à « … on n'en … pas » sans jamais finir : le robot n'a pas la boîte,
 *     rien n'est sorti, et la même boîte peut y être redemandée cinq fois en vingt secondes ;
 *   - la vente de test d'UNE boîte a donné exactement UN cycle terminé, avec UN « Code produit ».
 * Annoncer chaque ligne « Code produit » ferait donc compter la même boîte cinq fois. On n'annonce que les produits
 * d'un cycle TERMINÉ : une demande que le robot a prise en charge.
 *
 * Ce qu'on ne sait PAS (et qu'on n'invente pas) : le sens exact des mots masqués dans le rapport, la quantité demandée
 * (le chiffre qui suit le code n'est pas lu : une boîte par code et par cycle), et si certaines demandes terminées n'ont
 * pas de ligne « Code produit ». Le journal du poste porte ce qu'on y voit : seules les demandes faites DEPUIS CE POSTE y sont.
 *
 * Lecture seule : jamais d'écriture, jamais de relais entre LGPI et le robot. Aucune valeur autre qu'un code produit
 * n'est retenue. On part de la fin du journal du jour au démarrage : l'historique n'est jamais rejoué.
 */
import { closeSync, existsSync, openSync, readSync, statSync } from "node:fs";
import { join } from "node:path";
import { JOURNAL_DIRS, parseEntry } from "./journal-line";
import { LineBuffer, type RobotHandlers } from "./robot";

export type LgpiRobotConfig = {
  kind: "lgpi";
  /** Le dossier du journal de LGPI. Absent : les emplacements habituels sont essayés. */
  dir?: string;
};

const CYCLE_START = /:\s*Demande\s+\S{1,3}\s+la\s/;
const CYCLE_END = /\bFin de la demande\b/;
const CYCLE_GIVEN_UP = /\bon n.en \S+ pas\b/;
const PRODUCT_CODE = /Code produit\s+(\d{7}|\d{13})\b/;
/** Dans la réponse du robot : `productCodes={CIP_13=3400935294227}`. Seuls les codes à 13 chiffres sont lus. */
const RESPONSE_CODE = /\b[A-Za-z]+_13\s*=\s*(\d{13})\b/g;
/** Le plafond de produits retenus pour un seul cycle : un cycle qui ne finit pas ne grossit pas sans fin. */
const MAX_CODES_PER_CYCLE = 50;
/** La réponse du robot suit la fin du cycle dans la même seconde ; au-delà, on annonce sans elle. */
const RESPONSE_WAIT_MS = 3000;

type Pending = { codes: string[]; since: number };

/**
 * Lit les lignes du journal une à une et rend les codes produit à annoncer. Sans disque ni horloge : testable seule.
 */
export class LgpiRobotReader {
  private cycle: string[] | null = null;
  private pending: Pending | null = null;
  /** Compteurs pour le rapport de lecture : combien de demandes ont abouti, combien ont été laissées de côté. */
  finished = 0;
  givenUp = 0;

  /** Une ligne de plus. `now` : l'heure de ce poste en millisecondes (pas celle du journal). Rend les codes à annoncer, dans l'ordre. */
  push(line: string, now: number): string[] {
    const entry = parseEntry(line);
    if (!entry) return [];
    const out: string[] = [];
    const isResponse = /(?:AutomateMessageEventGenerator|ClientAutomates)$/.test(entry.logger) && entry.message.includes("StockOutputResponse(");
    if (this.pending) {
      if (isResponse) {
        out.push(...this.settle(entry.message));
        return out;
      }
      // Autre chose que la réponse : plus la peine de l'attendre.
      out.push(...this.settle(null));
    }
    if (!/ControlerAutomate$/.test(entry.logger)) return out;
    const { message } = entry;
    if (CYCLE_END.test(message)) {
      const codes = this.cycle ?? [];
      this.cycle = null;
      if (codes.length > 0) {
        this.finished += 1;
        this.pending = { codes, since: now };
      }
    } else if (CYCLE_START.test(message)) {
      // Une demande qui n'a pas fini avant la suivante est laissée de côté.
      if (this.cycle && this.cycle.length > 0) this.givenUp += 1;
      this.cycle = [];
    } else if (CYCLE_GIVEN_UP.test(message)) {
      if (this.cycle && this.cycle.length > 0) this.givenUp += 1;
      this.cycle = null;
    } else if (this.cycle) {
      const code = PRODUCT_CODE.exec(message)?.[1];
      if (code && !this.cycle.includes(code) && this.cycle.length < MAX_CODES_PER_CYCLE) this.cycle.push(code);
    }
    return out;
  }

  /** À appeler régulièrement : la réponse du robot qui ne vient pas n'empêche pas d'annoncer. */
  flush(now: number): string[] {
    return this.pending && now - this.pending.since >= RESPONSE_WAIT_MS ? this.settle(null) : [];
  }

  /**
   * Annonce les produits du cycle terminé. Un code à 7 chiffres n'est pas toujours un CIP : LGPI en donne aux produits
   * qu'il a lui-même numérotés (le journal montre un lecteur de glycémie demandé sous « 5162291 » alors que la réponse
   * du robot porte son code-barres, 4015630063253). Quand le cycle n'a qu'un code à 7 chiffres et que la réponse en
   * donne un seul à 13, c'est ce dernier que PharmaBoost sait retrouver.
   */
  private settle(responseMessage: string | null): string[] {
    const pending = this.pending;
    this.pending = null;
    if (!pending) return [];
    const { codes } = pending;
    if (responseMessage && codes.length === 1 && codes[0].length === 7) {
      const found = [...new Set([...responseMessage.matchAll(RESPONSE_CODE)].map((match) => match[1]))];
      if (found.length === 1) return found;
    }
    return codes;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Le disque : suivre le journal du jour
// ---------------------------------------------------------------------------------------------------------------

const POLL_MS = 1000;
/** Plafond de lecture par passage : un journal qui explose d'un coup ne bloque pas l'agent. */
const MAX_READ_BYTES = 1024 * 1024;

function two(n: number): string {
  return String(n).padStart(2, "0");
}

/** Le nom du journal d'un jour, à l'heure de ce poste : `lgpi.2026-10-09.log`. */
export function journalName(date: Date): string {
  return `lgpi.${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}.log`;
}

/** Le dossier qui contient des journaux de LGPI : celui qu'on indique, sinon le premier des emplacements habituels. */
export function findJournalDir(dirs: readonly string[]): string | null {
  return dirs.find((dir) => existsSync(dir)) ?? null;
}

function readChunk(path: string, offset: number, size: number): Buffer {
  const length = Math.min(size - offset, MAX_READ_BYTES);
  const buffer = Buffer.alloc(length);
  const fd = openSync(path, "r");
  try {
    readSync(fd, buffer, 0, length, offset);
  } finally {
    closeSync(fd);
  }
  return buffer;
}

/**
 * Suit le journal du JOUR : à minuit LGPI écrit dans un autre fichier, que l'on rejoint dès qu'il paraît (en lisant
 * d'abord la fin de la veille). Au démarrage on part de la fin du fichier du jour ; un fichier qui paraît ensuite est lu
 * depuis son début, car rien n'y a été lu avant nous. Rend la fonction d'arrêt.
 */
/**
 * La validation d'une vente dans LGPI (« FIN Valider », au clavier ou à la souris), lue dans son journal : diagnostic « fin de
 * vente » de POSTE5, 16 oct. 2026. À chaque validation, et seulement là, LGPI écrit dans la seconde, avant la confirmation du
 * règlement, une ligne de `FacturationProcessusImpl` : « … des lignes de vente par type de facturation - ok ». Ni un scan, ni
 * l'ajout d'un produit, ni la reprise d'une vente en attente ne l'écrivent.
 */
export function isSaleValidatedLine(line: string): boolean {
  const entry = parseEntry(line);
  return entry !== null && /FacturationProcessusImpl$/.test(entry.logger) && /lignes de vente par type de facturation\s*-\s*ok\b/i.test(entry.message);
}

/**
 * Les LIGNES de la vente en cours dans LGPI, lues dans son journal (diagnostic « suppression de ligne » de POSTE5, 16 oct. 2026) :
 *  - chaque produit ajouté à la vente écrit, dans la seconde, une ligne de `DpRuptureService` : « … Produit : '<code>'. » —
 *    trois boîtes passées à la douchette, trois lignes, dans l'ordre ;
 *  - une ligne supprimée (touche Suppr) écrit une ligne de `NFJetApplication` : « {codeEvenement=ABANDON_LIGNE, descriptif=Ligne N …} »,
 *    N étant son rang dans la vente (les suivantes remontent d'un rang, comme à l'écran) ;
 *  - la vente abandonnée écrit « codeEvenement=ABANDON_VENTE ».
 * On garde donc la liste des codes, dans l'ordre, pour savoir QUELLE boîte la ligne N portait. Une ligne inconnue (vente commencée
 * avant que l'agent ne démarre, rang hors liste) ne désigne rien : on ne devine jamais.
 *
 * Diagnostic de POSTE5 du 22 oct. 2026 : LGPI n'écrit « Produit : '<code>' » que pour CERTAINS produits (deux passages de douchette,
 * une seule ligne au journal) — une parapharmacie (Hydratis, ADIARIL, Lactibiane) n'y était jamais, les rangs se décalaient et la
 * suppression ne désignait rien. Chaque passage de la douchette vu par l'agent (`scanned`) ajoute donc aussi sa ligne ; la ligne du
 * journal du même code, dans les secondes qui suivent (ou qui précèdent), est la même ligne et ne compte pas deux fois.
 */
export type LgpiLineEvent = { kind: "added"; code: string } | { kind: "removed"; line: number; code: string | null } | { kind: "abandoned" };

const LINE_ADDED = /Produit\s*:\s*'(\d{7,14})'/;
const LINE_REMOVED = /codeEvenement\s*=\s*ABANDON_LIGNE\b[^}]*?descriptif\s*=\s*Ligne\D{0,4}?(\d{1,3})\b/i;
const SALE_ABANDONED = /codeEvenement\s*=\s*ABANDON_VENTE\b/i;
/** Une vente n'a jamais plus de lignes que cela : la liste ne grossit pas sans fin si la fin de vente n'est pas lue. */
const MAX_SALE_LINES = 200;
/** Le passage de douchette et la ligne « Produit : » de LGPI pour la même boîte arrivent à quelques secondes l'un de l'autre. */
const SAME_LINE_MS = 8000;

type SaleLine = { code: string; at: number; from: "douchette" | "journal"; paired: boolean };

export class LgpiSaleLines {
  private lines: SaleLine[] = [];

  private add(code: string, at: number, from: SaleLine["from"]): boolean {
    // La même boîte vue par l'autre source juste avant : c'est la même ligne de LGPI.
    const twin = [...this.lines].reverse().find((line) => !line.paired && line.from !== from && line.code === code && Math.abs(at - line.at) <= SAME_LINE_MS);
    if (twin) {
      twin.paired = true;
      return false;
    }
    if (this.lines.length >= MAX_SALE_LINES) this.lines.shift();
    this.lines.push({ code, at, from, paired: false });
    return true;
  }

  /** Un passage de douchette vu par l'agent : LGPI ajoute une ligne à la vente. */
  scanned(code: string, at: number): void {
    const digits = code.replace(/\D/g, "");
    if (/^\d{7,14}$/.test(digits)) this.add(digits, at, "douchette");
  }

  push(line: string, at: number = Date.now()): LgpiLineEvent | null {
    // La suppression et l'abandon se lisent sur la ligne BRUTE, sans exiger la forme d'une entrée du journal ni le nom du
    // programme qui l'écrit : sur POSTE5, l'agent n'en a vu AUCUNE depuis le 8 oct. alors que le diagnostic les montre
    // (fondateur, 22 oct. 2026). « codeEvenement=… » n'apparaît que dans les messages du journal fiscal (NF525).
    if (SALE_ABANDONED.test(line)) {
      this.lines = [];
      return { kind: "abandoned" };
    }
    const removed = LINE_REMOVED.exec(line);
    if (removed) {
      const rank = Number(removed[1]);
      if (rank < 1) return null;
      const code = rank <= this.lines.length ? this.lines.splice(rank - 1, 1)[0].code : null;
      return { kind: "removed", line: rank, code };
    }
    const entry = parseEntry(line);
    if (!entry) return null;
    if (/DpRuptureService$/.test(entry.logger)) {
      const code = LINE_ADDED.exec(entry.message)?.[1];
      if (!code) return null;
      this.add(code, at, "journal");
      return { kind: "added", code };
    }
    return null;
  }

  /** La vente est validée (ou finie autrement) : la suivante repart d'une liste vide. */
  reset(): void {
    this.lines = [];
  }

  get size(): number {
    return this.lines.length;
  }
}

/** Deux lignes de validation à moins de cinq secondes sont la même validation. */
const VALIDATION_DEBOUNCE_MS = 5000;

export function startLgpiJournal(config: LgpiRobotConfig, handlers: RobotHandlers, clock: () => number = Date.now): () => void {
  const reader = new LgpiRobotReader();
  const saleLines = new LgpiSaleLines();
  handlers.onSaleLinesReady?.({ reset: () => saleLines.reset(), scanned: (code, at) => saleLines.scanned(code, at) });
  let lastValidation = -Infinity;
  let lines = new LineBuffer();
  let current: { path: string; offset: number } | null = null;
  let firstPass = true;
  let announcedMissing = false;

  const announce = (codes: string[], at: number) => {
    for (const code of codes) {
      handlers.onStatus(`Robot : demande de sortie du produit ${code}.`);
      handlers.onScan(code, at);
    }
  };

  const drain = (path: string, from: number): number => {
    let offset = from;
    for (;;) {
      const size = statSync(path).size;
      if (size < offset) offset = 0;
      if (size === offset) return offset;
      const buffer = readChunk(path, offset, size);
      offset += buffer.length;
      const at = clock();
      // Les journaux Windows sont en ANSI : latin1 garde chaque octet, et les codes sont des chiffres.
      for (const line of lines.push(buffer.toString("latin1"))) {
        announce(reader.push(line, at), at);
        const event = saleLines.push(line, at);
        // Toute ligne qui parle d'un abandon et que l'agent ne comprend pas laisse une trace (masquée : chiffres → 9).
        if (!event && /ABANDON_/i.test(line)) handlers.onStatus(`LGPI : ligne d'abandon non reconnue : ${line.replace(/\d/g, "9").slice(0, 240)}`);
        if (event?.kind === "removed") {
          handlers.onStatus(event.code ? `LGPI : ligne ${event.line} supprimée (produit ${event.code}).` : `LGPI : ligne ${event.line} supprimée (produit inconnu de l'agent : rien n'est retiré).`);
          handlers.onLineRemoved?.(event.code ?? "", at, { line: event.line, known: saleLines.size + (event.code ? 1 : 0) });
        } else if (event?.kind === "abandoned") {
          handlers.onStatus("LGPI : vente abandonnée sur ce poste.");
          handlers.onSaleAbandoned?.(at);
        }
        if (handlers.onSaleValidated && isSaleValidatedLine(line) && at - lastValidation > VALIDATION_DEBOUNCE_MS) {
          lastValidation = at;
          handlers.onStatus("LGPI : vente validée sur ce poste.");
          handlers.onSaleValidated(at);
        }
      }
    }
  };

  const poll = () => {
    try {
      const now = clock();
      const dir = config.dir ?? findJournalDir(JOURNAL_DIRS);
      if (!dir) {
        if (!announcedMissing) handlers.onStatus("Robot : le journal de LGPI n'existe pas sur ce poste (rien à suivre).");
        announcedMissing = true;
        return;
      }
      const today = join(dir, journalName(new Date(now)));
      if (!current) {
        if (!existsSync(today)) {
          if (!announcedMissing) handlers.onStatus(`Robot : le journal du jour de LGPI n'existe pas (encore) dans ${dir}.`);
          announcedMissing = true;
          firstPass = false;
          return;
        }
        announcedMissing = false;
        // Premier passage : on part de la fin. Un fichier qui paraît plus tard (LGPI ouvert après nous) est lu depuis son début.
        const offset = firstPass ? statSync(today).size : 0;
        current = { path: today, offset };
        firstPass = false;
        handlers.onStatus(`Robot : suivi du journal de LGPI ${journalName(new Date(now))}${offset === 0 ? "" : " à partir de maintenant"}.`);
        if (offset === 0) current.offset = drain(today, 0);
      } else if (current.path !== today && existsSync(today)) {
        // Minuit est passé : on finit la veille, puis on prend le fichier du jour depuis son début.
        if (existsSync(current.path)) drain(current.path, current.offset);
        // Le bout de ligne resté de la veille n'a rien à faire avec la première ligne du lendemain.
        lines = new LineBuffer();
        current = { path: today, offset: 0 };
        handlers.onStatus(`Robot : nouveau journal du jour ${journalName(new Date(now))}.`);
        current.offset = drain(today, 0);
      } else if (existsSync(current.path)) {
        current.offset = drain(current.path, current.offset);
      }
      announce(reader.flush(now), now);
    } catch (error) {
      handlers.onStatus(`Robot : ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const timer = setInterval(poll, POLL_MS);
  poll();
  return () => clearInterval(timer);
}
