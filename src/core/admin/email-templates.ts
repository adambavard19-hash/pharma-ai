import { renderEmail, type EmailBlock, type EmailContext, type RenderedEmail } from "@/core/platform/email-layout";

/**
 * Les modèles d'e-mails que l'équipe PharmaBoost peut réécrire depuis la
 * console : relances d'essai, de contrat, de paiement, résiliation, relance
 * commerciale, message libre.
 *
 * Ce qui reste figé, volontairement :
 *   - le gabarit (logo, pied de page légal, mise en forme) : `renderEmail` ;
 *   - le bouton d'action quand le modèle en exige un (lien de signature,
 *     espace PharmaBoost) : l'équipe en choisit le libellé dans le code, pas
 *     l'adresse — un lien ne peut pas être cassé par une saisie.
 *
 * Le texte modifié vit en base (`EmailTemplate`) ; sans ligne, c'est le
 * texte par défaut écrit ici qui part. Un modèle se compose d'un objet, d'un
 * titre et d'un corps en paragraphes séparés par une ligne vide, avec des
 * variables entre doubles accolades : {{officine}}.
 */

export type TemplateVariable = { key: string; label: string; sample: string };

export type EmailTemplateCategory = "Essai" | "Contrat" | "Abonnement" | "Paiement" | "Résiliation" | "Commercial" | "Message";

export type EmailTemplateDefinition = {
  key: string;
  label: string;
  category: EmailTemplateCategory;
  /** Quand ce modèle part : affiché dans le centre de modèles. */
  usage: string;
  /** À qui il s'adresse. */
  audience: "Titulaire" | "Prospect";
  variables: TemplateVariable[];
  defaults: { subject: string; title: string; body: string };
  /** Bouton ajouté par le système, toujours présent : l'adresse vient d'une variable. */
  button?: { label: string; urlVariable: string };
  /** Petit libellé au-dessus du titre. */
  eyebrow: string;
  /** Pourquoi ce message, en pied de page. */
  reason: string;
};

const V = {
  prenom: { key: "prenom", label: "Prénom du destinataire", sample: "Camille" },
  titulaire: { key: "titulaire", label: "Nom complet du destinataire", sample: "Camille Martin" },
  officine: { key: "officine", label: "Nom de l'officine", sample: "Pharmacie de la Passerelle" },
  offre: { key: "offre", label: "Offre souscrite", sample: "PharmaBoost Officine" },
  prix: { key: "prix", label: "Tarif contractuel mensuel HT", sample: "290 € HT" },
  finEssai: { key: "date_fin_essai", label: "Date de fin d'essai", sample: "12/11/2026" },
  joursRestants: { key: "jours_restants", label: "Jours d'essai restants", sample: "3" },
  lienEspace: { key: "lien_espace", label: "Lien vers l'espace PharmaBoost", sample: "https://pharmaboost.app/parametres?onglet=abonnement" },
  lienContrat: { key: "lien_contrat", label: "Lien de signature du contrat", sample: "https://pharmaboost.app/contrat/…" },
  dateEnvoiContrat: { key: "date_envoi_contrat", label: "Date d'envoi du contrat", sample: "05/10/2026" },
  montant: { key: "montant", label: "Montant de la facture", sample: "290 €" },
  dateEchec: { key: "date_echec", label: "Date de l'échec de paiement", sample: "08/10/2026" },
  dateFinPrevue: { key: "date_fin_prevue", label: "Date de fin prévue", sample: "31/12/2026" },
  dateDemande: { key: "date_demande", label: "Date de la demande", sample: "03/10/2026" },
  contact: { key: "contact", label: "Adresse de contact PharmaBoost", sample: "contact@pharmaboost.app" },
} satisfies Record<string, TemplateVariable>;

const COMMON = [V.prenom, V.titulaire, V.officine, V.contact];

