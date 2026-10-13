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

/**
 * La fin d'une ligne produit : des nombres (quantité, unités éventuelles, prix, total), puis le taux de TVA. Le total
 * s'écrit avec une espace des milliers à partir de 1 000 € (« 1 401,40 ») : lu en deux nombres, il décalait les
 * colonnes, et le prix devenait le « 1 » des milliers (Lactibiane Référence 30 gélules : 52 × 26,95 € = 1 401,40 €, lu
 * à 1,00 €, en production le 13 oct. 2026). Les nombres sont donc pris ensemble, puis départagés par le calcul
 * quantité × prix = total (`readTail`).
 */
const TAIL = /\s((?:-?\d+(?:[.,]\d+)?\s+){2,7})(\d+(?:[.,]\d+)?)%\s*$/;
/** Position par défaut de la colonne désignation, quand l'en-tête n'a pas été vu. */
const DEFAULT_NAME_START = 17;

function toNumber(value: string): number {
  return Number(value.replace(/[\s\u00a0\u202f]/g, "").replace(",", "."));
}

type Tail = { quantity: number; price: number | null };

/**
 * Les nombres de fin d'une ligne, sans le taux : quantité, unités éventuelles, prix, total — le total pouvant être coupé
 * en groupes de milliers (« 1 », « 401,40 »). Chaque lecture possible (total en 1, 2 ou 3 morceaux ; avec ou sans
 * colonne d'unités) est essayée, et la retenue est celle où quantité × prix tombe le plus près du total. Sans accord
 * (prix nul, ligne atypique), la lecture classique (le dernier nombre est le total) l'emporte : rien n'est deviné de plus.
 */
function readTail(tokens: string[]): Tail | null {
  type Reading = { quantity: number; price: number; gap: number };
  const readings: Reading[] = [];
  for (let parts = 1; parts <= 3 && parts < tokens.length; parts += 1) {
    const totalTokens = tokens.slice(tokens.length - parts);
    // Les morceaux qui suivent le premier sont des groupes de milliers : trois chiffres, des décimales au dernier seulement.
    if (totalTokens.slice(1).some((token, index, all) => !(index === all.length - 1 ? /^\d{3}(?:[.,]\d+)?$/ : /^\d{3}$/).test(token))) continue;
    if (parts > 1 && !/^-?\d{1,3}$/.test(totalTokens[0])) continue;
    const total = toNumber(totalTokens.join(""));
    const rest = tokens.slice(0, tokens.length - parts);
    if (rest.length < 2 || rest.length > 3 || !Number.isFinite(total)) continue;
    const quantity = toNumber(rest[0]);
    const price = toNumber(rest[rest.length - 1]);
    if (!Number.isFinite(quantity) || !Number.isFinite(price)) continue;
    readings.push({ quantity, price, gap: Math.abs(quantity * price - total) });
  }
  if (readings.length === 0) return null;
  const plain = readings[0];
  const agreeing = readings.filter((reading) => reading.price > 0 && reading.gap <= Math.max(0.05, Math.abs(reading.quantity * reading.price) * 0.01));
  const best = agreeing.sort((a, b) => a.gap - b.gap)[0] ?? plain;
  return { quantity: Math.trunc(best.quantity), price: best.price };
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

    const read = tail ? readTail(tail[1].trim().split(/\s+/)) : null;
    if (tail && read && (code || (!codeMatch && name && Math.abs(leading - nameStart) <= 4))) {
      result.push({
        code,
        name,
        quantity: read.quantity,
        priceCents: read.price !== null && Number.isFinite(read.price) ? Math.round(read.price * 100) : null,
        vatRate: Number.isFinite(toNumber(tail[2])) ? toNumber(tail[2]) : null,
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
  // « valorisé par PV TTC », « Prix de vente », « PVTTC » : la colonne est un
  // prix de vente ; « PAMP net », « PA HT » : un prix d'achat. Un prix d'achat
  // pris pour un prix de vente afficherait des cartes à moitié prix.
  const priceHeader = /vente|\bPV\b|PVTTC|TTC/i.test(inventory.priceBasis ?? "") ? "PV TTC" : "PA HT";
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
