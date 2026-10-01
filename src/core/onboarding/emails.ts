import { renderEmail, type EmailContext, type RenderedEmail } from "@/core/platform/email-layout";

/** L'invitation : un titre, deux lignes, un bouton. */
export function buildPharmacyInvitationEmail(ctx: EmailContext, v: { url: string; expiresAt: Date }): RenderedEmail {
  const until = v.expiresAt.toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" });
  return renderEmail(ctx, {
    subject: "Bienvenue chez PharmaBoost : configurez votre officine",
    preheader: "Votre espace PharmaBoost est prêt à être configuré.",
    eyebrow: "Invitation",
    title: "Bienvenue chez PharmaBoost",
    greeting: "Bonjour,",
    blocks: [
      { kind: "paragraph", text: "Votre espace PharmaBoost est prêt à être configuré." },
      { kind: "paragraph", text: "Complétez les informations de votre officine pour finaliser votre inscription : quelques minutes suffisent." },
      { kind: "button", url: v.url, label: "Configurer mon officine" },
      { kind: "note", text: `Ce lien personnel est valable jusqu'au ${until}. Il ne fonctionne qu'une fois le dossier enregistré.` },
    ],
    reason: "Vous recevez cet e-mail parce que PharmaBoost vous a invité à inscrire votre officine.",
  });
}

/** Accusé : le dossier est complet, la suite est annoncée. */
export function buildDossierReceivedEmail(ctx: EmailContext, v: { ownerName: string; pharmacyName: string }): RenderedEmail {
  return renderEmail(ctx, {
    subject: `${v.pharmacyName} : votre dossier PharmaBoost est complet`,
    preheader: "Vos informations sont enregistrées. Votre contrat suit.",
    eyebrow: v.pharmacyName,
    title: "Votre dossier est complet",
    greeting: `Bonjour ${v.ownerName},`,
    blocks: [
      { kind: "paragraph", text: `Les informations de ${v.pharmacyName} sont bien enregistrées.`, strong: [v.pharmacyName] },
      { kind: "paragraph", text: "Votre contrat d'abonnement, prérempli avec ces informations, vous sera adressé par e-mail pour une signature en ligne." },
    ],
    reason: `Vous recevez cet e-mail en tant que représentant de ${v.pharmacyName}.`,
  });
}
