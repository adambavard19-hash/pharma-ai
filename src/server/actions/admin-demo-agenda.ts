"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { addDemoBlock, removeDemoBlock, renewAgendaToken } from "@/server/services/demo-agenda";
import { parisInputToDate } from "@/core/sales/board";

/**
 * L'agenda des démos dans la console : bloquer une plage (elle s'affiche « Réservé » sur le site et n'est plus
 * réservable), la débloquer, renouveler le lien d'abonnement des téléphones.
 */

const PAGE = "/admin/agenda";
const TIME = /^\d{2}:\d{2}$/;

export async function blockDemoSlotsAction(form: FormData): Promise<void> {
  await requirePlatformSession();
  const day = String(form.get("day") ?? "");
  const from = String(form.get("from") ?? "") || "00:00";
  const to = String(form.get("to") ?? "") || "23:59";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !TIME.test(from) || !TIME.test(to)) return;
  const start = parisInputToDate(`${day}T${from}`);
  const end = parisInputToDate(`${day}T${to}`);
  if (!start || !end || end.getTime() <= start.getTime()) return;
  await addDemoBlock({ start, end, label: String(form.get("label") ?? "") });
  revalidatePath(PAGE);
  revalidatePath("/decouvrir/demo");
}

export async function unblockDemoSlotsAction(form: FormData): Promise<void> {
  await requirePlatformSession();
  const id = String(form.get("id") ?? "");
  if (!/^[a-f0-9]{1,32}$/.test(id)) return;
  await removeDemoBlock(id);
  revalidatePath(PAGE);
  revalidatePath("/decouvrir/demo");
}

export async function renewAgendaLinkAction(): Promise<void> {
  await requirePlatformSession();
  await renewAgendaToken();
  revalidatePath(PAGE);
}
