import "server-only";
import { randomBytes } from "node:crypto";
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import { CARNET_LIMITS, CARNET_SETTING_KEY, carnetDraftSchema, readCarnet, type CarnetItem, type CarnetStatus } from "@/core/admin/carnet";

/**
 * Le carnet du fondateur, côté serveur (core/admin/carnet.ts) : chaque geste relit le carnet, l'applique et l'enregistre
 * d'un seul tenant — deux onglets ouverts ne s'écrasent pas l'un l'autre.
 */

export type CarnetAdmin = { id: string; fullName: string };
type Failure = { ok: false; error: string };

export async function loadCarnet(): Promise<CarnetItem[]> {
  const row = await prisma.platformSetting.findUnique({ where: { key: CARNET_SETTING_KEY }, select: { value: true } });
  return readCarnet(row?.value);
}

async function change(admin: CarnetAdmin, apply: (items: CarnetItem[]) => CarnetItem[] | Failure): Promise<{ ok: true; items: CarnetItem[] } | Failure> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.platformSetting.findUnique({ where: { key: CARNET_SETTING_KEY }, select: { value: true } });
    const next = apply(readCarnet(row?.value));
    if (!Array.isArray(next)) return next;
    if (next.length > CARNET_LIMITS.items) return { ok: false as const, error: "Le carnet est plein : supprimez des notes faites." };
    const value = { items: next } as unknown as Prisma.InputJsonValue;
    await tx.platformSetting.upsert({ where: { key: CARNET_SETTING_KEY }, update: { value, updatedBy: admin.id }, create: { key: CARNET_SETTING_KEY, value, updatedBy: admin.id } });
    return { ok: true as const, items: next };
  });
}

const newId = () => randomBytes(6).toString("hex");

export async function addCarnetItem(admin: CarnetAdmin, raw: unknown, now = new Date()) {
  const parsed = carnetDraftSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "Note invalide : un titre suffit." };
  const draft = parsed.data;
  const item: CarnetItem = {
    id: newId(),
    title: draft.title,
    kind: draft.kind,
    status: draft.status ?? "A_FAIRE",
    priority: draft.priority ?? "NORMALE",
    category: draft.category ?? "Autre",
    due: draft.due ?? null,
    time: draft.time ?? null,
    place: draft.place ?? "",
    notes: draft.notes ?? "",
    checklist: draft.checklist ?? [],
    createdAt: now.toISOString(),
    doneAt: draft.status === "FAIT" ? now.toISOString() : null,
    createdBy: admin.fullName,
  };
  const result = await change(admin, (items) => [item, ...items]);
  if (result.ok) await recordAudit({ action: "admin.carnet_changed", entityType: "PlatformSetting", entityId: CARNET_SETTING_KEY, platformAdminId: admin.id, metadata: { gesture: "add", id: item.id } });
  return result;
}

export async function updateCarnetItem(admin: CarnetAdmin, id: string, raw: unknown, now = new Date()) {
  const parsed = carnetDraftSchema.partial().safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "Modification invalide." };
  const patch = parsed.data;
  return change(admin, (items) => {
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return { ok: false, error: "Cette note n'existe plus : rechargez la page." };
    const before = items[index];
    const status: CarnetStatus = patch.status ?? before.status;
    const next = { ...before, ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)), status, doneAt: status === "FAIT" ? (before.doneAt ?? now.toISOString()) : null } as CarnetItem;
    return items.map((item, at) => (at === index ? next : item));
  });
}

export async function removeCarnetItem(admin: CarnetAdmin, id: string) {
  const result = await change(admin, (items) => (items.some((item) => item.id === id) ? items.filter((item) => item.id !== id) : { ok: false, error: "Cette note n'existe plus." }));
  if (result.ok) await recordAudit({ action: "admin.carnet_changed", entityType: "PlatformSetting", entityId: CARNET_SETTING_KEY, platformAdminId: admin.id, metadata: { gesture: "remove", id } });
  return result;
}

/** Le nombre de notes pour aujourd'hui et en retard : la pastille du carnet dans l'en-tête de la console. */
export async function carnetDueCount(today: string): Promise<number> {
  const items = await loadCarnet();
  return items.filter((item) => item.status !== "FAIT" && item.due !== null && item.due <= today).length;
}