export const EMAIL_TEMPLATES: EmailTemplateDefinition[] = [
  {
    key: "trial.welcome",
    label: "Essai — bienvenue",
    category: "Essai",
    usage: "Le lendemain du début de l'essai (règle « Bienvenue »).",
    audience: "Titulaire",
    variables: [...COMMON, V.offre, V.finEssai, V.lienEspace],
    defaults: {
      subject: "Bienvenue sur PharmaBoost, {{officine}}",
      title: "Bienvenue sur PharmaBoost",
      body: "Bonjour {{prenom}},\n\nVotre essai de PharmaBoost a commencé : toute l'équipe de {{officine}} peut dès maintenant scanner une ordonnance ou un produit et voir les conseils associés au comptoir.\n\nVotre essai court jusqu'au {{date_fin_essai}}. Si vous avez une question, répondez simplement à cet e-mail ou écrivez-nous à {{contact}}.",
    },
    button: { label: "Ouvrir PharmaBoost", urlVariable: "lien_espace" },
    eyebrow: "Essai gratuit",
    reason: "Vous recevez ce message parce que votre officine a démarré un essai de PharmaBoost.",
  },
  {
    key: "trial.onboarding",
    label: "Essai — accompagnement",
    category: "Essai",
    usage: "Une semaine après le début de l'essai (règle « Accompagnement »).",
    audience: "Titulaire",
    variables: [...COMMON, V.finEssai, V.lienEspace],
    defaults: {
      subject: "Votre première semaine avec PharmaBoost",
      title: "Une semaine avec PharmaBoost",
      body: "Bonjour {{prenom}},\n\nCela fait une semaine que {{officine}} utilise PharmaBoost. Pour en tirer le meilleur, vérifiez que chaque poste de comptoir est bien relié et que votre stock est à jour : les conseils proposés s'appuient sur les produits que vous avez réellement en rayon.\n\nNous pouvons faire le point avec vous en quinze minutes, par téléphone ou en visio. Répondez à cet e-mail pour choisir un créneau.",
    },
    button: { label: "Vérifier mon installation", urlVariable: "lien_espace" },
    eyebrow: "Essai gratuit",
    reason: "Vous recevez ce message parce que votre officine est en essai de PharmaBoost.",
  },
  {
    key: "trial.ending_soon",
    label: "Essai — rappel avant la fin",
    category: "Essai",
    usage: "Quelques jours avant la fin de l'essai (règle « Rappel de fin d'essai »).",
    audience: "Titulaire",
    variables: [...COMMON, V.offre, V.prix, V.finEssai, V.joursRestants, V.lienEspace],
    defaults: {
      subject: "Votre essai PharmaBoost se termine le {{date_fin_essai}}",
      title: "Votre essai se termine bientôt",
      body: "Bonjour {{prenom}},\n\nL'essai de PharmaBoost de {{officine}} se termine dans {{jours_restants}} jours, le {{date_fin_essai}}.\n\nVotre abonnement {{offre}} se poursuivra ensuite au tarif prévu de {{prix}} par mois. Vous pouvez vérifier votre moyen de paiement depuis votre espace.",
    },
    button: { label: "Voir mon abonnement", urlVariable: "lien_espace" },
    eyebrow: "Essai gratuit",
    reason: "Vous recevez ce message parce que l'essai de votre officine arrive à son terme.",
  },
  {
    key: "trial.ended",
    label: "Essai — fin d'essai sans abonnement",
    category: "Essai",
    usage: "Le jour de la fin d'un essai qui ne s'est pas poursuivi en abonnement (règle « Fin d'essai »).",
    audience: "Titulaire",
    variables: [...COMMON, V.offre, V.prix, V.finEssai, V.lienEspace],
    defaults: {
      subject: "Votre essai PharmaBoost est terminé",
      title: "Votre essai est terminé",
      body: "Bonjour {{prenom}},\n\nL'essai de PharmaBoost de {{officine}} s'est terminé le {{date_fin_essai}} sans que l'abonnement ne démarre.\n\nSi vous souhaitez continuer, votre offre {{offre}} reste disponible au tarif de {{prix}} par mois. Répondez à cet e-mail : nous vous aidons à la réactiver.",
    },
    button: { label: "Reprendre mon abonnement", urlVariable: "lien_espace" },
    eyebrow: "Abonnement",
    reason: "Vous recevez ce message parce que l'essai de votre officine est arrivé à son terme.",
  },
  {
    key: "contract.reminder",
    label: "Contrat — relance de signature",
    category: "Contrat",
    usage: "Relance d'un contrat envoyé et non signé : automatique selon la cadence des relances, ou depuis la console.",
    audience: "Titulaire",
    variables: [...COMMON, V.dateEnvoiContrat, V.lienContrat],
    defaults: {
      subject: "Rappel : votre contrat PharmaBoost attend votre signature",
      title: "Votre contrat attend votre signature",
      body: "Bonjour {{prenom}},\n\nLe contrat d'abonnement PharmaBoost de {{officine}}, envoyé le {{date_envoi_contrat}}, n'est pas encore signé.\n\nLa signature se fait en ligne en quelques minutes. Une question sur le contrat ? Répondez à cet e-mail.",
    },
    button: { label: "Signer mon contrat", urlVariable: "lien_contrat" },
    eyebrow: "Contrat d'abonnement",
    reason: "Vous recevez ce message parce qu'un contrat PharmaBoost attend votre signature.",
  },
  {
    key: "subscription.welcome",
    label: "Abonnement — confirmation",
    category: "Abonnement",
    usage: "Envoi manuel, depuis la fiche d'une officine.",
    audience: "Titulaire",
    variables: [...COMMON, V.offre, V.prix, V.lienEspace],
    defaults: {
      subject: "Votre abonnement PharmaBoost est actif",
      title: "Votre abonnement est actif",
      body: "Bonjour {{prenom}},\n\nL'abonnement {{offre}} de {{officine}} est actif, au tarif de {{prix}} par mois.\n\nMerci de votre confiance. Toute l'équipe reste disponible à {{contact}}.",
    },
    button: { label: "Ouvrir PharmaBoost", urlVariable: "lien_espace" },
    eyebrow: "Abonnement",
    reason: "Vous recevez ce message parce que votre officine est abonnée à PharmaBoost.",
  },
  {
    key: "payment.failed_reminder",
    label: "Paiement — relance après échec",
    category: "Paiement",
    usage: "Quelques jours après un paiement échoué resté impayé (règle « Première relance »).",
    audience: "Titulaire",
    variables: [...COMMON, V.montant, V.dateEchec, V.lienEspace],
    defaults: {
      subject: "Votre paiement PharmaBoost n'a pas abouti",
      title: "Un paiement n'a pas abouti",
      body: "Bonjour {{prenom}},\n\nLe prélèvement de {{montant}} pour l'abonnement PharmaBoost de {{officine}}, tenté le {{date_echec}}, n'a pas abouti.\n\nVous pouvez mettre à jour votre moyen de paiement depuis votre espace, en quelques secondes. Si c'est déjà fait, ignorez ce message.",
    },
    button: { label: "Mettre à jour mon moyen de paiement", urlVariable: "lien_espace" },
    eyebrow: "Paiement",
    reason: "Vous recevez ce message parce qu'un paiement de votre abonnement PharmaBoost a échoué.",
  },
  {
    key: "payment.unpaid_final",
    label: "Paiement — impayé, dernière relance",
    category: "Paiement",
    usage: "Une semaine après un paiement échoué toujours impayé (règle « Deuxième relance »).",
    audience: "Titulaire",
    variables: [...COMMON, V.montant, V.dateEchec, V.lienEspace],
    defaults: {
      subject: "Impayé : votre abonnement PharmaBoost",
      title: "Votre abonnement présente un impayé",
      body: "Bonjour {{prenom}},\n\nMalgré notre précédent message, le paiement de {{montant}} du {{date_echec}} reste impayé pour {{officine}}.\n\nMerci de régulariser depuis votre espace pour éviter toute interruption de service. Pour en parler, répondez à cet e-mail ou écrivez à {{contact}}.",
    },
    button: { label: "Régulariser mon paiement", urlVariable: "lien_espace" },
    eyebrow: "Paiement",
    reason: "Vous recevez ce message parce que votre abonnement PharmaBoost présente un impayé.",
  },
  {
    key: "cancellation.received",
    label: "Résiliation — accusé de réception",
    category: "Résiliation",
    usage: "À l'enregistrement d'une demande de résiliation (règle « Accusé de réception »), ou manuellement.",
    audience: "Titulaire",
    variables: [...COMMON, V.dateDemande],
    defaults: {
      subject: "Nous avons bien reçu votre demande de résiliation",
      title: "Demande de résiliation reçue",
      body: "Bonjour {{prenom}},\n\nNous avons bien reçu, le {{date_demande}}, la demande de résiliation de l'abonnement PharmaBoost de {{officine}}.\n\nNotre équipe la traite et revient vers vous pour vous confirmer la date de fin. Vos données restent accessibles d'ici là.",
    },
    eyebrow: "Résiliation",
    reason: "Vous recevez ce message parce qu'une demande de résiliation a été enregistrée pour votre officine.",
  },
  {
    key: "cancellation.confirmed",
    label: "Résiliation — confirmation",
    category: "Résiliation",
    usage: "À la confirmation d'une résiliation (règle « Confirmation »), ou manuellement.",
    audience: "Titulaire",
    variables: [...COMMON, V.dateFinPrevue],
    defaults: {
      subject: "Confirmation de la résiliation de votre abonnement PharmaBoost",
      title: "Votre résiliation est confirmée",
      body: "Bonjour {{prenom}},\n\nNous vous confirmons la résiliation de l'abonnement PharmaBoost de {{officine}}. Il prendra fin le {{date_fin_prevue}} ; d'ici là, le service reste pleinement accessible.\n\nMerci de votre confiance. Si vous changez d'avis, il suffit de nous répondre.",
    },
    eyebrow: "Résiliation",
    reason: "Vous recevez ce message parce que la résiliation de votre abonnement a été confirmée.",
  },
  {
    key: "commercial.followup",
    label: "Commercial — relance d'un prospect",
    category: "Commercial",
    usage: "Envoi manuel à un prospect, depuis la console.",
    audience: "Prospect",
    variables: [...COMMON],
    defaults: {
      subject: "PharmaBoost pour {{officine}}",
      title: "Faisons le point",
      body: "Bonjour {{prenom}},\n\nJe reviens vers vous au sujet de PharmaBoost pour {{officine}}. Avez-vous pu réfléchir à la démonstration et à la suite que vous souhaitez lui donner ?\n\nJe peux vous rappeler au moment qui vous convient : répondez simplement à cet e-mail.",
    },
    eyebrow: "PharmaBoost",
    reason: "Vous recevez ce message parce que vous avez échangé avec l'équipe PharmaBoost.",
  },
  {
    key: "generic.message",
    label: "Message libre",
    category: "Message",
    usage: "Envoi manuel depuis la console : objet et texte écrits au moment de l'envoi.",
    audience: "Titulaire",
    variables: [...COMMON],
    defaults: { subject: "Un message de l'équipe PharmaBoost", title: "Un message de l'équipe PharmaBoost", body: "Bonjour {{prenom}},\n\n…" },
    eyebrow: "PharmaBoost",
    reason: "Vous recevez ce message de la part de l'équipe PharmaBoost.",
  },
];

