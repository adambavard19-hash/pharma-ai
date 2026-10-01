import { describe, expect, it } from "vitest";
import { buildSealedUrl, fromBase64Url, sealContent, toBase64Url, unsealContent } from "../seal";
import { buildReminderCalendar, planReminderSeries } from "../calendar";
import type { DocumentContent } from "../types";

const content: DocumentContent = {
  version: 1,
  generatedAt: "2026-10-01T10:00:00.000Z",
  pharmacy: { name: "Pharmacie du Centre", logoUrl: null, brandColor: "#0F766E", addressLine1: null, postalCode: null, city: null, phone: null, email: null },
  pharmacist: { fullName: "A. B.", roleLabel: "Pharmacien" },
  patient: null,
  prescription: { reference: "ORD-0001", prescriberName: null, prescribedAt: null },
  treatment: [
    { drugName: "AMOXICILLINE 1 g", dosage: null, form: "comprimé", unit: "comprimé", posology: "1 matin et soir", schedule: { morning: 1, noon: 0, evening: 1, bedtime: 0, mealTiming: null, times: [], everyDays: 1 } as never, durationDays: 6, instructions: null, purpose: null, tips: [], precautions: [], sourceLabel: "x", explanationUnavailable: true },
    { drugName: "DOLIPRANE 1000 mg", dosage: null, form: "comprimé", unit: "comprimé", posology: "si douleur", schedule: null, durationDays: null, instructions: null, purpose: null, tips: [], precautions: [], sourceLabel: "x", explanationUnavailable: true },
  ],
  advice: [],
  pharmacistNote: null,
  disclaimers: [],
  isDemo: false,
};

describe("le plan scellé", () => {
  it("se déchiffre avec la clé du lien, et avec rien d'autre", () => {
    const { key, payload } = sealContent(content);
    expect(unsealContent(payload, key)).toEqual(content);
    const other = sealContent(content);
    expect(() => unsealContent(payload, other.key)).toThrow();
    // Le contenu chiffré ne laisse rien lire en clair.
    expect(payload.ciphertext.toString("utf8")).not.toContain("AMOXICILLINE");
  });

  it("met la clé après le dièse, jamais dans le chemin ni la requête", () => {
    const url = buildSealedUrl("https://pharmaboost.app/", "abc", "cle-secrete", { imprimer: "1" });
    expect(url).toBe("https://pharmaboost.app/plan/abc?imprimer=1#cle-secrete");
    expect(new URL(url).search).not.toContain("cle-secrete");
  });

  it("encode en base64url sans signe réservé", () => {
    const bytes = new Uint8Array([251, 255, 191, 62, 63]);
    const text = toBase64Url(bytes);
    expect(text).not.toMatch(/[+/=]/);
    expect([...fromBase64Url(text)]).toEqual([...bytes]);
  });
});

describe("les rappels d'agenda", () => {
  it("fait un rappel par moment de prise, pour la durée du traitement", () => {
    const series = planReminderSeries(content);
    expect(series.map((s) => [s.moment, s.days, s.items])).toEqual([
      ["morning", 6, ["AMOXICILLINE 1 g — 1 comprimé"]],
      ["evening", 6, ["AMOXICILLINE 1 g — 1 comprimé"]],
    ]);
  });

  it("produit un fichier iCalendar valide, sans donnée hors du plan", () => {
    const ics = buildReminderCalendar(content, new Date(2026, 9, 1), new Date(Date.UTC(2026, 9, 1, 10)));
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("DTSTART:20261001T080000");
    expect(ics).toContain("RRULE:FREQ=DAILY;COUNT=6");
    expect(ics).toContain("SUMMARY:Matin — traitement");
    expect(ics).not.toContain("DOLIPRANE"); // sans horaire validé : pas de rappel inventé
    // Le suivi de fin de traitement, le dernier jour, à 18 h.
    expect(ics).toContain("DTSTART:20261006T180000");
    expect(ics).toContain("Fin du traitement");
    expect(ics.split("\r\n").every((line) => Buffer.byteLength(line, "utf8") <= 75)).toBe(true);
  });
});
