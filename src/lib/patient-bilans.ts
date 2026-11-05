import type { BilanContent } from "@/core/documents/bilan";

/**
 * Les bilans gardés dans l'appli PharmaBoost : rangés sur LE téléphone du patient (stockage du navigateur), jamais envoyés à
 * PharmaBoost (fondateur, 5 nov. 2026 : aucune donnée de santé chez nous). Supprimer l'appli ou ses données les efface.
 */
export type SavedBilan = { id: string; savedAt: string; content: BilanContent };

const KEY = "pb-bilans";

export function readBilans(): SavedBilan[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as SavedBilan[]) : [];
    return Array.isArray(list) ? list.filter((item) => item && item.content && item.content.kind === "bilan") : [];
  } catch {
    return [];
  }
}

export function saveBilan(id: string, content: BilanContent): void {
  try {
    const list = readBilans().filter((item) => item.id !== id);
    window.localStorage.setItem(KEY, JSON.stringify([{ id, savedAt: new Date().toISOString(), content }, ...list].slice(0, 50)));
  } catch {
    // Stockage indisponible (navigation privée) : le bilan reste lisible par son lien.
  }
}

export function removeBilan(id: string): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(readBilans().filter((item) => item.id !== id)));
  } catch {
    // rien
  }
}

/** Les rappels de fin de cure, en fichier d'agenda (.ics) fabriqué sur le téléphone : rien n'est programmé chez PharmaBoost. */
export function curesCalendar(content: BilanContent): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const day = (iso: string) => iso.replace(/-/g, "");
  const next = (iso: string) => {
    const date = new Date(`${iso}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10).replace(/-/g, "");
  };
  const escape = (text: string) => text.replace(/[\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
  const events = content.cures.map((cure, index) =>
    [
      "BEGIN:VEVENT",
      `UID:cure-${day(cure.remindOn)}-${index}@pharmaboost.app`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${day(cure.remindOn)}`,
      `DTEND;VALUE=DATE:${next(cure.remindOn)}`,
      `SUMMARY:${escape(`Fin de cure bientôt : ${cure.name}`)}`,
      `DESCRIPTION:${escape(`Pensez à repasser à ${content.pharmacy.name} pour la suite de votre cure.`)}`,
      "BEGIN:VALARM",
      "TRIGGER:PT9H",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escape(`Fin de cure bientôt : ${cure.name}`)}`,
      "END:VALARM",
      "END:VEVENT",
    ].join("\r\n"),
  );
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PharmaBoost//Bilan//FR", "CALSCALE:GREGORIAN", ...events, "END:VCALENDAR"].join("\r\n");
}
