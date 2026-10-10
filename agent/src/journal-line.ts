/**
 * Une ligne du journal de LGPI : `AAAA-MM-JJ HH:MM:SS NIVEAU [fil] classe - message`.
 * Partagé par la lecture de diagnostic (`lire-journal.ts`) et par le suivi en direct (`robot-lgpi.ts`).
 */

/** Les dossiers où LGPI tient son journal d'application. */
export const JOURNAL_DIRS = ["C:\\var\\log\\lgpi\\application", "D:\\var\\log\\lgpi\\application", "C:\\var\\log\\lgpi", "D:\\var\\log\\lgpi"];

/** Une ligne de journal commence par sa date : tout le reste est la suite d'une trace d'erreur, jamais lue. */
const ENTRY = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})[,.]\d{3}\s+(\w+)\s+\[([^\]]*)\]\s+(\S+)\s+-\s+(.*)$/;

export type Entry = { date: string; time: string; level: string; thread: string; logger: string; message: string };

export function parseEntry(line: string): Entry | null {
  const match = ENTRY.exec(line);
  return match ? { date: match[1], time: match[2], level: match[3], thread: match[4], logger: match[5], message: match[6] } : null;
}
