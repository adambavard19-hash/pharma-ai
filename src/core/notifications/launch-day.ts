import { renderEmail, type EmailContext, type RenderedEmail } from "@/core/platform/email-layout";

/**
 * L'e-mail du JOUR J (fondateur, 18 oct. 2026) : « lundi, c'est le jour J pour commencer le logiciel » — encourager l'équipe à
 * l'utiliser, dire que chaque conseil fait est enregistré, et renvoyer vers la vidéo de prise en main de son espace. Deux versions :
 * le titulaire (son équipe, ses résultats) et le comptoir (pharmaciens et préparateurs).
 */
export type LaunchDayInput = { firstName: string; pharmacyName: string; owner: boolean; dayLabel: string };

export function buildLaunchDayEmail(input: LaunchDayInput, ctx: EmailContext): RenderedEmail {
  const base = ctx.baseUrl.replace(/\/+$/, "");
  const day = input.dayLabel;
  return renderEmail(ctx, {
    subject: `${day[0].toUpperCase()}${day.slice(1)}, c'est le jour J : PharmaBoost démarre au comptoir`,
    preheader: "Regardez la vidéo de 2 minutes, et à vous de jouer dès la première vente.",
    eyebrow: "Jour J",
    title: `${day[0].toUpperCase()}${day.slice(1)}, on démarre !`,
    greeting: `Bonjour ${input.firstName},`,
    blocks: [
      {
        kind: "paragraph",
        text: `À partir de ${day}, PharmaBoost devient le logiciel du comptoir de ${input.pharmacyName}. À chaque boîte scannée, la bannière vous propose le bon conseil : le produit, son prix, sa marge et son stock, deux questions à poser au patient et le conseil en deux phrases.`,
      },
      input.owner
        ? { kind: "paragraph", text: "Chaque conseil fait au comptoir est enregistré : vendu ou non, il compte dans les résultats de la pharmacie et dans ceux de chaque collaborateur. Vous les retrouvez dans Performances, et chaque matin dans votre bilan par e-mail.", strong: ["Chaque conseil fait au comptoir est enregistré"] }
        : { kind: "paragraph", text: "Chaque conseil que vous faites est enregistré : vendu ou non, il compte dans vos résultats. Vous les retrouvez chaque matin dans votre bilan par e-mail.", strong: ["Chaque conseil que vous faites est enregistré"] },
      input.owner
        ? { kind: "steps", title: "Pour bien démarrer lundi", items: ["Regardez votre vidéo de prise en main (2 minutes 40).", "Vérifiez que chaque poste du comptoir affiche « Connecté ».", "Montrez la vidéo du comptoir à votre équipe et encouragez chacun à proposer un conseil à chaque vente.", "En fin de journée, regardez les premiers résultats dans Performances."] }
        : { kind: "steps", title: "Pour bien démarrer lundi", items: ["Regardez la vidéo de prise en main (2 minutes).", "Au comptoir, scannez comme d'habitude : la bannière s'ouvre toute seule.", "Passez la souris sur un conseil, posez les deux questions, puis proposez.", "Le patient le prend ? Scannez le produit : il compte en vendu."] },
      { kind: "button", url: `${base}/prise-en-main`, label: "Voir la vidéo de prise en main" },
      {
        kind: "paragraph",
        text: input.owner
          ? "Les premiers jours font le réflexe : plus l'équipe propose, plus le conseil devient naturel, et plus vos patients repartent bien accompagnés."
          : "Les premiers jours font le réflexe : proposez un conseil à chaque vente, même quand vous hésitez. Vos patients repartent mieux accompagnés, et vous le voyez dans vos résultats.",
      },
      { kind: "paragraph", text: "Bon démarrage, et à lundi !" },
      { kind: "note", text: "Une question, un souci au comptoir ? Écrivez-nous depuis « Contact » en bas du menu de PharmaBoost, ou à contact@pharmaboost.app." },
    ],
    reason: `Vous recevez cet e-mail parce que vous faites partie de l'équipe de ${input.pharmacyName} sur PharmaBoost.`,
  });
}
