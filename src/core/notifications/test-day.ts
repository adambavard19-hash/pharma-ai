import { renderEmail, type EmailContext, type RenderedEmail } from "@/core/platform/email-layout";

/**
 * L'e-mail de la JOURNÉE TEST (fondateur, 23 oct. 2026 : « envoie un mail à toute l'équipe de la pharmacie pour dire qu'aujourd'hui
 * (vendredi) ils commencent à tester tout le logiciel PharmaBoost ») : ce qu'il faut essayer au comptoir, et comment faire remonter
 * un souci. Les mêmes mots que les écrans (« Demander un conseil », « Terminer », « Contact support »).
 */
export type TestDayInput = { firstName: string; pharmacyName: string; dayLabel: string };

const capital = (text: string) => `${text[0]?.toUpperCase() ?? ""}${text.slice(1)}`;

export function buildTestDayEmail(input: TestDayInput, ctx: EmailContext): RenderedEmail {
  const day = capital(input.dayLabel);
  return renderEmail(ctx, {
    website: true,
    subject: "Aujourd'hui, on teste PharmaBoost au comptoir",
    preheader: `${day} : toute l'équipe essaie le logiciel PharmaBoost, de la première boîte scannée à la fin de la vente.`,
    eyebrow: "Journée test",
    title: `${day} : on teste PharmaBoost`,
    greeting: `Bonjour ${input.firstName},`,
    blocks: [
      {
        kind: "paragraph",
        text: `Aujourd'hui, toute l'équipe de ${input.pharmacyName} commence à tester l'ensemble du logiciel PharmaBoost. Vous travaillez comme d'habitude dans votre logiciel de gestion : PharmaBoost vous accompagne à chaque vente.`,
        strong: ["commence à tester l'ensemble du logiciel PharmaBoost"],
      },
      {
        kind: "steps",
        title: "À essayer aujourd'hui",
        items: [
          "Scannez les boîtes comme d'habitude : la bannière affiche le conseil, avec le stock, la marge, le challenge et la date courte.",
          "Cliquez sur la bannière : la Fiche (posologie, ce qu'il faut dire au patient), les Questions à poser, et l'Aide si le patient vous pose une question difficile.",
          "Sans scan : cliquez sur « Demander un conseil » et écrivez ce que le patient demande.",
          "Le patient prend le conseil ? Scannez le produit : il passe en « Vendu ».",
          "Finissez avec « Terminer » : proposez le bilan conseil par e-mail, puis indiquez qui a servi le patient.",
        ],
      },
      {
        kind: "notice",
        text: "Un souci, une idée, un conseil qui ne vous paraît pas juste ? Notez-le et dites-le à Donna, ou écrivez-nous depuis « Contact support », en bas du menu de votre espace PharmaBoost.",
      },
      { kind: "paragraph", text: "Merci à toute l'équipe, et bonne journée de test !" },
    ],
    reason: `Vous recevez cet e-mail en tant que membre de l'équipe de ${input.pharmacyName} sur PharmaBoost.`,
  });
}
