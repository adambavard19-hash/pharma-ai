/**
 * La cloche du logiciel, mise en ordre : à quoi ressemble chaque notification (catégorie, icône, couleur), dans quelle
 * section de jour elle tombe (Aujourd'hui / Hier / Plus tôt), et le regroupement des alertes répétées : cinq « stock
 * faible » le même jour deviennent « 5 produits en stock faible », une ligne qui s'ouvre.
 *
 * Module pur : ni base, ni horloge (l'instant présent et le fuseau sont donnés), ni affichage.
 */

export type FeedType =
  | "LOW_STOCK"
  | "OUT_OF_STOCK"
  | "RECOMMENDATION_PENDING"
  | "ANALYSIS_FAILED"
  | "DOCUMENT_NOT_DELIVERED"
  | "IMPORT_COMPLETED"
  | "IMPORT_FAILED"
  | "FOLLOW_UP_RESPONSE"
  | "TEAM_EVENT"
  | "SYSTEM";

export type FeedSeverity = "INFO" | "SUCCESS" | "WARNING" | "CRITICAL";

export type FeedItem = {
  id: string;
  type: FeedType;
  severity: FeedSeverity;
  title: string;
  body: string;
  linkUrl: string | null;
  createdAt: Date;
  read: boolean;
};

/** Ce que la personne reconnaît, pas le nom technique du type. */
export type FeedCategory = "stock" | "rupture" | "conseil" | "analyse" | "document" | "import" | "suivi" | "equipe" | "support" | "abonnement" | "comptoir" | "info";

export type FeedTone = "brand" | "success" | "warning" | "danger" | "info" | "neutral";

export const CATEGORY_LOOK: Record<FeedCategory, { label: string; tone: FeedTone }> = {
  stock: { label: "Stock faible", tone: "warning" },
  rupture: { label: "Rupture", tone: "danger" },
  conseil: { label: "Conseils", tone: "brand" },
  analyse: { label: "Analyse", tone: "danger" },
  document: { label: "Document", tone: "warning" },
  import: { label: "Stock reçu", tone: "success" },
  suivi: { label: "Suivi", tone: "info" },
  equipe: { label: "Équipe", tone: "brand" },
  support: { label: "Support", tone: "info" },
  abonnement: { label: "Abonnement", tone: "neutral" },
  comptoir: { label: "Comptoir", tone: "success" },
  info: { label: "Information", tone: "neutral" },
};

export function categoryOf(item: Pick<FeedItem, "type" | "linkUrl" | "severity">): FeedCategory {
  switch (item.type) {
    case "LOW_STOCK":
      return "stock";
    case "OUT_OF_STOCK":
      return "rupture";
    case "RECOMMENDATION_PENDING":
      return "conseil";
    case "ANALYSIS_FAILED":
      return "analyse";
    case "DOCUMENT_NOT_DELIVERED":
      return "document";
    case "IMPORT_COMPLETED":
      // « Poste de caisse … relié » : un comptoir, pas un stock reçu.
      return /\/connexion\b/.test(item.linkUrl ?? "") ? "comptoir" : "import";
    case "IMPORT_FAILED":
      return "import";
    case "FOLLOW_UP_RESPONSE":
      return "suivi";
    case "TEAM_EVENT":
      return "equipe";
    case "SYSTEM": {
      const link = item.linkUrl ?? "";
      if (link.startsWith("/support")) return "support";
      if (link.startsWith("/parametres")) return "abonnement";
      return "info";
    }
  }
}

/** La couleur d'une ligne : celle de sa catégorie, sauf un échec (CRITICAL) toujours en rouge. */
export function toneOf(item: Pick<FeedItem, "type" | "linkUrl" | "severity">): FeedTone {
  if (item.severity === "CRITICAL") return "danger";
  if (item.type === "IMPORT_FAILED") return "danger";
  return CATEGORY_LOOK[categoryOf(item)].tone;
}

export type DayBucket = "today" | "yesterday" | "earlier";

export const BUCKET_LABELS: Record<DayBucket, string> = { today: "Aujourd'hui", yesterday: "Hier", earlier: "Plus tôt" };

/** « 2026-10-11 » dans le fuseau de l'officine. */
function dayKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function dayBucket(createdAt: Date, now: Date, timeZone = "Europe/Paris"): DayBucket {
  const day = dayKey(createdAt, timeZone);
  if (day === dayKey(now, timeZone)) return "today";
  // Vingt-quatre heures en arrière tombent toujours la veille, changement d'heure compris (à midi près).
  const yesterday = dayKey(new Date(now.getTime() - 24 * 3_600_000), timeZone);
  return day === yesterday ? "yesterday" : "earlier";
}

/** Les alertes qui se répètent produit par produit : regroupées quand il y en a plusieurs le même jour. */
/** Le nom court d'une ligne d'un groupe : le produit d'une alerte de stock, le numéro d'une vente. */
const productOf = (body: string) => body.split(/ : | — | est en rupture/)[0].trim();
const saleOf = (body: string) => /\b[A-Z]{2,5}-\d{2,}\b/.exec(body)?.[0] ?? null;

