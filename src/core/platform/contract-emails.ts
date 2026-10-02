import { TIME_ZONE } from "@/config/constants";
import { eurosHt, renderEmail, trialLabel, type EmailBlock, type EmailContext, type RenderedEmail } from "./email-layout";

/**
 * Les e-mails du parcours contractuel, côté officine. Un message par étape
 * qui demande quelque chose au titulaire ou qui l'informe d'un fait acquis ;
 * les étapes internes (consultation, contre-signature en cours) restent dans
 * la console et ne lui écrivent pas.
 */

export type ContractEmailFacts = {
  ownerName: string;
  pharmacyName: string;
  legalName?: string | null;
  offerName?: string | null;
  monthlyPriceCents: number;
  durationMonths: number;
  trialDays: number;
  reference: string;
  /** Interlocuteur commercial, s'il y en a un. */
  contact?: { name: string; email: string; phone?: string | null } | null;
};

const longDate = (d: Date) => new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, day: "numeric", month: "long", year: "numeric" }).format(d);

function summary(f: ContractEmailFacts): EmailBlock {
  const rows: Array<[string, string]> = [["Pharmacie", f.pharmacyName]];
  if (f.legalName && f.legalName !== f.pharmacyName) rows.push(["Société", f.legalName]);
  rows.push(["Offre", f.offerName ?? "Abonnement PharmaBoost"]);
  rows.push(["Tarif", `${eurosHt(f.monthlyPriceCents)} par mois`]);
  const trial = trialLabel(f.trialDays);
  if (trial) rows.push(["Démarrage", trial]);
  rows.push(["Engagement", `${f.durationMonths} mois`]);
  rows.push(["Référence", f.reference]);
  return { kind: "details", title: "Votre contrat", rows };
}

function contactNote(f: ContractEmailFacts): EmailBlock[] {
  if (!f.contact) return [];
  return [{ kind: "note", text: `Votre interlocuteur : ${f.contact.name} — ${f.contact.email}${f.contact.phone ? ` — ${f.contact.phone}` : ""}.` }];
}

/** Demande de signature : l'e-mail le plus important du parcours. */
export function buildSignatureRequestEmail(ctx: EmailContext, f: ContractEmailFacts & { signingUrl: string | null; viewUrl: string; expiresAt: Date }): RenderedEmail {
  const actionUrl = f.signingUrl ?? f.viewUrl;
  return renderEmail(ctx, {
    subject: "Votre contrat PharmaBoost est prêt à être signé",
    preheader: `Contrat d'abonnement pour ${f.pharmacyName} : consultez-le et signez-le en ligne en quelques minutes.`,
    eyebrow: "Contrat d'abonnement",
    title: "Votre contrat est prêt à être signé",
    greeting: `Bonjour ${f.ownerName},`,
    blocks: [
      { kind: "paragraph", text: `Nous vous remercions de votre confiance. Le contrat d'abonnement PharmaBoost de ${f.pharmacyName} est prêt.`, strong: [f.pharmacyName] },
      { kind: "paragraph", text: f.signingUrl ? "Vous pouvez le consulter et le signer électroniquement, en toute sécurité, depuis votre ordinateur ou votre téléphone." : "Vous pouvez le consulter en ligne dès maintenant." },
      { kind: "button", url: actionUrl, label: f.signingUrl ? "Consulter et signer le contrat" : "Consulter le contrat" },
      summary(f),
      { kind: "paragraph", text: "Une fois votre signature apposée, PharmaBoost contresigne le contrat. Vous recevez alors la version signée par les deux parties, puis les prochaines étapes pour activer votre abonnement." },
      ...contactNote(f),
      { kind: "note", text: `Ce lien vous est personnel et reste valable jusqu'au ${longDate(f.expiresAt)}. La signature électronique est recueillie par notre prestataire DocuSeal ; chaque étape est horodatée.` },
      ...(f.signingUrl ? [{ kind: "link" as const, label: "Vous pouvez aussi relire le contrat ici :", url: f.viewUrl }] : []),
    ],
    reason: `Vous recevez cet e-mail en tant que représentant de ${f.pharmacyName}, à la suite de votre demande d'abonnement à PharmaBoost.`,
  });
}

