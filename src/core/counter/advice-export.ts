/**
 * Tous les conseils proposés au comptoir d'une pharmacie, en tableau (fondateur, 22 oct. 2026 : « télécharger tous les conseils
 * proposés pour vérifier avec Donna si c'est bon ou pas »). Un fichier CSV que Excel ouvre tel quel : séparateur « ; », marque
 * UTF-8 en tête pour les accents, une colonne « Avis de Donna » vide à remplir.
 */
export type AdviceExportRow = {
  at: Date;
  saleReference: string;
  who: string;
  boxes: string[];
  forDrug: string | null;
  product: string;
  reason: string | null;
  status: "SOLD" | "NOT_SOLD" | "NONE";
  priceCents: number | null;
};

const STATUS: Record<AdviceExportRow["status"], string> = { SOLD: "Vendu", NOT_SOLD: "Non vendu", NONE: "Sans réponse" };

function cell(value: string): string {
  const clean = value.replace(/\r?\n/g, " ").trim();
  return /[";]/.test(clean) ? `"${clean.replace(/"/g, '""')}"` : clean;
}

export function adviceCsv(rows: AdviceExportRow[], timeZone: string): string {
  const day = new Intl.DateTimeFormat("fr-FR", { timeZone, day: "2-digit", month: "2-digit", year: "numeric" });
  const time = new Intl.DateTimeFormat("fr-FR", { timeZone, hour: "2-digit", minute: "2-digit" });
  const header = ["Date", "Heure", "Vente", "Collaborateur", "Boîtes scannées", "Pour le médicament", "Conseil proposé", "Pourquoi", "Résultat", "Prix TTC", "Avis de Donna"];
  const lines = rows.map((row) =>
    [
      day.format(row.at),
      time.format(row.at),
      row.saleReference,
      row.who,
      row.boxes.join(" + "),
      row.forDrug ?? "",
      row.product,
      row.reason ?? "",
      STATUS[row.status],
      row.priceCents !== null ? `${(row.priceCents / 100).toFixed(2).replace(".", ",")} €` : "",
      "",
    ].map(cell).join(";"),
  );
  return `﻿${[header.join(";"), ...lines].join("\r\n")}\r\n`;
}
