/**
 * Un lecteur minimal du HTML que produit `renderToStaticMarkup`, pour tester la
 * STRUCTURE d'un écran (qui contient quoi, dans quel ordre) sans nommer une
 * seule classe de style. Le HTML rendu est bien formé : balises ouvrantes et
 * fermantes appariées, éléments vides (`img`, `br`…) ou auto-fermés.
 */
export type HtmlNode = { tag: string; attrs: string; parent: HtmlNode | null; children: (HtmlNode | string)[] };

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

export function parseHtml(html: string): HtmlNode {
  const root: HtmlNode = { tag: "#root", attrs: "", parent: null, children: [] };
  let current = root;
  const token = /<!--[\s\S]*?-->|<\/([a-zA-Z0-9-]+)\s*>|<([a-zA-Z0-9-]+)((?:"[^"]*"|'[^']*'|[^'">])*)>|([^<]+)/g;
  for (const match of html.matchAll(token)) {
    const [whole, closing, opening, attrs, content] = match;
    if (whole.startsWith("<!--")) continue;
    if (content !== undefined) {
      current.children.push(content);
    } else if (closing) {
      let node: HtmlNode | null = current;
      while (node && node.tag !== closing) node = node.parent;
      if (node?.parent) current = node.parent;
    } else if (opening) {
      const node: HtmlNode = { tag: opening.toLowerCase(), attrs: attrs ?? "", parent: current, children: [] };
      current.children.push(node);
      if (!VOID.has(node.tag) && !(attrs ?? "").trimEnd().endsWith("/")) current = node;
    }
  }
  return root;
}

/** Le texte d'un nœud, tel que le lit le pharmacien (espaces repliés). */
export function textOf(node: HtmlNode | string): string {
  if (typeof node === "string") return node.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  return node.children.map(textOf).join(" ").replace(/\s+/g, " ").trim();
}

export function descendants(node: HtmlNode): HtmlNode[] {
  return node.children.flatMap((child) => (typeof child === "string" ? [] : [child, ...descendants(child)]));
}

export const hasAttr = (node: HtmlNode, name: string, value?: string) => (value === undefined ? new RegExp(`(^|\\s)${name}(=|\\s|$)`).test(node.attrs) : node.attrs.includes(`${name}="${value}"`));

/** Les éléments d'un arbre qui portent tel attribut (et telle valeur). */
export const findByAttr = (root: HtmlNode, name: string, value?: string) => descendants(root).filter((node) => hasAttr(node, name, value));

/** Vrai si `inner` est `outer` ou un de ses descendants. */
export function isInside(inner: HtmlNode, outer: HtmlNode): boolean {
  for (let node: HtmlNode | null = inner; node; node = node.parent) if (node === outer) return true;
  return false;
}

/** L'enfant direct de `ancestor` qui contient `node` (ou `node` lui-même s'il en est un enfant direct). */
export function childOf(ancestor: HtmlNode, node: HtmlNode): HtmlNode | null {
  let current: HtmlNode | null = node;
  while (current && current.parent !== ancestor) current = current.parent;
  return current;
}

const depth = (node: HtmlNode): number => (node.parent ? 1 + depth(node.parent) : 0);

/** Le plus profond des éléments dont le texte est EXACTEMENT celui-là (le plus proche du texte, pas un de ses conteneurs). */
export function elementWithText(root: HtmlNode, expected: string): HtmlNode {
  const found = descendants(root)
    .filter((node) => textOf(node) === expected)
    .sort((a, b) => depth(b) - depth(a))[0];
  if (!found) throw new Error(`Texte « ${expected} » introuvable`);
  return found;
}
