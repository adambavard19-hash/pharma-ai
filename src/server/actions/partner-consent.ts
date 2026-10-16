"use server";

import { givePartnerConsent, withdrawPartnerConsent } from "@/server/services/partner-emails";
import { fail, ok, type ActionResult } from "./types";

/** L'accord du patient pour les offres partenaires : la case cochée, puis le bouton. Rien sans la case. */
export async function partnerConsentAction(_previous: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  const result = await givePartnerConsent(String(formData.get("token") ?? ""), formData.get("accord") === "oui");
  return result.ok ? ok(null, "C'est noté.") : fail(result.error);
}

export async function partnerWithdrawAction(_previous: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  return (await withdrawPartnerConsent(String(formData.get("token") ?? ""))) ? ok(null, "C'est noté.") : fail("Ce lien n'est plus valable.");
}