/** Rappel courtois : jamais plus de deux. */
export function buildSignatureReminderEmail(ctx: EmailContext, f: ContractEmailFacts & { signingUrl: string | null; viewUrl: string; expiresAt: Date; reminderNumber: number }): RenderedEmail {
  const actionUrl = f.signingUrl ?? f.viewUrl;
  return renderEmail(ctx, {
    subject: f.reminderNumber > 1 ? `Votre contrat PharmaBoost attend toujours votre signature` : `Rappel : votre contrat PharmaBoost est prêt`,
    preheader: `Le contrat de ${f.pharmacyName} est disponible jusqu'au ${longDate(f.expiresAt)}.`,
    eyebrow: "Contrat d'abonnement",
    title: "Votre contrat attend votre signature",
    greeting: `Bonjour ${f.ownerName},`,
    blocks: [
      { kind: "paragraph", text: `Le contrat d'abonnement PharmaBoost de ${f.pharmacyName} vous attend. La signature ne prend que quelques minutes.`, strong: [f.pharmacyName] },
      { kind: "button", url: actionUrl, label: f.signingUrl ? "Consulter et signer le contrat" : "Consulter le contrat" },
      summary(f),
      { kind: "paragraph", text: "Une question sur une clause, le tarif ou la mise en service ? Répondez simplement à cet e-mail : nous revenons vers vous rapidement." },
      ...contactNote(f),
      { kind: "note", text: `Le lien reste valable jusqu'au ${longDate(f.expiresAt)}. Si vous avez déjà signé, ne tenez pas compte de ce message.` },
    ],
    reason: `Vous recevez ce rappel car le contrat de ${f.pharmacyName} n'est pas encore signé.`,
  });
}

/** Confirmation : la pharmacie a signé, PharmaBoost contresigne. */
export function buildPharmacySignedEmail(ctx: EmailContext, f: ContractEmailFacts & { signedAt: Date }): RenderedEmail {
  return renderEmail(ctx, {
    subject: "Nous avons bien reçu votre signature",
    preheader: `Merci : la signature du contrat de ${f.pharmacyName} est enregistrée. PharmaBoost contresigne.`,
    eyebrow: "Contrat d'abonnement",
    title: "Votre signature est enregistrée",
    greeting: `Bonjour ${f.ownerName},`,
    blocks: [
      { kind: "paragraph", text: `Nous avons bien reçu votre signature du contrat PharmaBoost pour ${f.pharmacyName}, le ${longDate(f.signedAt)}.`, strong: [f.pharmacyName] },
      { kind: "paragraph", text: "PharmaBoost contresigne à présent le contrat. Dès que c'est fait, vous recevez la version signée par les deux parties ; vous n'avez rien d'autre à faire d'ici là." },
      ...contactNote(f),
    ],
    reason: `Vous recevez cet e-mail en tant que signataire du contrat de ${f.pharmacyName}.`,
  });
}

/** Contrat finalisé : les deux signatures sont réunies. */
export function buildContractFinalizedEmail(ctx: EmailContext, f: ContractEmailFacts & { finalizedAt: Date; documentUrl: string }): RenderedEmail {
  return renderEmail(ctx, {
    subject: "Votre contrat PharmaBoost est signé",
    preheader: `Le contrat de ${f.pharmacyName} est signé par les deux parties. Voici la suite.`,
    eyebrow: "Contrat d'abonnement",
    title: "Votre contrat est signé",
    greeting: `Bonjour ${f.ownerName},`,
    blocks: [
      { kind: "paragraph", text: `Le contrat d'abonnement de ${f.pharmacyName} est signé par les deux parties depuis le ${longDate(f.finalizedAt)}. Bienvenue chez PharmaBoost.`, strong: [f.pharmacyName] },
      { kind: "button", url: f.documentUrl, label: "Télécharger le contrat signé" },
      summary(f),
      {
        kind: "steps",
        title: "Les prochaines étapes",
        items: [
          "Nous vous adressons le lien d'activation de votre abonnement.",
          "Dès l'abonnement activé, vous recevez vos accès à l'espace PharmaBoost.",
          "Un guide pas à pas vous accompagne pour la mise en service au comptoir.",
        ],
      },
      ...contactNote(f),
      { kind: "note", text: "Conservez ce contrat : il reste aussi disponible depuis votre espace PharmaBoost, rubrique Paramètres." },
    ],
    reason: `Vous recevez cet e-mail en tant que signataire du contrat de ${f.pharmacyName}.`,
  });
}

