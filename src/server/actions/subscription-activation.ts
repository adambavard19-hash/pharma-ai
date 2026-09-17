"use server";

import { redirect } from "next/navigation";
import { startCheckoutForInvite } from "@/server/billing/subscriptions";
import { fail, type ActionResult } from "./types";

/**
 * Le titulaire clique « Continuer vers le paiement » depuis son lien
 * d'activation : une session Checkout est créée pour CE lien, puis il est
 * envoyé chez Stripe. Le jeton vient de l'URL, pas d'un formulaire libre.
 */
export async function startCheckoutAction(token: string): Promise<ActionResult<never>> {
  const result = await startCheckoutForInvite(token);
  if (!result.ok) return fail(result.error);
  redirect(result.url);
}
