import { renderEmail, type EmailContext, type RenderedEmail } from "@/core/platform/email-layout";

/**
 * L'e-mail du JOUR J (fondateur, 18 oct. 2026) : le jour où la pharmacie commence avec PharmaBoost. Court, et une idée en avant : ça
 * SOULAGE le pharmacien — il voit beaucoup de patients, et sans y réfléchir il a le bon conseil en une seconde, choisi selon le stock,
 * les dates courtes, les challenges et les laboratoires préférés du titulaire. Puis : chaque conseil est enregistré, et la vidéo de
 * prise en main. Deux versions : le titulaire (son équipe) et le comptoir (pharmaciens et préparateurs).
 */
export type LaunchDayInput = { firstName: string; pharmacyName: string; owner: boolean; dayLabel: string };

const capital = (text: string) => `${text[0]?.toUpperCase() ?? ""}${text.slice(1)}`;

export function buildLaunchDayEmail(input: LaunchDayInput, ctx: EmailContext): RenderedEmail {
  const base = ctx.baseUrl.replace(/\/+$/, "");
  const day = capital(input.dayLabel);
  return renderEmail(ctx, {
    subject: input.owner ? `${day}, votre équipe démarre PharmaBoost` : `${day} : le bon conseil en 1 seconde, sans y penser`,
    preheader: input.owner ? "Le bon conseil en 1 seconde pour toute l'équipe, selon vos stocks et vos laboratoires." : "Vous voyez beaucoup de patients : PharmaBoost vous soulage dès la première vente.",
    eyebrow: "Jour J",
    title: `${day}, on démarre !`,
    greeting: `Bonjour ${input.firstName},`,
    blocks: [
      {
        kind: "paragraph",
        text: input.owner
          ? "Votre équipe voit beaucoup de patients chaque jour. PharmaBoost la soulage : à chaque boîte scannée, le bon conseil s'affiche en 1 seconde, sans avoir à y réfléchir."
          : "Vous voyez beaucoup de patients chaque jour. PharmaBoost vous soulage : à chaque boîte scannée, le bon conseil s'affiche en 1 seconde, sans avoir à y réfléchir.",
        strong: ["le bon conseil s'affiche en 1 seconde"],
      },
      {
        kind: "list",
        title: "Choisi pour vous, selon :",
        items: input.owner
          ? ["le stock de la pharmacie", "les dates courtes à écouler", "les challenges en cours", "les laboratoires que vous avez choisis"]
          : ["le stock de la pharmacie", "les dates courtes à écouler", "les challenges en cours", "les laboratoires choisis par votre titulaire"],
      },
      {
        kind: "notice",
        text: input.owner
          ? "Chaque conseil fait au comptoir est enregistré : vous voyez qui propose et ce qui se vend, dans Performances et dans votre bilan du matin."
          : "Chaque conseil que vous faites est enregistré : il compte dans vos résultats, que vous recevez chaque matin.",
      },
      { kind: "button", url: `${base}/prise-en-main`, label: input.owner ? "Voir la vidéo (2 min 40)" : "Voir la vidéo (2 min)" },
      input.owner
        ? { kind: "paragraph", text: "Avant le jour J : vérifiez que vos postes affichent « Connecté », et partagez la vidéo du comptoir à votre équipe. Bon démarrage !" }
        : { kind: "paragraph", text: "Au comptoir, scannez comme d'habitude : la bannière fait le reste. Bon démarrage !" },
    ],
    reason: `Vous recevez cet e-mail parce que vous faites partie de l'équipe de ${input.pharmacyName} sur PharmaBoost.`,
  });
}
