import "server-only";

/**
 * Le texte d'un PDF, mise en page conservée.
 *
 * Les éditions des logiciels d'officine sont des tableaux : ce qui compte,
 * c'est la colonne où chaque mot se trouve. On relit donc chaque page mot par
 * mot avec sa position, on regroupe par ligne, et on replace chaque mot à la
 * colonne de caractères correspondant à sa position horizontale — ce que fait
 * `pdftotext -layout`, sans dépendre d'un binaire absent de l'hébergeur.
 */

type TextItem = { str: string; transform: number[]; width: number; hasEOL?: boolean };

export async function extractPdfLayoutText(bytes: Uint8Array, options: { maxPages?: number } = {}): Promise<{ text: string; pages: number }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Sans navigateur, pdf.js charge son « worker » comme un module : on lui
  // donne le chemin réel du fichier, quel que soit l'empaqueteur.
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    const { createRequire } = await import("node:module");
    pdfjs.GlobalWorkerOptions.workerSrc = createRequire(process.cwd() + "/package.json").resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
  }
  const document = await pdfjs.getDocument({ data: bytes, useSystemFonts: true, isEvalSupported: false, disableFontFace: true }).promise;
  const pages = Math.min(document.numPages, options.maxPages ?? 500);
  const out: string[] = [];

  for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const items = (content.items as TextItem[]).filter((item) => item.str.trim() !== "" && Array.isArray(item.transform));

    // Largeur moyenne d'un caractère : la colonne d'un mot est sa position
    // horizontale divisée par cette largeur.
    const totalChars = items.reduce((sum, item) => sum + item.str.length, 0);
    const totalWidth = items.reduce((sum, item) => sum + (item.width || 0), 0);
    const charWidth = totalChars > 0 && totalWidth > 0 ? totalWidth / totalChars : 5;
    const left = Math.min(...items.map((item) => item.transform[4]));

    // Regroupement par ligne : même ordonnée à une tolérance près.
    const rows = new Map<number, TextItem[]>();
    for (const item of items) {
      const y = Math.round(item.transform[5] / 2) * 2;
      const key = [...rows.keys()].find((k) => Math.abs(k - y) <= 2) ?? y;
      rows.set(key, [...(rows.get(key) ?? []), item]);
    }
    const ordered = [...rows.entries()].sort((a, b) => b[0] - a[0]);

    for (const [, rowItems] of ordered) {
      rowItems.sort((a, b) => a.transform[4] - b.transform[4]);
      const chars: string[] = [];
      for (const item of rowItems) {
        const column = Math.max(0, Math.round((item.transform[4] - left) / charWidth));
        // Au moins un espace entre deux mots, même si l'arrondi les colle.
        const start = Math.max(column, chars.length > 0 ? chars.length + 1 : 0);
        while (chars.length < start) chars.push(" ");
        for (const ch of item.str) chars.push(ch);
      }
      out.push(chars.join("").replace(/\s+$/, ""));
    }
    out.push("");
    page.cleanup();
  }
  await document.destroy();
  return { text: out.join("\n"), pages };
}