/** Demande reçue depuis le site, quand le contrat ne peut pas partir immédiatement. */
export function buildSubscriptionReceivedEmail(ctx: EmailContext, v: { ownerName: string; pharmacyName: string; nextStep: string }): RenderedEmail {
  return renderEmail(ctx, {
    subject: "Votre demande d'abonnement PharmaBoost est bien reçue",
    preheader: `Demande d'abonnement de ${v.pharmacyName} enregistrée.`,
    eyebrow: "Demande d'abonnement",
    title: "Votre demande est bien reçue",
    greeting: `Bonjour ${v.ownerName},`,
    blocks: [
      { kind: "paragraph", text: `Nous avons bien enregistré la demande d'abonnement de ${v.pharmacyName}.`, strong: [v.pharmacyName] },
      { kind: "paragraph", text: v.nextStep },
    ],
    reason: "Vous recevez cet e-mail à la suite de votre demande d'abonnement sur pharmaboost.app.",
  });
}

/** Confirmation de l'adresse avant tout envoi de contrat (demande faite sur le site). */
export function buildEmailConfirmationEmail(ctx: EmailContext, v: { ownerName: string; pharmacyName: string; confirmUrl: string }): RenderedEmail {
  return renderEmail(ctx, {
    subject: "Confirmez votre demande d'abonnement PharmaBoost",
    preheader: `Une confirmation, et le contrat de ${v.pharmacyName} vous est adressé.`,
    eyebrow: "Demande d'abonnement",
    title: "Confirmez votre adresse e-mail",
    greeting: `Bonjour ${v.ownerName},`,
    blocks: [
      { kind: "paragraph", text: `Nous avons bien reçu la demande d'abonnement de ${v.pharmacyName}. Pour vous adresser le contrat en toute sécurité, confirmez que cette adresse est bien la vôtre.`, strong: [v.pharmacyName] },
      { kind: "button", url: v.confirmUrl, label: "Confirmer et recevoir mon contrat" },
      { kind: "note", text: "Ce lien est valable 48 heures. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : aucun contrat ne sera envoyé." },
    ],
    reason: "Vous recevez cet e-mail à la suite d'une demande d'abonnement sur pharmaboost.app.",
  });
}

/** Une action est attendue du titulaire (information manquante, contrat expiré…). */
export function buildActionRequiredEmail(ctx: EmailContext, v: { ownerName: string; pharmacyName: string; title: string; message: string; actionUrl?: string | null; actionLabel?: string }): RenderedEmail {
  return renderEmail(ctx, {
    subject: `${v.title} — PharmaBoost`,
    preheader: v.message,
    eyebrow: v.pharmacyName,
    title: v.title,
    greeting: `Bonjour ${v.ownerName},`,
    blocks: [
      { kind: "notice", text: v.message, tone: "warning" },
      ...(v.actionUrl ? [{ kind: "button" as const, url: v.actionUrl, label: v.actionLabel ?? "Continuer" }] : []),
      { kind: "paragraph", text: "Une question ? Répondez à cet e-mail : nous vous aidons." },
    ],
    reason: `Vous recevez cet e-mail en tant que représentant de ${v.pharmacyName}.`,
  });
}

/**
 * Lien d'abonnement bancaire — prêt pour le jour où la banque fournira son
 * lien. Non branché : aucun mécanisme bancaire n'est simulé.
 */
export function buildBankSubscriptionLinkEmail(ctx: EmailContext, f: ContractEmailFacts & { subscriptionUrl: string }): RenderedEmail {
  const trial = trialLabel(f.trialDays);
  return renderEmail(ctx, {
    subject: "Activez votre abonnement PharmaBoost",
    preheader: `Dernière étape pour ${f.pharmacyName} : l'activation de l'abonnement.`,
    eyebrow: "Abonnement",
    title: "Activez votre abonnement",
    greeting: `Bonjour ${f.ownerName},`,
    blocks: [
      { kind: "paragraph", text: `Votre contrat est signé : il reste à activer l'abonnement de ${f.pharmacyName}. L'opération se fait sur la page sécurisée de notre banque.`, strong: [f.pharmacyName] },
      { kind: "button", url: f.subscriptionUrl, label: "Activer mon abonnement" },
      summary(f),
      ...(trial ? [{ kind: "notice" as const, text: `${trial} : aucun prélèvement n'intervient pendant cette période.` }] : []),
      ...contactNote(f),
    ],
    reason: `Vous recevez cet e-mail en tant que signataire du contrat de ${f.pharmacyName}.`,
  });
}
