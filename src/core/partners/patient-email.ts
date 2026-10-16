import { renderEmail, type EmailContext, type RenderedEmail } from "@/core/platform/email-layout";

/**
 * L'e-mail partenaire envoyé au patient qui l'a accepté (17 oct. 2026) — module pur. La marque, son message, une image, un bouton
 * vers le lien d'affiliation (qui passe par PharmaBoost pour compter le clic), la mention « offre partenaire » et la désinscription.
 */

/** Le texte de l'accord, tel que le patient le coche (gardé avec l'accord, pour en faire la preuve). */
export const PARTNER_CONSENT_TEXT =
  "J'accepte de recevoir par e-mail, au plus une fois par semaine, des offres de marques partenaires de PharmaBoost (compléments alimentaires, dermocosmétique, hygiène…) choisies d'après les produits conseillés par ma pharmacie. Jamais de médicament. Je peux me désinscrire à tout moment, en un clic.";

export function buildPartnerEmail(input: { brand: string; brandLogo?: string | null; subject: string; body: string; imageUrl?: string | null; clickUrl: string; unsubscribeUrl: string }, ctx: EmailContext): RenderedEmail {
  const paragraphs = input.body.split(/\n{2,}/).map((part) => part.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 6);
  return renderEmail(ctx, {
    subject: input.subject,
    preheader: paragraphs[0]?.slice(0, 140) ?? input.subject,
    eyebrow: `Offre partenaire · ${input.brand}`,
    title: input.subject,
    greeting: "Bonjour,",
    blocks: [
      ...(input.imageUrl ? [{ kind: "image" as const, url: input.imageUrl, alt: input.brand }] : []),
      ...paragraphs.map((text) => ({ kind: "paragraph" as const, text })),
      { kind: "button", url: input.clickUrl, label: `Découvrir la gamme ${input.brand}` },
      { kind: "note", text: "Ces produits ne remplacent pas un traitement. Demandez conseil à votre pharmacien avant de les utiliser. Les médicaments ne font jamais l'objet de ces offres." },
    ],
    signature: "L'équipe PharmaBoost",
    reason: `Vous recevez cette offre de ${input.brand}, partenaire de PharmaBoost, parce que vous avez accepté de recevoir des offres de nos marques partenaires depuis le bilan envoyé par votre pharmacie. PharmaBoost peut percevoir une commission sur les achats faits par ce lien. Votre adresse n'est jamais transmise à la marque.`,
    unsubscribeUrl: input.unsubscribeUrl,
    unsubscribeLabel: "Ne plus recevoir d'offres partenaires",
  });
}
