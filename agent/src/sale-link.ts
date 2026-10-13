/**
 * Un conseil de la bannière se lit en entier d'un clic (demande du fondateur, 13 oct. 2026) : la carte ouvre, dans le
 * navigateur par défaut du PC, la page PharmaBoost de la vente, dépliée sur ce conseil (contre-indications, conseils
 * d'utilisation, ce que le pharmacien peut dire).
 *
 * L'adresse n'a qu'UNE forme, la même partout — la page de l'île l'écrit, l'hôte Windows (notice-host-ile.ts) et l'agent
 * la vérifient avant de l'ouvrir :
 *
 *   <serveur>/vente/<vente>?conseil=<conseil>#conseil-<conseil>
 *
 * Le paramètre fait déplier le conseil par le serveur ; l'ancre fait défiler la page jusqu'à lui. Les identifiants sont
 * des cuid : [A-Za-z0-9_-], 64 caractères au plus — rien qui puisse être lu comme une commande ni sortir du chemin.
 *
 * Aucune dépendance à Node : la page web l'importe pour écrire le lien, l'agent pour le vérifier.
 */

/** Un identifiant de vente ou de conseil, tel qu'il peut figurer dans l'adresse. */
export const LINK_ID = /^[A-Za-z0-9_-]{1,64}$/;
/** L'ancre d'un conseil sur la page de la vente : « conseil-<id> ». */
export const ADVICE_ANCHOR_PREFIX = "conseil-";

export const isLinkId = (value: unknown): value is string => typeof value === "string" && LINK_ID.test(value);

/** L'ancre (attribut `id`) de la carte d'un conseil sur la page de la vente. */
export const adviceAnchor = (adviceId: string) => `${ADVICE_ANCHOR_PREFIX}${adviceId}`;

/** Le chemin de la page de la vente, ouverte sur un conseil (ou sur la vente seule). Null : identifiant illisible, pas de lien. */
export function saleAdvicePath(saleId: string, adviceId?: string | null): string | null {
  if (!isLinkId(saleId)) return null;
  if (adviceId === undefined || adviceId === null || adviceId === "") return `/vente/${saleId}`;
  if (!isLinkId(adviceId)) return null;
  return `/vente/${saleId}?conseil=${adviceId}#${adviceAnchor(adviceId)}`;
}

/** « #conseil-<id> » → l'identifiant du conseil ; toute autre ancre → null. */
export function adviceIdFromHash(hash: string | null | undefined): string | null {
  const match = /^#conseil-([A-Za-z0-9_-]{1,64})$/.exec(hash ?? "");
  return match ? match[1] : null;
}

/** Même règle que `isTrustedServer` (self-update.ts) : https, ou le poste de développement. */
function trusted(server: URL): boolean {
  return server.protocol === "https:" || (server.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(server.hostname));
}

/**
 * L'adresse que l'agent accepte d'ouvrir dans le navigateur : une page de vente sur LE serveur de l'agent (même protocole,
 * même nom, même port), sans identifiant ni autre paramètre — rien d'autre. Elle est RÉÉCRITE à partir du serveur
 * configuré et des seuls identifiants reconnus : ce que la fenêtre a envoyé n'est jamais ouvert tel quel. Null : on
 * n'ouvre rien.
 */
export function saleAdviceUrl(serverUrl: string, candidate: unknown): string | null {
  if (typeof candidate !== "string" || candidate.length > 400) return null;
  let server: URL;
  let url: URL;
  try {
    server = new URL(serverUrl);
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (!trusted(server) || server.username || server.password || server.pathname !== "/" || server.search || server.hash) return null;
  if (url.protocol !== server.protocol || url.host !== server.host || url.username || url.password) return null;
  const path = /^\/vente\/([A-Za-z0-9_-]{1,64})$/.exec(url.pathname);
  if (!path) return null;
  const query = url.search === "" ? null : (/^\?conseil=([A-Za-z0-9_-]{1,64})$/.exec(url.search)?.[1] ?? undefined);
  const hash = url.hash === "" ? null : (adviceIdFromHash(url.hash) ?? undefined);
  // Un paramètre ou une ancre présents mais d'une autre forme, ou deux conseils différents : on n'ouvre rien.
  if (query === undefined || hash === undefined || (query && hash && query !== hash)) return null;
  const rebuilt = saleAdvicePath(path[1], query ?? hash);
  return rebuilt ? `${server.origin}${rebuilt}` : null;
}
