import { createHmac } from "node:crypto";
import { prisma } from "@/server/db/client";
import { getEnv } from "@/config/env";
import { startOfParisDay } from "@/server/services/counter-dashboard";

/** Les robots d'indexation, aperçus de liens et outils automatiques : ce ne sont pas des visiteurs. */
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|whatsapp|telegram|discord|curl|wget|python|headless|lighthouse|vercel|monitor|pingdom/i;

export function isBot(userAgent: string | null): boolean {
  return !userAgent || BOT.test(userAgent);
}

/** L'empreinte de l'adresse IP : la même adresse donne toujours la même empreinte, l'empreinte ne rend pas l'adresse. */
export function ipFingerprint(ip: string): string {
  return createHmac("sha256", getEnv().AUTH_SESSION_SECRET).update(`visiteur:${ip.trim()}`).digest("hex");
}

/** La première adresse de `x-forwarded-for` (celle du visiteur, posée par Vercel), sinon `x-real-ip`. */
export function visitorIp(headers: Headers): string | null {
  const ip = headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip")?.trim();
  return ip || null;
}

export type VisitorPlace = { city: string | null; region: string | null; country: string | null };

/** Un en-tête de Vercel, décodé (les villes y sont encodées : « Saint-%C3%89tienne ») et borné ; rien s'il est vide. */
function geoHeader(headers: Headers, name: string, max: number): string | null {
  const raw = headers.get(name)?.trim();
  if (!raw) return null;
  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch {
    // Laissé tel quel : un en-tête mal encodé ne fait pas perdre la visite.
  }
  value = value.replace(/[\u0000-\u001f]/g, "").trim().slice(0, max);
  return value || null;
}

/** La ville, la région et le pays que Vercel devine d'après l'adresse IP (approximatifs). */
export function visitorPlace(headers: Headers): VisitorPlace {
  return {
    city: geoHeader(headers, "x-vercel-ip-city", 80),
    region: geoHeader(headers, "x-vercel-ip-country-region", 10),
    country: geoHeader(headers, "x-vercel-ip-country", 2)?.toUpperCase() ?? null,
  };
}

/** Compte une visite : une adresse déjà vue n'ajoute aucun visiteur (seulement une page vue de plus). */
export async function recordSiteVisit(ip: string, place: VisitorPlace = { city: null, region: null, country: null }, now = new Date()): Promise<void> {
  const ipHash = ipFingerprint(ip);
  await prisma.siteVisitor.upsert({
    where: { ipHash },
    create: { ipHash, firstSeenAt: now, lastSeenAt: now, ...place },
    // La ville de la première visite est gardée ; elle n'est complétée que si elle manquait.
    update: { visits: { increment: 1 }, lastSeenAt: now },
  });
  if (place.city) await prisma.siteVisitor.updateMany({ where: { ipHash, city: null }, data: place });
}

export type SiteVisitorCounts = { total: number; today: number };

/** Le compteur de l'accueil : les visiteurs différents depuis le début, et ceux venus pour la première fois aujourd'hui. */
export async function countSiteVisitors(now = new Date()): Promise<SiteVisitorCounts> {
  const [total, today] = await Promise.all([
    prisma.siteVisitor.count(),
    prisma.siteVisitor.count({ where: { firstSeenAt: { gte: startOfParisDay(now) } } }),
  ]);
  return { total, today };
}

export type VisitorCity = { city: string; country: string | null; visitors: number };

/** Les villes d'où viennent les visiteurs, de la plus fréquente à la moins fréquente (« Ville inconnue » à part). */
export async function siteVisitorCities(limit = 50): Promise<{ cities: VisitorCity[]; unknown: number; total: number }> {
  const [groups, unknown, total] = await Promise.all([
    prisma.siteVisitor.groupBy({ by: ["city", "country"], where: { city: { not: null } }, _count: { _all: true }, orderBy: { _count: { id: "desc" } }, take: limit }),
    prisma.siteVisitor.count({ where: { city: null } }),
    prisma.siteVisitor.count(),
  ]);
  return { cities: groups.map((g) => ({ city: g.city as string, country: g.country, visitors: g._count._all })), unknown, total };
}
