import { describe, expect, it } from "vitest";
import { buildCalendar, icsText } from "../demo-agenda";

describe("agenda PharmaBoost (format iCalendar)", () => {
  it("écrit un événement lisible par l'iPhone : heures UTC, rappel, lignes repliées, fins de ligne CRLF", () => {
    const ics = buildCalendar(
      "PharmaBoost · Démos",
      [{ uid: "demo-1@pharmaboost.app", start: new Date("2026-11-03T09:30:00Z"), end: new Date("2026-11-03T09:50:00Z"), title: "Démo · Pharmacie des Lilas (Lyon)", description: "Contact : Mme Martin\nTéléphone : 06 12 34 56 78, rappeler; merci", alarmMinutes: 15 }],
      new Date("2026-11-02T08:00:00Z"),
    );
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART:20261103T093000Z");
    expect(ics).toContain("DTEND:20261103T095000Z");
    expect(ics).toContain("TRIGGER:-PT15M");
    expect(ics).toContain("SUMMARY:Démo · Pharmacie des Lilas (Lyon)");
    expect(ics.split("\r\n").every((line) => Buffer.byteLength(line, "utf8") <= 75)).toBe(true);
    expect(ics.replace(/\r\n /g, "")).toContain("DESCRIPTION:Contact : Mme Martin\\nTéléphone : 06 12 34 56 78\\, rappeler\\; merci");
  });

  it("échappe les caractères réservés", () => {
    expect(icsText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
  });
});
