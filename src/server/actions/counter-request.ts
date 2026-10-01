"use server";

import { z } from "zod";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { adviseCounterRequest, type CounterRequestAnswer } from "@/server/services/counter-request";
import { fail, ok, type ActionResult } from "./types";

const schema = z.object({
  text: z.string().trim().min(5, "Décrivez la demande en quelques mots.").max(600, "600 caractères au plus."),
  ageYears: z.number().int().min(0).max(120).nullable(),
  isPregnant: z.boolean(),
  isBreastfeeding: z.boolean(),
  treatments: z.array(z.string().trim().min(1).max(80)).max(10),
});

/** Une demande sans ordonnance : ce que le client décrit → ce que l'officine peut proposer. */
export async function adviseCounterRequestAction(payload: z.input<typeof schema>): Promise<ActionResult<CounterRequestAnswer>> {
  const session = await requirePermission(PERMISSIONS.PRESCRIPTION_CREATE);
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Demande incomplète.");
  const answer = await adviseCounterRequest({ scope: session.scope, pharmacyIsDemo: session.pharmacy.isDemo, input: parsed.data });
  return ok(answer);
}
