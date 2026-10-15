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

/** Compte une visite : une adresse déjà vue n'ajoute aucun visiteur (seulement une page vue de plus). */
export async function recordSiteVisit(ip: string, now = new Date()): Promise<void> {
  const ipHash = ipFingerprint(ip);
  await prisma.siteVisitor.upsert({
    where: { ipHash },
    create: { ipHash, firstSeenAt: now, lastSeenAt: now },
    update: { visits: { increment: 1 }, lastSeenAt: now },
  });
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
