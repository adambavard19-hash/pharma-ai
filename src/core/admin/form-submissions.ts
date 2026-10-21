/**
 * Les formulaires remplis sur le site, tels que l'accueil de la console les montre (fondateur, 21 oct. 2026 : « visible à
 * chaque fois que quelqu'un a rempli un formulaire, et je dois pouvoir cliquer dessus »). Ils sont lus dans les
 * notifications de l'équipe : chaque formulaire en écrit une, avec le lien vers ce qu'il a créé (dossier, candidature).
 */
export const FORM_NOTIFICATION_TYPES = ["SITE_LEAD", "SITE_SUBSCRIPTION", "SITE_SUBSCRIPTION_TO_MATCH", "PARTNER_APPLICATION", "SALES_APPLICATION", "REFERRAL_LEAD"] as const;

export type FormKind = { label: string; tone: "brand" | "info" | "warning" | "accent" | "success" | "neutral" };

/** Le nom du formulaire. Démonstration et recommandation écrivent le même type : le titre les départage. */
export function formKind(type: string, title: string): FormKind {
  switch (type) {
    case "SITE_LEAD":
      if (title.startsWith("Pharmacie recommandée")) return { label: "Pharmacie recommandée", tone: "accent" };
      if (title.startsWith("Démo")) return { label: "Démonstration", tone: "brand" };
      return { label: "Demande du site", tone: "info" };
    case "SITE_SUBSCRIPTION":
    case "SITE_SUBSCRIPTION_TO_MATCH":
      return { label: "Abonnement", tone: "success" };
    case "PARTNER_APPLICATION":
      return { label: "Partenariat", tone: "warning" };
    case "SALES_APPLICATION":
      return { label: "Candidature commerciale", tone: "info" };
    case "REFERRAL_LEAD":
      return { label: "Parrainage", tone: "neutral" };
    default:
      return { label: "Formulaire", tone: "neutral" };
  }
}
