import { renderEmail, type EmailBlock, type EmailContext, type RenderedEmail } from "@/core/platform/email-layout";

/**
 * L'e-mail de rappel de fin de cure, au nom de la pharmacie (module pur). Sobre et professionnel : la cure arrive à son terme,
 * le patient peut revenir la renouveler — si son pharmacien la lui conseille. Ni posologie, ni médicament, ni nom du patient.
 */

export type CureReminderPharmacy = { name: string; phone?: string | null; addressLine1?: string | null; addressLine2?: string | null; postalCode?: string | null; city?: string | null };

const clean = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();

export function buildCureReminder(input: { pharmacy: CureReminderPharmacy; productName: string; unsubscribeUrl: string }, ctx: EmailContext): RenderedEmail {
  const pharmacy = clean(input.pharmacy.name) || "votre pharmacie";
  const product = clean(input.productName).slice(0, 120) || "votre cure";
  const address = [clean(input.pharmacy.addressLine1), clean(input.pharmacy.addressLine2), [clean(input.pharmacy.postalCode), clean(input.pharmacy.city)].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const phone = clean(input.pharmacy.phone);
  const rows: Array<[string, string]> = [["Pharmacie", pharmacy], ...(address ? [["Adresse", address] as [string, string]] : []), ...(phone ? [["Téléphone", phone] as [string, string]] : [])];
  const blocks: EmailBlock[] = [
    { kind: "paragraph", text: `Votre cure de ${product} arrive bientôt à son terme : il vous en reste environ une semaine.`, strong: [product] },
    { kind: "paragraph", text: `Pensez à repasser à ${pharmacy} pour la renouveler. Votre pharmacien vous dira s'il est utile de la poursuivre, et pendant combien de temps.` },
    { kind: "details", title: "Votre pharmacie", rows },
    ...(address ? [{ kind: "button" as const, url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${pharmacy}, ${address}`)}`, label: "Voir l'itinéraire" }] : []),
    { kind: "note", text: "Ce message ne remplace ni l'avis de votre pharmacien, ni celui de votre médecin. En cas de doute, demandez conseil à votre pharmacie." },
  ];
  return renderEmail(ctx, {
    subject: `Votre cure de ${product} arrive à son terme`,
    preheader: `Il vous en reste environ une semaine : pensez à repasser à ${pharmacy}.`,
    eyebrow: "Rappel de fin de cure",
    title: "Votre cure arrive à son terme",
    greeting: "Bonjour,",
    blocks,
    signature: `L'équipe de ${pharmacy}`,
    reason: `Vous recevez ce rappel parce que vous avez accepté, au comptoir de ${pharmacy}, de recevoir votre bilan par e-mail. Votre adresse a servi à ce rappel et vient d'être effacée.`,
    unsubscribeUrl: input.unsubscribeUrl,
    unsubscribeLabel: "Ne plus recevoir de rappels de cure",
  });
}
