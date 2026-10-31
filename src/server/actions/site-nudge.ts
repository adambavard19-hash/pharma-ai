"use server";

import { headers } from "next/headers";
import { nudgeChoiceSchema, nudgeDetailsSchema } from "@/core/site/site-nudge";
import { countNudge, recordNudgeChoice, recordNudgeDetails } from "@/server/services/site-nudge";
import { isBot, visitorIp, visitorPlace } from "@/server/services/site-visitors";
import { fail, ok, type ActionResult } from "./types";

// Une même adresse ne remplit pas la console : dix gestes par heure au plus.
const recent = new Map<string, number[]>();
function throttled(key: string, max = 10): boolean {
  const now = Date.now();
  const stamps = (recent.get(key) ?? []).filter((at) => now - at < 60 * 60 * 1000);
  if (stamps.length >= max) return true;
  stamps.push(now);
  recent.set(key, stamps);
  return false;
}

async function visitor(): Promise<{ ip: string; headers: Headers; bot: boolean }> {
  const list = await headers();
  return { ip: visitorIp(list) ?? "inconnue", headers: list, bot: isBot(list.get("user-agent")) };
}

/** La bulle s'ouvre ou se ferme : un compteur, rien d'autre. */
export async function countNudgeAction(kind: "shown" | "closed"): Promise<void> {
  const v = await visitor();
  if (v.bot || (kind !== "shown" && kind !== "closed") || throttled(`${v.ip}:${kind}`, 5)) return;
  await countNudge(kind).catch(() => undefined);
}

/** « Vous êtes plutôt… ? » : le profil choisi d'un clic. */
export async function chooseNudgeProfileAction(payload: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = nudgeChoiceSchema.safeParse(payload);
  if (!parsed.success) return fail("Réponse illisible.");
  const v = await visitor();
  if (v.bot || throttled(`${v.ip}:choix`)) return fail("Merci, nous avons bien noté.");
  try {
    return ok({ id: await recordNudgeChoice(parsed.data, visitorPlace(v.headers)) });
  } catch (error) {
    console.error("[site] bulle : profil non enregistré", error);
    return fail("Réponse non enregistrée.");
  }
}

/** La suite, facultative : ce qui l'intéresse et ses coordonnées. */
export async function sendNudgeDetailsAction(payload: unknown): Promise<ActionResult<{ saved: boolean }>> {
  const parsed = nudgeDetailsSchema.safeParse(payload);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Vérifiez votre réponse.");
  if (parsed.data.website) return ok({ saved: false });
  const v = await visitor();
  if (v.bot || throttled(`${v.ip}:suite`, 5)) return fail("Merci, nous avons bien reçu votre message.");
  try {
    return ok({ saved: await recordNudgeDetails(parsed.data) });
  } catch (error) {
    console.error("[site] bulle : réponse non enregistrée", error);
    return fail("Votre réponse n'a pas pu être enregistrée.");
  }
}
