"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { receiveSiteLead } from "@/server/services/site-leads";
import { fail, ok, type ActionResult } from "./types";

const schema = z.object({
  kind: z.enum(["DEMO", "SUBSCRIBE"]),
  pharmacyName: z.string().trim().min(2, "Le nom de l'officine est requis.").max(120),
  contactName: z.string().trim().min(2, "Votre nom est requis.").max(120),
  email: z.string().trim().email("Adresse e-mail invalide.").max(160),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  city: z.string().trim().max(80).optional().or(z.literal("")),
  lgo: z.string().trim().max(60).optional().or(z.literal("")),
  postCount: z.number().int().min(1).max(50).nullable().optional(),
  message: z.string().trim().max(1000).optional().or(z.literal("")),
  preferredSlot: z.string().trim().max(120).optional().or(z.literal("")),
  referralCode: z.string().trim().max(20).optional().or(z.literal("")),
  /** Pot de miel : un humain ne le remplit pas. */
  website: z.string().max(0).optional().or(z.literal("")),
});

// Une même adresse ne peut pas inonder la boîte : trois demandes par heure.
const recent = new Map<string, number[]>();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 3;

function throttled(key: string): boolean {
  const now = Date.now();
  const stamps = (recent.get(key) ?? []).filter((at) => now - at < WINDOW_MS);
  if (stamps.length >= MAX_PER_WINDOW) return true;
  stamps.push(now);
  recent.set(key, stamps);
  return false;
}

/** Une demande de démonstration ou d'abonnement, depuis le site public. */
export async function submitSiteLeadAction(payload: z.input<typeof schema>): Promise<ActionResult<{ acknowledged: boolean }>> {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Vérifiez le formulaire.");
  const input = parsed.data;
  if (input.website) return ok({ acknowledged: false });
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "inconnue";
  if (throttled(`${ip}:${input.email.toLowerCase()}`)) return fail("Nous avons déjà reçu votre demande. Nous revenons vers vous très vite.");
  try {
    const result = await receiveSiteLead({
      kind: input.kind,
      pharmacyName: input.pharmacyName,
      contactName: input.contactName,
      email: input.email,
      phone: input.phone || null,
      city: input.city || null,
      lgo: input.lgo || null,
      postCount: input.postCount ?? null,
      message: input.message || null,
      preferredSlot: input.preferredSlot || null,
      referralCode: input.referralCode || null,
    });
    return ok({ acknowledged: result.acknowledged });
  } catch (error) {
    console.error("[site] demande impossible", error);
    return fail("Votre demande n'a pas pu être enregistrée. Écrivez-nous à contact@pharmaboost.app.");
  }
}