const GROUPABLE: Partial<Record<FeedType, { one: string; many: (count: number) => string; link: string; short: (body: string) => string | null }>> = {
  LOW_STOCK: { one: "produit en stock faible", many: (count) => `${count} produits en stock faible`, link: "/stock", short: productOf },
  OUT_OF_STOCK: { one: "produit en rupture", many: (count) => `${count} produits en rupture`, link: "/stock", short: productOf },
  RECOMMENDATION_PENDING: { one: "vente avec des conseils à valider", many: (count) => `${count} ventes avec des conseils à valider`, link: "/ventes", short: saleOf },
};

export type FeedEntry =
  | { kind: "single"; key: string; item: FeedItem }
  | { kind: "group"; key: string; type: FeedType; title: string; summary: string; linkUrl: string; unread: number; latest: Date; items: FeedItem[] };

export type FeedSection = { bucket: DayBucket; label: string; entries: FeedEntry[] };

/**
 * Les sections du fil, de la plus récente à la plus ancienne. Dans une section, une alerte regroupable qui revient au
 * moins deux fois devient un groupe, placé là où tombe sa plus récente. Une notification n'apparaît qu'une fois.
 */
export function buildFeed(items: FeedItem[], now: Date, timeZone = "Europe/Paris"): FeedSection[] {
  const sorted = [...items].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const sections: FeedSection[] = [];
  for (const bucket of ["today", "yesterday", "earlier"] as const) {
    const inBucket = sorted.filter((item) => dayBucket(item.createdAt, now, timeZone) === bucket);
    if (inBucket.length === 0) continue;
    const counts = new Map<FeedType, number>();
    for (const item of inBucket) if (GROUPABLE[item.type]) counts.set(item.type, (counts.get(item.type) ?? 0) + 1);
    const entries: FeedEntry[] = [];
    const placed = new Set<FeedType>();
    for (const item of inBucket) {
      const rule = GROUPABLE[item.type];
      if (rule && (counts.get(item.type) ?? 0) >= 2) {
        if (placed.has(item.type)) continue;
        placed.add(item.type);
        const members = inBucket.filter((other) => other.type === item.type);
        const names = members.map((member) => rule.short(member.body));
        // Compter ce qui est concerné (4 ventes, 12 produits), pas les alertes : une même vente peut en avoir laissé deux.
        const distinct = names.every(Boolean) ? new Set(names).size : members.length;
        entries.push({ kind: "group", key: `${bucket}:${item.type}`, type: item.type, title: distinct === 1 ? `1 ${rule.one}` : rule.many(distinct), summary: groupSummary(names), linkUrl: rule.link, unread: members.filter((member) => !member.read).length, latest: item.createdAt, items: members });
      } else entries.push({ kind: "single", key: item.id, item });
    }
    sections.push({ bucket, label: BUCKET_LABELS[bucket], entries });
  }
  return sections;
}

/** Le nombre affiché sur la cloche : « 9+ » au-delà de neuf, rien à zéro. */
export function badgeLabel(unread: number): string | null {
  if (unread <= 0) return null;
  return unread > 9 ? "9+" : String(unread);
}

/** Les identifiants d'une entrée (un groupe se marque lu d'un coup). */
export function entryIds(entry: FeedEntry): string[] {
  return entry.kind === "single" ? [entry.item.id] : entry.items.map((item) => item.id);
}

const two = (value: number) => String(value).padStart(2, "0");

/**
 * Quand, en clair, cohérent avec la section : « il y a 12 min », « il y a 3 h » aujourd'hui ; « hier à 08 h 36 » ;
 * « jeu. 9 oct. à 10 h 05 » plus tôt (avec l'année si elle n'est pas celle de maintenant).
 */
export function whenLabel(createdAt: Date, now: Date, timeZone = "Europe/Paris"): string {
  const bucket = dayBucket(createdAt, now, timeZone);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("fr-FR", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(createdAt).map((part) => [part.type, part.value]));
  const time = `${two(Number(parts.hour))} h ${two(Number(parts.minute))}`;
  if (bucket === "today") {
    const minutes = Math.max(0, Math.round((now.getTime() - createdAt.getTime()) / 60_000));
    if (minutes < 1) return "à l'instant";
    if (minutes < 60) return `il y a ${minutes} min`;
    return `il y a ${Math.floor(minutes / 60)} h`;
  }
  if (bucket === "yesterday") return `hier à ${time}`;
  const sameYear = new Intl.DateTimeFormat("fr-FR", { timeZone, year: "numeric" }).format(createdAt) === new Intl.DateTimeFormat("fr-FR", { timeZone, year: "numeric" }).format(now);
  const day = new Intl.DateTimeFormat("fr-FR", { timeZone, weekday: "short", day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) }).format(createdAt);
  return `${day} à ${time}`;
}

/** « Gel douche, Lait solaire, Calcium et 9 autres » : trois noms distincts au plus, sans doublon. */
export function groupSummary(names: (string | null)[], shown = 3): string {
  const distinct = [...new Set(names.filter((name): name is string => Boolean(name)))];
  if (distinct.length === 0) return "";
  const rest = distinct.length - shown;
  return distinct.slice(0, shown).join(", ") + (rest > 0 ? ` et ${rest} autre${rest > 1 ? "s" : ""}` : "");
}
