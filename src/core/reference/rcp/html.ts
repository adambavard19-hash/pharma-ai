/**
 * Le RCP tel que la BDPM le publie, ramené à des lignes et des tableaux lisibles.
 *
 * La page d'une spécialité (`/medicament/<CIS>/extrait`, onglet « RCP ») est du HTML issu de Word : paragraphes
 * `AmmCorpsTexte`, titres `AmmAnnexeTitre2/3/4`, tableaux à cellules fusionnées (`rowspan`, `colspan`). Aucune
 * bibliothèque : un découpage par balises suffit et reste testable sur de vrais extraits (`__tests__/fixtures`).
 *
 * Deux sorties seulement :
 *   • `extractRcpSection48` — le HTML de la rubrique 4.8 « Effets indésirables », du titre 4.8 au titre suivant
 *     (4.9 « Surdosage »). Pas de titre 4.8, ou pas de fin : `null`, jamais une rubrique devinée ;
 *   • `rcpBlocks` — ce HTML en blocs : une ligne de texte, ou un tableau dont chaque rangée est déjà dépliée (une cellule
 *     fusionnée sur trois rangées est répétée sur les trois, une cellule sur deux colonnes occupe les deux). C'est ce qui
 *     permet de lire une fréquence placée en tête de colonne ou dans une cellule qui couvre plusieurs effets.
 */

export type RcpBlock = { kind: "line"; text: string } | { kind: "table"; rows: string[][] };

/** Au-delà, ce n'est plus une rubrique 4.8 mais une page mal découpée : on préfère ne rien lire. */
const MAX_SECTION_LENGTH = 600_000;

/**
 * Le début : l'ancre du titre (`<span id='4.8._Effets_indésirables'>`, `<a name="RcpEffetsIndesirables">`). La fin : le
 * titre de rubrique suivant (`class="AmmAnnexeTitre2"`, ancre `4.9.` ou `RcpSurdosage`), à défaut l'onglet « Notice ».
 */
