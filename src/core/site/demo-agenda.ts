/**
 * L'agenda PharmaBoost (fondateur, 2 nov. 2026 : « je veux les notifications sur mon téléphone, voir avec Donna
 * les rendez-vous en live, comme Doctolib ») : les démonstrations réservées sur le site, au format agenda (iCalendar).
 *
 * - Le flux d'abonnement : ajouté une fois dans l'appli Calendrier de l'iPhone (ou Google Agenda), il montre toutes
 *   les démos à venir et les plages bloquées, et se met à jour tout seul.
 * - L'invitation jointe aux e-mails de réservation : un clic l'ajoute à l'agenda, rappel compris.
 */

export type AgendaEvent = {
  uid: string;
  start: Date;
  end: Date;
  title: string;
  description?: string;
  url?: string | null;
  /** Un rappel sur le téléphone, tant de minutes avant. */
  alarmMinutes?: number;
};

const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Les caractères réservés du format, échappés. */
export function icsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Une ligne de plus de 75 octets est repliée (la norme le demande ; l'iPhone l'exige). */
function fold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  for (const char of line) {
    if (Buffer.byteLength(current + char, "utf8") > (parts.length === 0 ? 75 : 74)) {
      parts.push(current);
      current = "";
    }
    current += char;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

/** Un agenda complet : le flux d'abonnement (plusieurs événements) ou l'invitation d'un e-mail (un seul). */
export function buildCalendar(name: string, events: AgendaEvent[], now = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PharmaBoost//Agenda des demos//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsText(name)}`,
    "X-WR-TIMEZONE:Europe/Paris",
    // L'appli Calendrier relit le flux au plus tous les quarts d'heure quand elle le peut.
    "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
    "X-PUBLISHED-TTL:PT15M",
  ];
  for (const event of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.uid}`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${stamp(event.start)}`,
      `DTEND:${stamp(event.end)}`,
      `SUMMARY:${icsText(event.title)}`,
    );
    if (event.description) lines.push(`DESCRIPTION:${icsText(event.description)}`);
    if (event.url) lines.push(`URL:${event.url}`);
    if (event.alarmMinutes !== undefined) {
      lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsText(event.title)}`, `TRIGGER:-PT${event.alarmMinutes}M`, "END:VALARM");
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
