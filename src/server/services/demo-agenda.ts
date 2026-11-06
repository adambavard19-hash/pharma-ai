import { randomBytes } from "node:crypto";
import { prisma } from "@/server/db/client";
import { publicUrl } from "@/server/public-url";
import { buildCalendar, type AgendaEvent } from "@/core/site/demo-agenda";
import { DEMO_DURATION_MIN, formatDemoSlot, type DemoBlock } from "@/core/site/demo-slots";

/**
 * L'agenda PharmaBoost côté serveur : les plages que l'équipe bloque dans la console (plus proposées sur le site),
 * le lien secret du flux d'abonnement pour les téléphones, et le flux lui-même.
 */

const BLOCKS_KEY = "site.demo.blocked";
const TOKEN_KEY = "site.demo.agendaToken";
const MAX_BLOCKS = 300;

export type StoredDemoBlock = DemoBlock & { id: string; label: string };

async function readSetting<T>(key: string): Promise<T | null> {
  const row = await prisma.platformSetting.findUnique({ where: { key }, select: { value: true } });
  return (row?.value as T | undefined) ?? null;
}

async function writeSetting(key: string, value: object): Promise<void> {
  await prisma.platformSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
}

/** Les plages bloquées, les passées oubliées. */
export async function loadDemoBlocks(now = new Date()): Promise<StoredDemoBlock[]> {
  const stored = (await readSetting<{ blocks?: StoredDemoBlock[] }>(BLOCKS_KEY))?.blocks ?? [];
  return stored.filter((block) => new Date(block.end).getTime() > now.getTime()).sort((a, b) => a.start.localeCompare(b.start));
}

export async function addDemoBlock(input: { start: Date; end: Date; label: string }): Promise<void> {
  if (!(input.end.getTime() > input.start.getTime())) throw new Error("La fin doit venir après le début.");
  const blocks = await loadDemoBlocks();
  const block: StoredDemoBlock = { id: randomBytes(6).toString("hex"), start: input.start.toISOString(), end: input.end.toISOString(), label: input.label.trim().slice(0, 80) };
  await writeSetting(BLOCKS_KEY, { blocks: [...blocks, block].slice(-MAX_BLOCKS) });
}

export async function removeDemoBlock(id: string): Promise<void> {
  const blocks = await loadDemoBlocks();
  await writeSetting(BLOCKS_KEY, { blocks: blocks.filter((block) => block.id !== id) });
}

/** Le jeton secret du flux d'abonnement, créé la première fois qu'on l'affiche. */
export async function agendaToken(): Promise<string> {
  const existing = (await readSetting<{ token?: string }>(TOKEN_KEY))?.token;
  if (existing) return existing;
  const token = randomBytes(24).toString("hex");
  await writeSetting(TOKEN_KEY, { token });
  return token;
}

/** Un nouveau jeton : l'ancien lien cesse de marcher (s'il a circulé), chacun réabonne son téléphone. */
export async function renewAgendaToken(): Promise<string> {
  const token = randomBytes(24).toString("hex");
  await writeSetting(TOKEN_KEY, { token });
  return token;
}

export async function isAgendaToken(candidate: string): Promise<boolean> {
  const token = (await readSetting<{ token?: string }>(TOKEN_KEY))?.token;
  return Boolean(token) && candidate.length === token!.length && candidate === token;
}

/** Le lien d'abonnement : `webcal://` ouvre directement l'appli Calendrier sur l'iPhone. */
export function agendaFeedUrls(token: string): { https: string; webcal: string } {
  const https = publicUrl(`/api/agenda/${token}`);
  return { https, webcal: https.replace(/^https?:\/\//, "webcal://") };
}

type DemoProspect = { id: string; name: string; ownerName: string | null; email: string | null; phone: string | null; city: string | null; demoAt: Date | null; demoDoneAt: Date | null; /** Le lien de la réunion Zoom (5 nov. 2026). */ demoMeetingUrl?: string | null };

/** Une démonstration, telle qu'elle s'affiche dans l'agenda des téléphones de l'équipe. */
export function demoEvent(prospect: DemoProspect): AgendaEvent | null {
  if (!prospect.demoAt) return null;
  const lines = [
    `Démo PharmaBoost · ${formatDemoSlot(prospect.demoAt)}`,
    prospect.demoMeetingUrl ? `Réunion Zoom : ${prospect.demoMeetingUrl}` : null,
    prospect.ownerName ? `Contact : ${prospect.ownerName}` : null,
    prospect.phone ? `Téléphone : ${prospect.phone}` : null,
    prospect.email ? `E-mail : ${prospect.email}` : null,
    prospect.city ? `Ville : ${prospect.city}` : null,
    prospect.demoDoneAt ? "Démo faite ✓" : null,
  ].filter(Boolean);
  return {
    uid: `demo-${prospect.id}-${prospect.demoAt.getTime()}@pharmaboost.app`,
    start: prospect.demoAt,
    end: new Date(prospect.demoAt.getTime() + DEMO_DURATION_MIN * 60 * 1000),
    title: `Démo · ${prospect.name}${prospect.city ? ` (${prospect.city})` : ""}`,
    description: lines.join("\n"),
    url: publicUrl(`/admin/dossiers/${prospect.id}`),
    alarmMinutes: 15,
  };
}

const PROSPECT_FIELDS = { id: true, name: true, ownerName: true, email: true, phone: true, city: true, demoAt: true, demoDoneAt: true, demoMeetingUrl: true } as const;

/** Le flux d'abonnement : les démos des trente derniers jours et à venir, et les plages bloquées. */
export async function buildDemoFeed(now = new Date()): Promise<string> {
  const prospects = await prisma.prospect.findMany({ where: { demoAt: { gte: new Date(now.getTime() - 30 * 24 * 3600 * 1000) } }, select: PROSPECT_FIELDS, orderBy: { demoAt: "asc" }, take: 1000 });
  const blocks = await loadDemoBlocks(now);
  const events: AgendaEvent[] = [
    ...prospects.flatMap((prospect) => demoEvent(prospect) ?? []),
    ...blocks.map((block) => ({ uid: `bloque-${block.id}@pharmaboost.app`, start: new Date(block.start), end: new Date(block.end), title: `Indisponible (démos fermées)${block.label ? ` · ${block.label}` : ""}` })),
  ];
  return buildCalendar("PharmaBoost · Démos", events, now);
}

/** Les démos à venir, pour l'écran de la console. */
export async function upcomingDemos(now = new Date()) {
  return prisma.prospect.findMany({ where: { demoAt: { gte: new Date(now.getTime() - 3600 * 1000) } }, select: PROSPECT_FIELDS, orderBy: { demoAt: "asc" }, take: 200 });
}
