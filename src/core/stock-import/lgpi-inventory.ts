/**
 * L'édition d'inventaire de LGPI (Pharmagest), telle que le logiciel
 * l'exporte en PDF : une liste par taux de TVA, une ligne par produit, avec
 * le code produit (CIP13 ou EAN), la désignation, le dépôt, la quantité en
 * boîtes, une éventuelle quantité en unités, le prix de référence choisi à
 * l'édition (PAMP ou prix de vente), le total et le taux de TVA.
 *
 * Ce module lit le TEXTE de ce document, extrait avec la mise en page
 * conservée (colonnes alignées), et en fait des lignes d'import comme celles
 * d'un CSV. Il ne devine rien : une ligne qui ne se termine pas par les
 * quatre nombres attendus n'est pas un produit, et une désignation coupée
 * sur deux lignes est recollée seulement quand la seconde ligne ne porte ni
 * code ni nombres.
 *
 * Vu sur LGPI, édition « Inventaire », colonnes par défaut. Le prix est celui
 * du critère « Prix de référence » : « PAMP net » donne un prix d'achat, « Prix
 * de vente » un prix TTC. Le nom de la colonne est rendu tel quel pour que
 * l'appelant sache lequel il a reçu.
 */

export type LgpiInventoryLine = {
  code: string | null;
  name: string;
  quantity: number;
  /** Prix de la colonne « Prix », en centimes, selon le critère d'édition. */
  priceCents: number | null;
  vatRate: number | null;
};

export type LgpiInventory = {
  lines: LgpiInventoryLine[];
  /** « PAMP net », « Prix de vente »… lu dans l'en-tête « valorisé par … ». */
  priceBasis: string | null;
  editedAt: string | null;
  pages: number;
};

const NUMBER = String.raw`-?\d+(?:[.,]\d+)?`;
const TAIL = new RegExp(String.raw`\s(${NUMBER})(?:\s+(${NUMBER}))?\s+(${NUMBER})\s+(${NUMBER})\s+(\d+(?:[.,]\d+)?)%\s*$`);
/** Position par défaut de la colonne désignation, quand l'en-tête n'a pas été vu. */
const DEFAULT_NAME_START = 17;

function toNumber(value: string): number {
  return Number(value.replace(",", "."));
}

/** Vrai pour les lignes d'en-tête, de pied et de sous-total du document. */
function isFurniture(line: string): boolean {
  const s = line.trim();
  return (
    s.startsWith("Code Produit") ||
    s.startsWith("/ boite") ||
    s.includes("Inventaire du") ||
    /^Page\s/.test(s) ||
    s.includes("Qté en boite") ||
    s.startsWith("Tri par") ||
    s.startsWith("Rupture sur") ||
    /^\d+%$/.test(s) ||
    // Le bloc d'adresse de l'officine, répété à chaque page.
    /^(Tél|Ape|Siret)\b/.test(s)
  );
}

export function parseLgpiInventoryText(text: string): LgpiInventory {
  const lines = text.split("\n");
  const result: LgpiInventoryLine[] = [];
  let priceBasis: string | null = null;
  let editedAt: string | null = null;
  let pages = 0;
  let headerBlock = 0;
  // La colonne désignation se repère sur l'en-tête du tableau. Selon l'outil
  // qui a extrait le texte, sa position varie de quelques caractères : elle ne
  // sert qu'à reconnaître les suites de désignation coupées, avec tolérance.
  let nameStart = DEFAULT_NAME_START;

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) continue;

    if (/Code Produit/.test(line) && /Désignation/.test(line)) {
      nameStart = line.indexOf("Désignation");
      continue;
    }

    const banner = /Inventaire du (\S+ \S+) valorisé par (.+)$/.exec(line.trim());
    if (banner) {
      editedAt = editedAt ?? banner[1];
      priceBasis = priceBasis ?? banner[2].trim();
      continue;
    }
    const page = /Page\s+(\d+)\s*\/\s*(\d+)/.exec(line);
    if (page) {
      pages = Math.max(pages, Number(page[2]));
      // Les lignes suivantes sont l'adresse de l'officine : on les ignore
      // jusqu'au prochain en-tête de colonnes.
      headerBlock = 6;
      continue;
    }
    if (headerBlock > 0) {
      headerBlock -= 1;
      if (!/^\d{13}\s/.test(line)) continue;
    }
    if (isFurniture(line)) continue;

    const tail = TAIL.exec(line);
    // Le corps de la ligne, sans les nombres de fin : un code éventuel, puis
    // la désignation, puis la zone et le dépôt séparés par de larges espaces.
    const head = tail ? line.slice(0, tail.index) : line;
    const codeMatch = /^\s*(\d{13})(?=\s|$)/.exec(head);
    const code = codeMatch ? codeMatch[1] : null;
    const rest = codeMatch ? head.slice(codeMatch[0].length) : head;
    const leading = rest.length - rest.trimStart().length + (codeMatch ? codeMatch[0].length : 0);
    const segments = rest.trim().split(/\s{3,}/);
    const name = segments[0]?.trim() ?? "";

    if (tail && (code || (!codeMatch && name && Math.abs(leading - nameStart) <= 4))) {
      result.push({
        code,
        name,
        quantity: Math.trunc(toNumber(tail[1])),
        priceCents: Number.isFinite(toNumber(tail[3])) ? Math.round(toNumber(tail[3]) * 100) : null,
        vatRate: Number.isFinite(toNumber(tail[5])) ? toNumber(tail[5]) : null,
      });
      continue;
    }
    // Suite d'une désignation coupée : ni code, ni nombres de fin, et le texte
    // commence sous la colonne désignation (pas sous la zone géographique).
    if (!tail && !codeMatch && name && result.length > 0 && Math.abs(leading - nameStart) <= 4) {
      const last = result[result.length - 1];
      last.name = `${last.name} ${name}`.trim();
    }
  }

  return { lines: result, priceBasis, editedAt, pages };
}

/** Le document LGPI, rendu comme un tableau avec en-têtes — ce que l'import sait lire. */
export function lgpiInventoryToRecords(inventory: LgpiInventory): { headers: string[]; records: Record<string, unknown>[] } {
  const priceHeader = /vente/i.test(inventory.priceBasis ?? "") ? "PV TTC" : "PA HT";
  const headers = ["Code produit", "Désignation", "Qte Stock", priceHeader, "TVA"];
  return {
    headers,
    records: inventory.lines.map((line) => ({
      "Code produit": line.code,
      Désignation: line.name,
      "Qte Stock": line.quantity,
      [priceHeader]: line.priceCents !== null ? line.priceCents / 100 : null,
      TVA: line.vatRate,
    })),
  };
}