const BY_KEY = new Map(EMAIL_TEMPLATES.map((t) => [t.key, t]));

export function emailTemplate(key: string): EmailTemplateDefinition | null {
  return BY_KEY.get(key) ?? null;
}

export function isEmailTemplateKey(key: string): boolean {
  return BY_KEY.has(key);
}

export type TemplateText = { subject: string; title: string; body: string };

const VARIABLE = /\{\{\s*([a-z_]+)\s*\}\}/g;

/** Les variables citées dans un texte, sans doublon. */
export function variablesIn(text: string): string[] {
  return [...new Set([...text.matchAll(VARIABLE)].map((m) => m[1]))];
}

/** Les variables citées qui n'existent pas pour ce modèle : affichées en erreur, jamais envoyées. */
export function unknownVariables(definition: EmailTemplateDefinition, text: TemplateText): string[] {
  const allowed = new Set(definition.variables.map((v) => v.key));
  return variablesIn(`${text.subject}\n${text.title}\n${text.body}`).filter((key) => !allowed.has(key));
}

/** Contrôle d'une saisie de modèle : longueurs et variables. */
export function validateTemplateText(definition: EmailTemplateDefinition, text: TemplateText): { ok: true; value: TemplateText } | { ok: false; errors: Record<string, string> } {
  const value = { subject: text.subject.trim(), title: text.title.trim(), body: text.body.replace(/\r\n/g, "\n").trim() };
  const errors: Record<string, string> = {};
  if (value.subject.length < 3 || value.subject.length > 160) errors.subject = "L'objet doit compter entre 3 et 160 caractères.";
  if (value.title.length < 3 || value.title.length > 120) errors.title = "Le titre doit compter entre 3 et 120 caractères.";
  if (value.body.length < 10 || value.body.length > 5000) errors.body = "Le texte doit compter entre 10 et 5 000 caractères.";
  const unknown = unknownVariables(definition, value);
  if (unknown.length) errors.body = `Variable inconnue pour ce modèle : ${unknown.map((k) => `{{${k}}}`).join(", ")}.`;
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

/** Remplace les variables connues ; une variable sans valeur devient une chaîne vide (jamais « {{x}} » chez le client). */
export function fillVariables(text: string, values: Record<string, string | null | undefined>): string {
  return text.replace(VARIABLE, (_, key: string) => values[key] ?? "");
}

/** Les valeurs d'exemple d'un modèle, pour l'aperçu : toujours présentées comme un exemple. */
export function sampleValues(definition: EmailTemplateDefinition): Record<string, string> {
  return Object.fromEntries(definition.variables.map((v) => [v.key, v.sample]));
}

/**
 * Le message final, dans le gabarit PharmaBoost : corps en paragraphes, puis
 * le bouton imposé par le modèle s'il a une adresse.
 */
export function renderTemplateEmail(ctx: EmailContext, definition: EmailTemplateDefinition, text: TemplateText, values: Record<string, string | null | undefined>): RenderedEmail {
  const paragraphs = fillVariables(text.body, values)
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
  const blocks: EmailBlock[] = paragraphs.map((p) => ({ kind: "paragraph", text: p }));
  const url = definition.button ? values[definition.button.urlVariable] : null;
  if (definition.button && url) blocks.push({ kind: "button", url, label: definition.button.label });
  return renderEmail(ctx, {
    subject: fillVariables(text.subject, values).trim(),
    preheader: paragraphs[1] ?? paragraphs[0] ?? "",
    eyebrow: definition.eyebrow,
    title: fillVariables(text.title, values).trim(),
    blocks,
    reason: definition.reason,
  });
}

/**
 * Les e-mails transactionnels du système, écrits dans le code : listés dans
 * le centre de modèles pour savoir ce qui part, quand et à qui. Ils ne se
 * modifient pas depuis la console (liens de signature, accès, sécurité).
 */
export const SYSTEM_EMAILS: { label: string; trigger: string; recipient: string }[] = [
  { label: "Invitation à créer son espace", trigger: "Invitation d'un titulaire depuis la console", recipient: "Titulaire invité" },
  { label: "Dossier d'inscription reçu", trigger: "Formulaire d'inscription complété", recipient: "Titulaire" },
  { label: "Accès à l'espace (bienvenue, nouveau mot de passe)", trigger: "Création d'officine, renvoi d'accès, mot de passe oublié", recipient: "Membre de l'officine" },
  { label: "Demande de signature du contrat", trigger: "Envoi du contrat", recipient: "Signataire de l'officine" },
  { label: "Contrat signé par l'officine, puis finalisé", trigger: "Signature électronique", recipient: "Signataire de l'officine" },
  { label: "Confirmation d'adresse avant contrat", trigger: "Souscription depuis le site", recipient: "Demandeur" },
  { label: "Lien d'activation de l'abonnement", trigger: "Envoi du lien de paiement depuis la console", recipient: "Titulaire" },
  { label: "Abonnement démarré et guide d'installation", trigger: "Premier paiement ou début d'essai chez Stripe", recipient: "Titulaire" },
  { label: "Paiement échoué", trigger: "Notification Stripe d'échec de paiement", recipient: "Titulaire" },
  { label: "Fin d'essai annoncée par Stripe", trigger: "Notification Stripe trois jours avant la fin d'essai", recipient: "Titulaire" },
  { label: "Accusé de réception d'une demande de démonstration", trigger: "Formulaire du site", recipient: "Demandeur" },
  { label: "Lien de connexion de l'équipe et des commerciaux", trigger: "Création de compte, mot de passe oublié", recipient: "Administrateur, commercial" },
];
