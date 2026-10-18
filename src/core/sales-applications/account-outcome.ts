/**
 * Ce que l'acceptation d'une candidature a fait de l'espace de l'affilié (son compte de l'extranet et son invitation),
 * en une phrase pour l'écran de la console et de l'espace du directeur. Pur : la forme suit `ConvertResult`
 * (`server/services/sales-applications/admin.ts`).
 */
export type AccountOutcome =
  | { ok: true; invitation: { status: string; detail: string } | null }
  | { ok: false; reason: string; detail?: string };

export function describeAccountOutcome(account: AccountOutcome | undefined): string {
  if (!account) return "";
  if (account.ok) {
    const invitation = account.invitation === null ? "aucune invitation envoyée" : account.invitation.status === "SENT" ? "invitation envoyée pour choisir son mot de passe" : `invitation NON envoyée : ${account.invitation.detail}`;
    return ` Espace de l'affilié créé (${invitation}).`;
  }
  if (account.reason === "ALREADY_CONVERTED") return " Son espace d'affilié existe déjà.";
  if (account.reason === "EMAIL_TAKEN") return " Espace NON créé : un compte existe déjà avec cette adresse e-mail.";
  return ` Espace NON créé${account.detail ? ` (${account.detail})` : ""} : utilisez « Créer l'espace de l'affilié ».`;
}

