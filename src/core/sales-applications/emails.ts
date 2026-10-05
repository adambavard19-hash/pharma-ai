import { renderEmail, type EmailContext, type RenderedEmail } from "@/core/platform/email-layout";

/**
 * L'accusé de réception d'une candidature commerciale : sobre, sans promesse.
 * Il dit ce qui a été reçu et ce qu'il advient des informations ; il ne
 * promet ni réponse, ni délai, ni conditions. Rédigé ici, jamais par un
 * prestataire.
 */
export function buildSalesApplicationAcknowledgement(ctx: EmailContext, applicant: { firstName: string; hasCv: boolean }): RenderedEmail {
  const contact = ctx.company.contactEmail;
  return renderEmail(ctx, {
    subject: "Votre candidature à l'équipe commerciale PharmaBoost est bien reçue",
    preheader: "Notre équipe étudie votre candidature.",
    eyebrow: "PharmaBoost",
    title: "Votre candidature est bien reçue",
    greeting: `Bonjour ${applicant.firstName},`,
    blocks: [
      { kind: "paragraph", text: "Nous avons bien reçu votre candidature pour rejoindre l'équipe commerciale de PharmaBoost. Merci de l'intérêt que vous portez à notre projet." },
      { kind: "notice", text: "Notre équipe étudie chaque candidature. Si votre profil est retenu, nous vous contacterons pour un premier échange." },
      { kind: "note", text: `Vos informations${applicant.hasCv ? " et votre CV" : ""} servent uniquement à étudier votre candidature et à vous recontacter. Pour les faire supprimer, écrivez-nous à ${contact}.` },
    ],
    reason: "Vous recevez cet e-mail à la suite de votre candidature sur pharmaboost.app.",
  });
}
