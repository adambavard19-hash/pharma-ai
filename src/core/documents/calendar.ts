/**
 * Les rappels de prise, dans l'agenda du patient.
 *
 * Un fichier iCalendar construit à partir du plan : un rappel par moment de
 * la journée (matin, midi, soir, coucher) pendant la durée du traitement, avec
 * les médicaments à prendre à ce moment-là. Il est produit dans le navigateur
 * du patient, à partir du plan déchiffré : rien ne transite ni ne se conserve
 * côté serveur. Les rappels vivent sur le téléphone du patient.
 */
import type { DocumentContent, DocumentTreatmentItem } from "./types";

export type CalendarMoment = "morning" | "noon" | "evening" | "bedtime";

/** Heures par défaut, celles qu'un patient ajuste ensuite dans son agenda. */
export const MOMENT_TIMES: Record<CalendarMoment, { hour: number; minute: number; label: string }> = {
  morning: { hour: 8, minute: 0, label: "Matin" },
  noon: { hour: 12, minute: 30, label: "Midi" },
  evening: { hour: 19, minute: 30, label: "Soir" },
  bedtime: { hour: 22, minute: 0, label: "Coucher" },
};

const MOMENTS: CalendarMoment[] = ["morning", "noon", "evening", "bedtime"];
/** Sans durée connue, on rappelle une semaine : le patient prolonge s'il le faut. */
const DEFAULT_DAYS = 7;
const MAX_DAYS = 90;

export type ReminderSeries = {
  moment: CalendarMoment;
  label: string;
  /** Les prises de ce moment : « DOLIPRANE 1000 mg — 1 comprimé ». */
  items: string[];
  days: number;
  /** Rythme en jours (1 = chaque jour, 2 = un jour sur deux). */
  everyDays: number;
};

function doseText(item: DocumentTreatmentItem, doses: number): string {
  const unit = item.unit ?? "prise";
  const plural = doses > 1 && !unit.endsWith("s") ? "s" : "";
  return `${item.drugName} — ${doses} ${unit}${plural}`;
}

/** Pure : ce que le fichier d'agenda va contenir, avant tout formatage. */
export function planReminderSeries(content: DocumentContent): ReminderSeries[] {
  const series: ReminderSeries[] = [];
  for (const moment of MOMENTS) {
    const concerned = content.treatment.filter((item) => item.schedule && item.schedule[moment] > 0);
    if (concerned.length === 0) continue;
    const days = Math.min(MAX_DAYS, Math.max(...concerned.map((item) => item.durationDays ?? 0)) || DEFAULT_DAYS);
    const everyDays = Math.max(1, ...concerned.map((item) => item.schedule?.everyDays ?? 1));
    series.push({ moment, label: MOMENT_TIMES[moment].label, items: concerned.map((item) => doseText(item, item.schedule![moment])), days, everyDays });
  }
  return series;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Date locale « flottante » : 20261001T080000, sans fuseau — l'agenda du téléphone applique le sien. */
function localStamp(date: Date, hour: number, minute: number): string {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(hour)}${pad(minute)}00`;
}

function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Replie les lignes à 75 octets comme l'exige le format iCalendar. */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest, "utf8") > 73) {
    let cut = 73;
    while (Buffer.byteLength(rest.slice(0, cut), "utf8") > 73) cut -= 1;
    out.push(rest.slice(0, cut));
    rest = " " + rest.slice(cut);
  }
  out.push(rest);
  return out.join("\r\n");
}

/**
 * Le fichier .ics complet. `start` est le premier jour de prise, `now` sert
 * d'horodatage ; les deux sont injectés pour que le résultat soit testable.
 */
export function buildReminderCalendar(content: DocumentContent, start: Date, now: Date = start): string {
  const series = planReminderSeries(content);
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  const pharmacy = content.pharmacy.name;
  const lines: string[] = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:-//${escapeText(pharmacy)}//Plan de prise//FR`, "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${escapeText(`Traitement — ${pharmacy}`)}`];
  const seed = `${start.getTime()}`;
  for (const s of series) {
    const time = MOMENT_TIMES[s.moment];
    const count = Math.max(1, Math.ceil(s.days / s.everyDays));
    const interval = s.everyDays > 1 ? `;INTERVAL=${s.everyDays}` : "";
    lines.push(
      "BEGIN:VEVENT",
      `UID:${seed}-${s.moment}@plan-de-prise`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${localStamp(start, time.hour, time.minute)}`,
      `DURATION:PT15M`,
      `RRULE:FREQ=DAILY${interval};COUNT=${count}`,
      `SUMMARY:${escapeText(`${s.label} — traitement`)}`,
      `DESCRIPTION:${escapeText([...s.items, "", `Plan remis par ${pharmacy}. Ce rappel ne remplace ni l'ordonnance ni l'avis du pharmacien.`].join("\n"))}`,
      "BEGIN:VALARM",
      "TRIGGER:PT0M",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeText(`${s.label} : ${s.items.join(" · ")}`)}`,
      "END:VALARM",
      "END:VEVENT",
    );
  }
  // Le suivi, sans rien conserver chez nous : au dernier jour du traitement,
  // un rappel invite à repasser voir le pharmacien si quelque chose ne va pas.
  const longest = Math.max(0, ...series.map((s) => s.days));
  if (longest > 0) {
    const end = new Date(start);
    end.setDate(end.getDate() + longest - 1);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${seed}-fin@plan-de-prise`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${localStamp(end, 18, 0)}`,
      "DURATION:PT15M",
      `SUMMARY:${escapeText("Fin du traitement — votre pharmacien prend de vos nouvelles")}`,
      `DESCRIPTION:${escapeText([`Votre traitement se termine aujourd'hui.`, "Si les symptômes persistent, ou si quelque chose vous a gêné, passez voir votre pharmacien ou appelez-le.", "", `${pharmacy}${content.pharmacy.phone ? ` — ${content.pharmacy.phone}` : ""}`].join("\n"))}`,
      "BEGIN:VALARM",
      "TRIGGER:PT0M",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeText("Fin du traitement : comment allez-vous ?")}`,
      "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
