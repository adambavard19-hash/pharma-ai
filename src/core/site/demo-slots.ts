import { parisInputToDate, toParisInput } from "@/core/sales/board";

/**
 * Les créneaux de démonstration que le site propose : un appel de vingt minutes,
 * à l'heure de Paris, du lundi au vendredi, le matin de 9 h à 12 h et l'après-midi
 * de 14 h à 19 h, toutes les demi-heures. Au plus tôt deux heures après la demande,
 * sur les dix prochains jours ouvrés. Un créneau déjà réservé par une autre
 * officine n'est plus proposé ; le serveur revérifie au moment de réserver.
 */

export const DEMO_DURATION_MIN = 20;
export const DEMO_DAYS_AHEAD = 10;
export const DEMO_LEAD_TIME_MS = 2 * 3600 * 1000;
const TIMES = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30", "18:00", "18:30"];

export type DemoSlot = { at: string; time: string };
export type DemoDay = { date: string; label: string; slots: DemoSlot[] };

const DAY_LABEL = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long" });
const WEEKDAY = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", weekday: "short" });

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** « 10 h 30 » */
export function demoTimeLabel(time: string): string {
  const [hour, minute] = time.split(":");
  return `${Number(hour)} h${minute === "00" ? "" : ` ${minute}`}`;
}

/** « Mardi 14 octobre à 10 h 30 », à l'heure de Paris. */
export function formatDemoSlot(at: Date): string {
  return `${capitalize(DAY_LABEL.format(at))} à ${demoTimeLabel(toParisInput(at).slice(11))}`;
}

/** Les jours ouvrés à venir et leurs créneaux libres ; un jour sans créneau libre n'apparaît pas. */
export function demoSlots(now: Date, taken: Date[] = []): DemoDay[] {
  const busy = new Set(taken.map((date) => date.getTime()));
  const days: DemoDay[] = [];
  let workingDays = 0;
  // Un jour après l'autre, lu à l'heure de Paris (le changement d'heure ne fait sauter aucun jour).
  for (let offset = 0; workingDays < DEMO_DAYS_AHEAD && offset < 30; offset++) {
    const date = toParisInput(new Date(now.getTime() + offset * 24 * 3600 * 1000)).slice(0, 10);
    const middle = parisInputToDate(`${date}T12:00`);
    if (!middle || ["Sat", "Sun"].includes(WEEKDAY.format(middle))) continue;
    workingDays++;
    const slots = TIMES.flatMap((time) => {
      const at = parisInputToDate(`${date}T${time}`);
      if (!at || at.getTime() < now.getTime() + DEMO_LEAD_TIME_MS || busy.has(at.getTime())) return [];
      return [{ at: at.toISOString(), time: demoTimeLabel(time) }];
    });
    if (slots.length) days.push({ date, label: capitalize(DAY_LABEL.format(middle)), slots });
  }
  return days;
}

/** Ce créneau est-il proposable maintenant (bonne grille, assez tôt, pas trop loin, libre) ? */
export function isBookableDemoSlot(at: Date, now: Date, taken: Date[] = []): boolean {
  return demoSlots(now, taken).some((day) => day.slots.some((slot) => slot.at === at.toISOString()));
}

/** Lien « Ajouter à Google Agenda » pour l'appel de démonstration. */
export function googleCalendarLink(at: Date, details: string): string {
  const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const end = new Date(at.getTime() + DEMO_DURATION_MIN * 60 * 1000);
  const params = new URLSearchParams({ action: "TEMPLATE", text: "Démonstration PharmaBoost", dates: `${stamp(at)}/${stamp(end)}`, details });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