export function extractRcpSection48(html: string): string | null {
  const start = html.search(/(?:id|name)\s*=\s*["']?(?:4\.8\.[^"'>]*|RcpEffetsIndesirables)["'\s>]/i);
  if (start < 0) return null;
  const from = start + 10;
  const ends = [
    html.slice(from).search(/class\s*=\s*["']?AmmAnnexeTitre[12]\b/i),
    html.slice(from).search(/(?:id|name)\s*=\s*["']?(?:4\.9\.|RcpSurdosage|5\.\s*PROPRI|RcpProprietes)/i),
    html.slice(from).search(/id\s*=\s*["']tab-notice["']/i),
  ].filter((at) => at >= 0);
  if (ends.length === 0) return null;
  // La fin tombe dans la balise du titre suivant (`<p class="AmmAnnexeTitre2">`) : on coupe avant son « < ».
  const cut = html.lastIndexOf("<", from + Math.min(...ends));
  const section = html.slice(start, cut > start ? cut : from + Math.min(...ends));
  return section.length > MAX_SECTION_LENGTH ? null : section;
}

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”",
  laquo: "«", raquo: "»", ge: "≥", le: "≤", eacute: "é", egrave: "è", ecirc: "ê", agrave: "à", acirc: "â",
  ccedil: "ç", ocirc: "ô", icirc: "î", iuml: "ï", ucirc: "û", ugrave: "ù", oelig: "œ", Eacute: "É", hellip: "…",
  ndash: "–", mdash: "—", middot: "·", deg: "°", micro: "µ", times: "×", shy: "",
};

/** Les entités HTML (`&#8209;` — le trait d'union insécable de Word —, `&eacute;`, `&lt;`), puis les espaces repliés. */
export function decodeHtmlText(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (whole, name: string) => NAMED_ENTITIES[name] ?? whole)
    .replace(/[‐‑‒]/g, "-")
    .replace(/[\s  ]+/g, " ")
    .trim();
}

/** Une vraie balise : `<` suivi d'une lettre ou de `/`. « < 1/10 » dans le texte n'en est pas une. */
const TAG = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const BREAKS = new Set(["p", "br", "li", "div", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol"]);

function spanOf(attributes: string, name: "rowspan" | "colspan"): number {
  const match = attributes.match(new RegExp(`${name}\\s*=\\s*["']?(\\d+)`, "i"));
  const value = match ? Number(match[1]) : 1;
  return Number.isFinite(value) && value >= 1 ? Math.min(value, 50) : 1;
}

type RawCell = { text: string; rowspan: number; colspan: number };

/** Les rangées d'un tableau, cellules fusionnées dépliées (l'algorithme de la grille HTML, sans plus). */
function unfold(rawRows: RawCell[][]): string[][] {
  const grid: string[][] = [];
  const pending: { text: string; left: number }[] = [];
  for (const raw of rawRows) {
    const row: string[] = [];
    let col = 0;
    const place = () => {
      while (pending[col] && pending[col].left > 0) {
        row[col] = pending[col].text;
        pending[col].left -= 1;
        col += 1;
      }
    };
    for (const cell of raw) {
      place();
      for (let span = 0; span < cell.colspan; span += 1) {
        row[col] = cell.text;
        if (cell.rowspan > 1) pending[col] = { text: cell.text, left: cell.rowspan - 1 };
        col += 1;
      }
    }
    place();
    while (col < pending.length) {
      if (pending[col] && pending[col].left > 0) {
        row[col] = pending[col].text;
        pending[col].left -= 1;
      }
      col += 1;
    }
    grid.push(Array.from(row, (cell) => cell ?? ""));
  }
  return grid;
}

/**
 * Les blocs de la rubrique. Un paragraphe hors tableau donne une ligne ; dans une cellule, ses paragraphes restent
 * séparés par un saut de ligne (une cellule « Fréquent : nausées » puis « Peu fréquent : … » se lit ligne à ligne).
 * Un tableau imbriqué est lu comme une suite de rangées du tableau qui le contient.
 */
export function rcpBlocks(sectionHtml: string): RcpBlock[] {
  const blocks: RcpBlock[] = [];
  let line = "";
  let depth = 0;
  let rows: RawCell[][] = [];
  let row: RawCell[] | null = null;
  let cell: { parts: string[]; rowspan: number; colspan: number } | null = null;

  const flushLine = () => {
    const text = decodeHtmlText(line);
    if (text) blocks.push({ kind: "line", text });
    line = "";
  };
  const closeCell = () => {
    if (!cell) return;
    const text = cell.parts.join("").split("\n").map(decodeHtmlText).filter(Boolean).join("\n");
    (row ??= []).push({ text, rowspan: cell.rowspan, colspan: cell.colspan });
    cell = null;
  };
  const closeRow = () => {
    closeCell();
    if (row && row.length > 0) rows.push(row);
    row = null;
  };
  const write = (text: string) => {
    if (cell) cell.parts.push(text);
    else if (depth === 0) line += text;
  };

  let last = 0;
  for (const match of sectionHtml.matchAll(TAG)) {
    write(sectionHtml.slice(last, match.index));
    last = match.index + match[0].length;
    if (!match[2]) continue;
    const closing = match[1] === "/";
    const name = match[2].toLowerCase();
    if (name === "table") {
      if (!closing) {
        if (depth === 0) {
          flushLine();
          rows = [];
        }
        depth += 1;
      } else if (depth > 0) {
        depth -= 1;
        if (depth === 0) {
          closeRow();
          const unfolded = unfold(rows);
          if (unfolded.length > 0) blocks.push({ kind: "table", rows: unfolded });
          rows = [];
        }
      }
    } else if (depth > 0 && name === "tr") {
      closeRow();
      if (!closing) row = [];
    } else if (depth > 0 && (name === "td" || name === "th")) {
      closeCell();
      if (!closing) cell = { parts: [], rowspan: spanOf(match[3] ?? "", "rowspan"), colspan: spanOf(match[3] ?? "", "colspan") };
    } else if (BREAKS.has(name)) {
      if (cell) cell.parts.push("\n");
      else if (depth === 0) flushLine();
    }
  }
  write(sectionHtml.slice(last));
  if (depth > 0) {
    closeRow();
    const unfolded = unfold(rows);
    if (unfolded.length > 0) blocks.push({ kind: "table", rows: unfolded });
  }
  flushLine();
  return blocks;
}
